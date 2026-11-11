"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { useActiveTenant } from "@/components/tenant-context";
import styles from "./erp-native-inventory.module.css";

type Item = { id:string; sku:string; name:string; item_type:string; unit:string; on_hand:number; reserved:number; reorder_level:number; cost_per_unit:number|null; category:string|null; active:boolean; product_id:string|null };
type Warehouse = {id:string;code:string;name:string;active:boolean};
type StockLocation = {inventory_item_id:string;warehouse_id:string;on_hand:number;reserved:number};
type Movement = {id:string;inventory_item_id:string;movement_type:string;quantity:number;notes:string|null;created_at:string;warehouse_id:string|null};
type Product = {id:string;sku:string;name:string};
type Draft = {id:string|null;sku:string;name:string;item_type:string;unit:string;cost_per_unit:string;reorder_level:string;category:string;active:boolean;product_id:string};
const emptyDraft:Draft={id:null,sku:"",name:"",item_type:"other",unit:"unit",cost_per_unit:"",reorder_level:"0",category:"",active:true,product_id:""};
const labels:Record<string,string>={entry:"Entrada",exit:"Salida",reserve:"Reserva",release:"Liberación",consume:"Consumo de reserva",transfer:"Transferencia"};
const number=new Intl.NumberFormat("es-DO",{maximumFractionDigits:4});
function failure(message:string){
 if(/insufficient|negative/i.test(message))return "Existencias insuficientes. Comprueba el disponible y las reservas del almacén.";
 if(/permission|forbidden|unauthorized|tenant|access denied/i.test(message))return "El servidor no autorizó esta operación para la empresa y el usuario actuales.";
 if(/schema cache|does not exist|could not find/i.test(message))return "El inventario nativo todavía no está habilitado en esta base de datos.";
 return "No se pudo completar la operación. Revisa los datos y vuelve a intentarlo. Conserva los mismos datos si se interrumpió la conexión.";
}
export default function ErpNativeInventory(){
 const tenant=useActiveTenant();
 if(!tenant)return <div className="notice" role="alert">Selecciona una empresa para consultar su inventario.</div>;
 return <Inventory key={tenant.tenant_id} tenantId={tenant.tenant_id} tenantName={tenant.tenant_name}/>;
}
function Inventory({tenantId,tenantName}:{tenantId:string;tenantName:string}){
 const [items,setItems]=useState<Item[]>([]),[warehouses,setWarehouses]=useState<Warehouse[]>([]),[locations,setLocations]=useState<StockLocation[]>([]),[movements,setMovements]=useState<Movement[]>([]),[products,setProducts]=useState<Product[]>([]);
 const [canOperate,setCanOperate]=useState(false),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [search,setSearch]=useState(""),[lowOnly,setLowOnly]=useState(false),[itemCount,setItemCount]=useState(0),[draft,setDraft]=useState<Draft|null>(null);
 const [move,setMove]=useState({itemId:"",kind:"entry",amount:"",warehouseId:"",destinationId:"",unitCost:"",notes:""});
 const [warehouseDraft,setWarehouseDraft]=useState({code:"",name:""});
 const mounted=useRef(true),lock=useRef(false),revision=useRef(0);
 const keys=useRef(new Map<string,{payload:string;key:string}>());
 const load=useCallback(async()=>{
  const current=++revision.current;setLoading(true);
  const [i,w,l,m,p,a]=await Promise.all([
   supabase.from("inventory_items").select("id,sku,name,item_type,unit,on_hand,reserved,reorder_level,cost_per_unit,category,active,product_id",{count:"exact"}).eq("tenant_id",tenantId).order("name").limit(500),
   supabase.from("inventory_warehouses").select("id,code,name,active").eq("tenant_id",tenantId).order("name").limit(500),
   supabase.from("inventory_stock_locations").select("inventory_item_id,warehouse_id,on_hand,reserved").eq("tenant_id",tenantId).limit(10000),
   supabase.from("inventory_movements").select("id,inventory_item_id,movement_type,quantity,notes,created_at,warehouse_id").eq("tenant_id",tenantId).order("created_at",{ascending:false}).limit(100),
   supabase.from("products").select("id,sku,name").eq("tenant_id",tenantId).eq("status","active").order("name").limit(500),
   supabase.rpc("tenant_current_permissions",{p_tenant_id:tenantId}),
  ]);
  if(!mounted.current||current!==revision.current)return;
  const failed=[i,w,l,m,p,a].find(result=>result.error)?.error;
  if(failed){setCanOperate(false);setError(failure(failed.message));setLoading(false);return;}
  setItems((i.data??[]) as Item[]);setItemCount(i.count??0);setWarehouses((w.data??[]) as Warehouse[]);setLocations((l.data??[]) as StockLocation[]);setMovements((m.data??[]) as Movement[]);setProducts((p.data??[]) as Product[]);
  const permissions=a.data as Record<string,unknown>|null;
  setCanOperate(permissions?.all===true||permissions?.operations===true);setError("");setLoading(false);
 },[tenantId]);
 useEffect(()=>{mounted.current=true;void load().catch(()=>{if(mounted.current){setLoading(false);setCanOperate(false);setError("No se pudo cargar el inventario.");}});return()=>{mounted.current=false;++revision.current;};},[load]);
 async function mutate(action:string,payload:Record<string,unknown>,success:()=>void,message:string){
  if(!canOperate||lock.current)return;lock.current=true;setBusy(true);setError("");setNotice("");
  const serialized=JSON.stringify(payload),previous=keys.current.get(action);
  const key=previous?.payload===serialized?previous.key:crypto.randomUUID();
  keys.current.set(action,{payload:serialized,key});
  try{
   const result=await supabase.rpc(action,{...payload,p_idempotency_key:key});
   if(!mounted.current)return;
   if(result.error){setError(failure(result.error.message));return;}
   keys.current.delete(action);success();setNotice(message);await load();
  }catch{if(mounted.current)setError("La conexión se interrumpió. Reintenta con los mismos datos para confirmar la solicitud sin duplicarla.");}
  finally{lock.current=false;if(mounted.current)setBusy(false);}
 }
 function saveItem(event:FormEvent){event.preventDefault();if(!draft)return;const {id,...fields}=draft;void mutate("erp_inventory_item_save",{p_tenant_id:tenantId,p_item_id:id,p_payload:{...fields,sku:fields.sku.trim(),name:fields.name.trim(),category:fields.category.trim()||null,cost_per_unit:fields.cost_per_unit||null,product_id:fields.product_id||null}},()=>setDraft(null),"Artículo guardado.");}
 function saveMove(event:FormEvent){event.preventDefault();void mutate("erp_inventory_move",{p_tenant_id:tenantId,p_item_id:move.itemId,p_movement_type:move.kind,p_quantity:move.amount,p_warehouse_id:move.warehouseId||null,p_to_warehouse_id:move.kind==="transfer"?move.destinationId||null:null,p_unit_cost:move.kind==="entry"&&move.unitCost?move.unitCost:null,p_notes:move.notes.trim()||null},()=>setMove(current=>({...current,amount:"",notes:"",unitCost:""})),"Movimiento confirmado. Existencias e historial actualizados en una transacción.");}
 const low=items.filter(item=>item.active&&Number(item.on_hand)-Number(item.reserved)<=Number(item.reorder_level));
 const visible=items.filter(item=>(!lowOnly||low.includes(item))&&`${item.sku} ${item.name} ${item.category??""}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
 return <div className="stack gap-16">
  <header className={styles.header}><div><div className="eyebrow">Empresia · {tenantName}</div><h2>Inventario</h2><p className="muted">Artículos, existencias por almacén y movimientos de tu empresa.</p></div><div className={styles.actions}><Link className="button" href="/crm/erp">ERP</Link><button type="button" className="button" disabled={loading||busy} onClick={()=>void load().catch(()=>setError("No se pudo actualizar el inventario."))}>Actualizar</button>{canOperate&&<button type="button" className="button primary" disabled={busy} onClick={()=>setDraft({...emptyDraft})}>Nuevo artículo</button>}</div></header>
  {error&&<div className="notice" role="alert">{error}</div>}{notice&&<div className="notice" role="status">{notice}</div>}{loading&&<p role="status">Consultando existencias…</p>}
  <section className={styles.summary} aria-label="Resumen del inventario"><div className="card"><span className="muted">Artículos registrados</span><strong>{itemCount}</strong></div><div className="card"><span className="muted">Alertas en artículos visibles</span><strong>{low.length}</strong></div><div className="card"><span className="muted">Almacenes activos</span><strong>{warehouses.filter(w=>w.active).length||"Principal"}</strong></div></section>
  {draft&&canOperate&&<form className="card" onSubmit={saveItem}><h2>{draft.id?"Editar artículo":"Registrar artículo"}</h2><fieldset disabled={busy} style={{border:0,padding:0,minWidth:0}}><div className="form-grid">
   <label>SKU<input required maxLength={100} value={draft.sku} onChange={e=>setDraft({...draft,sku:e.target.value})}/></label><label>Nombre<input required maxLength={200} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
   <label>Categoría<input maxLength={100} value={draft.category} onChange={e=>setDraft({...draft,category:e.target.value})}/></label><label>Tipo<select value={draft.item_type} onChange={e=>setDraft({...draft,item_type:e.target.value})}><option value="other">Otro</option><option value="blank">Artículo base</option><option value="material">Material</option><option value="packaging">Empaque</option><option value="consumable">Consumible</option></select></label>
   <label>Unidad<input required maxLength={40} value={draft.unit} onChange={e=>setDraft({...draft,unit:e.target.value})}/></label><label>Costo unitario<input type="number" min="0" step="0.0001" value={draft.cost_per_unit} onChange={e=>setDraft({...draft,cost_per_unit:e.target.value})}/></label>
   <label>Stock mínimo<input required type="number" min="0" step="0.0001" value={draft.reorder_level} onChange={e=>setDraft({...draft,reorder_level:e.target.value})}/></label><label>Producto de ventas vinculado<select value={draft.product_id} onChange={e=>setDraft({...draft,product_id:e.target.value})}><option value="">Sin vínculo</option>{products.map(p=><option key={p.id} value={p.id}>{p.sku} · {p.name}</option>)}</select></label>
   <label className={styles.check}><input type="checkbox" checked={draft.active} onChange={e=>setDraft({...draft,active:e.target.checked})}/> Artículo activo</label>
  </div><div className={styles.actions} style={{marginTop:16}}><button className="button primary" type="submit">Guardar artículo</button><button className="button" type="button" onClick={()=>setDraft(null)}>Cancelar</button></div></fieldset></form>}
  <section className="card" aria-labelledby="inventory-items-title"><h2 id="inventory-items-title">Artículos y existencias</h2><div className="form-grid"><label>Buscar por SKU, nombre o categoría<input type="search" value={search} onChange={e=>setSearch(e.target.value)}/></label><label className={styles.check}><input type="checkbox" checked={lowOnly} onChange={e=>setLowOnly(e.target.checked)}/> Solo alertas de stock mínimo</label></div>{itemCount>items.length&&<p className="muted">Se muestran los primeros {items.length} de {itemCount} artículos, ordenados por nombre.</p>}
   <div className={styles.list}>{visible.map(item=><article className={styles.item} key={item.id}><div className={styles.itemHeader}><div><h3>{item.name}</h3><div className="muted">{item.sku} · {item.category||"Sin categoría"} · {item.unit}{!item.active?" · Inactivo":""}</div></div>{canOperate&&<button type="button" className="button small" disabled={busy} onClick={()=>setDraft({id:item.id,sku:item.sku,name:item.name,item_type:item.item_type,unit:item.unit,cost_per_unit:item.cost_per_unit===null?"":String(item.cost_per_unit),reorder_level:String(item.reorder_level),category:item.category??"",active:item.active,product_id:item.product_id??""})}>Editar</button>}</div>
    <dl className={styles.balances}><div><dt>Existencias</dt><dd>{number.format(Number(item.on_hand))}</dd></div><div><dt>Reservadas</dt><dd>{number.format(Number(item.reserved))}</dd></div><div><dt>Disponibles</dt><dd>{number.format(Number(item.on_hand)-Number(item.reserved))}</dd></div></dl><p className="muted">Mínimo {number.format(Number(item.reorder_level))} · Costo unitario {item.cost_per_unit===null?"sin definir":number.format(Number(item.cost_per_unit))}</p>{low.includes(item)&&<p className={styles.alert}>Stock disponible en el mínimo o por debajo.</p>}
    {locations.filter(l=>l.inventory_item_id===item.id).map(l=><div className={styles.stockLocation} key={l.warehouse_id}>{warehouses.find(w=>w.id===l.warehouse_id)?.name??"Almacén"}: {number.format(Number(l.on_hand)-Number(l.reserved))} disponibles · {number.format(Number(l.reserved))} reservadas</div>)}
    {canOperate&&item.active&&<button type="button" className="button small" disabled={busy} style={{marginTop:10}} onClick={()=>{setMove(current=>({...current,itemId:item.id}));document.getElementById("inventory-movement")?.scrollIntoView({behavior:"smooth",block:"start"});}}>Registrar movimiento</button>}
   </article>)}</div>{!loading&&visible.length===0&&<p className="muted">{items.length?"No hay artículos que coincidan con el filtro.":"Aún no hay artículos registrados en esta empresa."}</p>}
  </section>
  {canOperate&&<form className="card" id="inventory-movement" onSubmit={saveMove}><h2>Registrar movimiento</h2><p className="muted">Las salidas utilizan existencias disponibles. El consumo utiliza una reserva previa. Las transferencias conservan el total de la empresa.</p><fieldset disabled={busy} style={{border:0,padding:0,minWidth:0}}><div className="form-grid">
   <label>Artículo<select required value={move.itemId} onChange={e=>setMove({...move,itemId:e.target.value})}><option value="">Seleccionar artículo</option>{items.filter(i=>i.active).map(i=><option key={i.id} value={i.id}>{i.sku} · {i.name}</option>)}</select></label><label>Operación<select value={move.kind} onChange={e=>setMove({...move,kind:e.target.value})}>{Object.entries(labels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
   <label>Cantidad<input type="number" required min="0.0001" step="0.0001" value={move.amount} onChange={e=>setMove({...move,amount:e.target.value})}/></label><label>{move.kind==="transfer"?"Almacén de origen":"Almacén"}<select value={move.warehouseId} onChange={e=>setMove({...move,warehouseId:e.target.value})}><option value="">Principal (predeterminado)</option>{warehouses.filter(w=>w.active).map(w=><option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}</select></label>
   {move.kind==="transfer"&&<label>Almacén de destino<select required value={move.destinationId} onChange={e=>setMove({...move,destinationId:e.target.value})}><option value="">Seleccionar destino</option>{warehouses.filter(w=>w.active&&w.id!==move.warehouseId).map(w=><option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}</select></label>}{move.kind==="entry"&&<label>Costo unitario de esta entrada<input type="number" min="0" step="0.0001" value={move.unitCost} onChange={e=>setMove({...move,unitCost:e.target.value})}/></label>}
   <label>Motivo o referencia<input maxLength={1000} value={move.notes} onChange={e=>setMove({...move,notes:e.target.value})}/></label>
  </div><button type="submit" className="button primary" style={{marginTop:16}} disabled={!move.itemId}>Confirmar movimiento</button></fieldset></form>}
  {canOperate&&<form className="card" onSubmit={event=>{event.preventDefault();void mutate("erp_inventory_warehouse_create",{p_tenant_id:tenantId,p_code:warehouseDraft.code.trim(),p_name:warehouseDraft.name.trim()},()=>setWarehouseDraft({code:"",name:""}),"Almacén registrado.");}}><h2>Registrar almacén</h2><fieldset disabled={busy} style={{border:0,padding:0,minWidth:0}}><div className="form-grid"><label>Código<input required maxLength={60} value={warehouseDraft.code} onChange={e=>setWarehouseDraft({...warehouseDraft,code:e.target.value})}/></label><label>Nombre<input required maxLength={160} value={warehouseDraft.name} onChange={e=>setWarehouseDraft({...warehouseDraft,name:e.target.value})}/></label></div><button type="submit" className="button" style={{marginTop:16}}>Crear almacén</button></fieldset></form>}
  <section className="card" aria-labelledby="inventory-history-title"><h2 id="inventory-history-title">Historial de movimientos</h2><p className="muted">Últimos 100 movimientos de esta empresa.</p><ul className={styles.history}>{movements.map(m=><li key={m.id}><div><strong>{items.find(i=>i.id===m.inventory_item_id)?.name??"Artículo"} · {labels[m.movement_type]??m.movement_type}</strong><small>{new Date(m.created_at).toLocaleString("es-DO")} · {warehouses.find(w=>w.id===m.warehouse_id)?.name??"Principal"}</small>{m.notes&&<small>{m.notes}</small>}</div><strong>{number.format(Number(m.quantity))}</strong></li>)}</ul>{!loading&&movements.length===0&&<p className="muted">Aún no hay movimientos.</p>}</section>
 </div>;
}

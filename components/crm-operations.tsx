"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import ErpNativeCommercial from "@/components/erp-native-commercial";
import {commercialMoney} from "@/lib/erp-native/commercial-document";

type Order = {
  id: string; order_number: string; quotation_id: string | null; contact_id: string | null;
  status: string; currency: string; total: string; amount_paid: string; committed_at: string | null; created_at: string;
};
type Quote = { id: string; quote_number: string; status: string; total: number; contact_id: string | null; company_id: string | null; opportunity_id: string | null };
type Job = { id: string; order_id: string; status: string; priority: number; technique: string | null; design_approved: boolean; quality_control_status: string | null };
type Delivery = { id: string; order_id: string; status: string; delivery_zone: string | null; delivery_address: string | null; shipping_cost: number | null; scheduled_at: string | null };
type Settings = { brand_name: string | null; currency: string; timezone: string };

export default function CrmOperations({ tenantId }: { tenantId: string }) {
  return <Operations key={tenantId} tenantId={tenantId}/>;
}
function Operations({tenantId}:{tenantId:string}){
  const [orders,setOrders]=useState<Order[]>([]);
  const [quotes,setQuotes]=useState<Quote[]>([]);
  const [jobs,setJobs]=useState<Job[]>([]);
  const [deliveries,setDeliveries]=useState<Delivery[]>([]);
  const [settings,setSettings]=useState<Settings|null>(null);
  const [quoteId,setQuoteId]=useState("");
  const [committedAt,setCommittedAt]=useState("");
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  const [reload,setReload]=useState(0);
  const [warehouses,setWarehouses]=useState<Array<{id:string;name:string}>>([]),[warehouseId,setWarehouseId]=useState("");
  const [inventoryEnabled,setInventoryEnabled]=useState(false);
  const alive=useRef(false),revision=useRef(0),lock=useRef(false),keys=useRef(new Map<string,{payload:string;key:string}>());

  async function load() {
    const current=++revision.current;
    const [o,q,j,d,w,s] = await Promise.all([
      supabase.from("orders").select("id,order_number,quotation_id,contact_id,status,currency,total::text,amount_paid::text,committed_at,created_at").eq("tenant_id",tenantId).order("created_at",{ascending:false}).limit(250),
      supabase.from("quotations").select("id,quote_number,status,total,contact_id,company_id,opportunity_id").eq("tenant_id",tenantId).order("created_at",{ascending:false}).limit(250),
      supabase.from("production_jobs").select("id,order_id,status,priority,technique,design_approved,quality_control_status").eq("tenant_id",tenantId).order("created_at",{ascending:false}).limit(250),
      supabase.from("deliveries").select("id,order_id,status,delivery_zone,delivery_address,shipping_cost,scheduled_at").eq("tenant_id",tenantId).order("created_at",{ascending:false}).limit(250),
      supabase.from("inventory_warehouses").select("id,name").eq("tenant_id",tenantId).eq("active",true).order("name"),
      supabase.from("tenant_settings").select("brand_name,currency,timezone").eq("tenant_id",tenantId).maybeSingle()
    ]);
    if(!alive.current||current!==revision.current)return;
    const err=[o,q,j,d,s].find(x=>x.error)?.error;
    if(err) setNotice(err.message);
    setOrders((o.data??[]) as unknown as Order[]);
    setQuotes((q.data??[]).map(x=>({...x,total:Number(x.total)})) as Quote[]);
    setJobs((j.data??[]) as Job[]);
    setDeliveries((d.data??[]).map(x=>({...x,shipping_cost:x.shipping_cost===null?null:Number(x.shipping_cost)})) as Delivery[]);
    setInventoryEnabled(!w.error);setWarehouses((w.data??[]) as Array<{id:string;name:string}>);
    setSettings(s.data as Settings|null);
  }
  useEffect(()=>{alive.current=true;void load().catch(()=>{if(alive.current)setNotice("No se pudieron consultar las operaciones.");});return()=>{alive.current=false;++revision.current;};},[tenantId,reload]);

  const acceptedQuotes=useMemo(()=>quotes.filter(q=>q.status==="accepted" && !orders.some(o=>o.quotation_id===q.id)),[quotes,orders]);
  const jobByOrder=useMemo(()=>new Map(jobs.map(j=>[j.order_id,j])),[jobs]);
  const deliveryByOrder=useMemo(()=>new Map(deliveries.map(d=>[d.order_id,d])),[deliveries]);
  async function command(action:string,payload:Record<string,unknown>,message:string){
    if(lock.current)return;lock.current=true;setBusy(true);setNotice("");
    const slot=action+":"+String(payload.p_order_id??payload.p_quotation_id??""),serialized=JSON.stringify(payload),previous=keys.current.get(slot);
    const key=previous?.payload===serialized?previous.key:crypto.randomUUID();keys.current.set(slot,{payload:serialized,key});
    try{
      const result=await supabase.rpc(action,{...payload,p_tenant_id:tenantId,p_idempotency_key:key});
      if(!alive.current)return;
      if(result.error){
        const error=result.error.message;
        setNotice(/mapping_required/.test(error)?"Vincula cada producto con un único artículo activo de inventario antes de reservar o entregar.":
          /insufficient_stock/.test(error)?"No hay existencias disponibles suficientes en el almacén seleccionado.":
          /quality_approval|not_ready_for_delivery/.test(error)?"Completa producción, aprobación de diseño y control de calidad antes de confirmar la entrega.":
          /reservation_required/.test(error)?"Reserva todos los artículos del pedido antes de confirmar la entrega.":
          /schema cache|does not exist|could not find/.test(error)?"Estas operaciones requieren habilitar las migraciones nativas verificadas.":
          /denied|forbidden|permission/.test(error)?"El servidor no autorizó la operación para tu usuario y empresa.":"No se pudo confirmar la operación. Actualiza y revisa el pedido antes de reintentar.");
        return;
      }
      keys.current.delete(slot);setNotice(message);setReload(value=>value+1);
    }catch{if(alive.current)setNotice("Se interrumpió la conexión. Reintenta con los mismos datos para evitar duplicados.");}
    finally{lock.current=false;if(alive.current)setBusy(false);}
  }

  async function createOrder(e:FormEvent){
    e.preventDefault(); setNotice("");
    const quote=acceptedQuotes.find(q=>q.id===quoteId);
    if(!quote) return setNotice("Selecciona una cotización aceptada.");
    await command("erp_native_convert_quote",{p_quotation_id:quote.id,p_committed_at:committedAt?new Date(committedAt).toISOString():null},"Pedido creado con sus artículos. Revisa diseño, producción y reserva de existencias.");
  }

  async function approveDesign(orderId:string){
    setNotice("");
    const j=jobByOrder.get(orderId); if(!j) return;
    const now=new Date().toISOString();
    const r=await supabase.from("production_jobs").update({design_approved:true,design_approved_at:now,status:"ready"}).eq("tenant_id",tenantId).eq("id",j.id);
    if(r.error)return setNotice(r.error.message);
    setNotice("Diseño aprobado. El trabajo ya puede comenzar."); setReload(v=>v+1);
  }

  async function setProductionStatus(orderId:string,status:string){
    const j=jobByOrder.get(orderId); if(!j) return;
    if(["ready","in_progress","quality_control","completed"].includes(status) && !j.design_approved) return setNotice("Debes aprobar el diseño antes de iniciar producción.");
    const patch:any={status};
    if(status==="in_progress") patch.started_at=new Date().toISOString();
    if(status==="completed"){patch.completed_at=new Date().toISOString();patch.quality_control_status="passed";}
    const r=await supabase.from("production_jobs").update(patch).eq("tenant_id",tenantId).eq("id",j.id);
    if(r.error)return setNotice(r.error.message);
    const orderStatus=status==="in_progress"?"in_production":status==="quality_control"?"quality_control":status==="completed"?"ready_for_delivery":null;
    if(orderStatus) await supabase.from("orders").update({status:orderStatus}).eq("tenant_id",tenantId).eq("id",orderId);
    setReload(v=>v+1);
  }

  async function ensureDelivery(order:Order){
    if(deliveryByOrder.has(order.id)) return;
    const r=await supabase.from("deliveries").insert({tenant_id:tenantId,order_id:order.id,status:"pending"});
    if(r.error)return setNotice(r.error.message);
    setNotice("Entrega creada."); setReload(v=>v+1);
  }

  async function markDelivered(orderId:string){
    await command("erp_order_inventory_command",{p_order_id:orderId,p_action:"ship",p_warehouse_id:warehouseId||null},"Entrega confirmada: inventario, reservas y pedido actualizados juntos.");
  }

  return <div className="stack gap-16">
    <section className="card">
      <div className="eyebrow">{settings?.brand_name??"Cliente"} · Operaciones</div>
      <h2>Pedido → Producción → Entrega → Cobro</h2>
      <p className="muted">Flujo operativo real por tenant. Las cotizaciones deben estar aceptadas antes de convertirse en pedido.</p>
      {notice && <div className="notice" style={{marginTop:12}}>{notice}</div>}
    </section>

    <form className="card" onSubmit={createOrder}>
      <h2>Crear pedido desde cotización aceptada</h2>
      <div className="form-grid">
        <label>Cotización<select value={quoteId} onChange={e=>setQuoteId(e.target.value)} required><option value="">Seleccionar</option>{acceptedQuotes.map(q=><option key={q.id} value={q.id}>{q.quote_number}</option>)}</select></label>
        <label>Fecha comprometida<input type="datetime-local" value={committedAt} onChange={e=>setCommittedAt(e.target.value)} /></label>
      </div>
      <div className="section-gap"><button className="button primary" disabled={busy||acceptedQuotes.length===0}>{busy?"Creando…":"Crear pedido"}</button></div>
      {acceptedQuotes.length===0 && <div className="muted">No hay cotizaciones aceptadas pendientes de convertir.</div>}
    </form>

    <section className="grid metrics">
      <div className="metric"><div className="metric-label">Pedidos activos</div><div className="metric-value">{orders.filter(o=>!["delivered","cancelled"].includes(o.status)).length}</div><div className="metric-sub">En operación</div></div>
      <div className="metric"><div className="metric-label">En producción</div><div className="metric-value">{jobs.filter(j=>["ready","in_progress","quality_control"].includes(j.status)).length}</div><div className="metric-sub">Trabajos abiertos</div></div>
      <div className="metric"><div className="metric-label">Listos/entrega</div><div className="metric-value">{orders.filter(o=>["ready_for_delivery","out_for_delivery"].includes(o.status)).length}</div><div className="metric-sub">Pendientes de cierre</div></div>
      <div className="metric"><div className="metric-label">Entregados</div><div className="metric-value">{orders.filter(o=>o.status==="delivered").length}</div><div className="metric-sub">Pedidos confirmados</div></div>
    </section>

    <section className="card">
      <h2>Pedidos</h2>
      <label>Almacén para reservas y entregas<select disabled={busy||!inventoryEnabled} value={warehouseId} onChange={event=>setWarehouseId(event.target.value)}><option value="">Principal (predeterminado)</option>{warehouses.map(warehouse=><option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label>
      {!inventoryEnabled&&<p className="notice">El inventario nativo requiere activar las migraciones verificadas antes de reservar o entregar.</p>}
      {orders.map(o=>{
        const j=jobByOrder.get(o.id); const d=deliveryByOrder.get(o.id);
        return <div key={o.id} className="priority-item" style={{alignItems:"flex-start",gap:12,flexWrap:"wrap"}}>
          <div style={{minWidth:220,flex:1}}><strong>{o.order_number}</strong><div className="muted">{o.status} · {commercialMoney(o.total,o.currency)} · cobrado {commercialMoney(o.amount_paid,o.currency)}</div>{o.committed_at&&<div className="muted">Comprometido: {new Date(o.committed_at).toLocaleString("es-DO")}</div>}</div>
          <div className="top-actions" style={{flexWrap:"wrap"}}>
            {j&&!j.design_approved&&<button className="button small" onClick={()=>approveDesign(o.id)}>Aprobar diseño</button>}
            {j&&j.design_approved&&j.status!=="completed"&&<select value={j.status} onChange={e=>setProductionStatus(o.id,e.target.value)}><option value="ready">Listo para producir</option><option value="in_progress">En producción</option><option value="quality_control">Control de calidad</option><option value="completed">Producción terminada</option></select>}
            {o.status==="ready_for_delivery"&&!d&&<button className="button small" onClick={()=>ensureDelivery(o)}>Crear entrega</button>}
            {!["cancelled","delivered"].includes(o.status)&&<><button className="button small" disabled={busy||!inventoryEnabled} onClick={()=>void command("erp_order_inventory_command",{p_order_id:o.id,p_action:"reserve",p_warehouse_id:warehouseId||null},"Existencias reservadas para este pedido.")}>Reservar existencias</button><button className="button small" disabled={busy||!inventoryEnabled} onClick={()=>void command("erp_order_inventory_command",{p_order_id:o.id,p_action:"release",p_warehouse_id:warehouseId||null},"Reservas liberadas.")}>Liberar reservas</button></>}
            {["ready_for_delivery","out_for_delivery"].includes(o.status)&&d?.status!=="delivered"&&<button className="button small" disabled={busy||!inventoryEnabled} onClick={()=>void markDelivered(o.id)}>Confirmar entrega</button>}
          </div>
        </div>;
      })}
      {orders.length===0&&<div className="empty"><strong>Sin pedidos</strong><div>Acepta una cotización y conviértela en el primer pedido real.</div></div>}
    </section>
    <ErpNativeCommercial tenantId={tenantId} orders={orders} onChanged={()=>setReload(value=>value+1)}/>
  </div>;
}

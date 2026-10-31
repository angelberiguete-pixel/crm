"use client";

import Link from "next/link";
import {useCallback,useEffect,useMemo,useState,type FormEvent} from "react";
import {FileText,Plus,RefreshCw,ShieldCheck} from "lucide-react";
import {supabase} from "@/lib/supabase";
import {useActiveTenant} from "@/components/tenant-context";

type Contact={id:string;display_name:string;company_id:string|null};
type Product={id:string;name:string;sku:string;status:string;sale_price:number;tax_rate:number;
 currency:string;stock_snapshot:number|null};
type Approval={product_id:string;approved_price:number;approved_tax_rate:number;currency:string};
type Quote={id:string;quote_number:string;status:string;currency:string;total:number;subtotal:number;
 discount_total:number;tax_total:number;contact_id:string|null;created_at:string};
type Line={id:string;quotation_id:string;description:string;quantity:number;unit_price:number;
 discount_percent:number;tax_rate:number;line_subtotal:number|null};
const money=(n:number)=>new Intl.NumberFormat("es-DO",{style:"currency",currency:"DOP"}).format(Number(n)||0);

export default function FamilyPowerQuotations(){
 const tenant=useActiveTenant(),tenantId=tenant?.tenant_id??null;
 const allowed=tenant?.tenant_slug==="family-power"&&["owner","admin"].includes(tenant?.membership_role??"");
 const [contacts,setContacts]=useState<Contact[]>([]);
 const [products,setProducts]=useState<Product[]>([]);
 const [approvals,setApprovals]=useState<Approval[]>([]);
 const [quotes,setQuotes]=useState<Quote[]>([]);
 const [lines,setLines]=useState<Line[]>([]);
 const [backendReady,setBackendReady]=useState(false);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [error,setError]=useState(""),[message,setMessage]=useState("");
 const [selected,setSelected]=useState("");
 const [contactId,setContactId]=useState(""),[validUntil,setValidUntil]=useState("");
 const [notes,setNotes]=useState(""),[productId,setProductId]=useState("");
 const [quantity,setQuantity]=useState("1"),[discount,setDiscount]=useState("0");
 const [evidence,setEvidence]=useState("");
 const [revision,setRevision]=useState(0);
 const reload=useCallback(()=>setRevision(x=>x+1),[]);
 useEffect(()=>{
  let live=true;
  setQuotes([]);setLines([]);setProducts([]);setApprovals([]);setContacts([]);
  setBackendReady(false);setLoading(true);setError("");setMessage("");
  if(!allowed||!tenantId){setLoading(false);return()=>{live=false;};}
  void (async()=>{
   try{
    const [c,p,a,q,l]=await Promise.all([
     supabase.from("contacts").select("id,display_name,company_id").eq("tenant_id",tenantId).order("display_name"),
     supabase.from("products").select("id,name,sku,status,sale_price,tax_rate,currency,stock_snapshot")
       .eq("tenant_id",tenantId).eq("status","active").order("name"),
     supabase.from("crm_family_product_approvals").select("product_id,approved_price,approved_tax_rate,currency")
       .eq("tenant_id",tenantId),
     supabase.from("quotations").select("id,quote_number,status,currency,total,subtotal,discount_total,tax_total,contact_id,created_at")
       .eq("tenant_id",tenantId).order("created_at",{ascending:false}).limit(100),
     supabase.from("quotation_items").select("id,quotation_id,description,quantity,unit_price,discount_percent,tax_rate,line_subtotal")
       .eq("tenant_id",tenantId).order("position").limit(1000)
    ]);
    if(!live)return;
    if(c.error||p.error||q.error||l.error){setError("No se pudo cargar el módulo con aislamiento de empresa.");return;}
    setContacts((c.data??[]) as Contact[]);
    setProducts((p.data??[]) as Product[]);
    setQuotes((q.data??[]) as Quote[]);
    setLines((l.data??[]) as Line[]);
    if(a.error){
     setError("El circuito de cotización auditada requiere la migración financiera y las pruebas de seguridad. No está activado.");
     return;
    }
    setApprovals((a.data??[]) as Approval[]);
    setBackendReady(true);
   }catch{if(live)setError("No se pudo conectar al catálogo o las cotizaciones.");}
   finally{if(live)setLoading(false);}
  })();
  return()=>{live=false;};
 },[allowed,tenantId,revision]);
 const verifiedProducts=useMemo(()=>products.filter(p=>p.status==="active"&&p.currency==="DOP"
  &&Number(p.sale_price)>0&&Number(p.stock_snapshot)>0
  &&approvals.some(a=>a.product_id===p.id&&Number(a.approved_price)===Number(p.sale_price)
   &&Number(a.approved_tax_rate)===Number(p.tax_rate)&&a.currency===p.currency)),[products,approvals]);
 const current=quotes.find(q=>q.id===selected)??null;
 const currentLines=lines.filter(l=>l.quotation_id===selected);
 const selectedProduct=verifiedProducts.find(p=>p.id===productId);
 async function invoke(name:string,args:Record<string,unknown>){
  if(!tenantId||!allowed||busy||!backendReady)return null;
  setBusy(true);setError("");setMessage("");
  try{
   const result=await supabase.rpc(name,args);
   if(result.error){setError("Operación no autorizada o datos no verificables: "+result.error.message);return null;}
   setMessage("Operación registrada. Consulta los documentos y la auditoría de la empresa.");
   reload();
   return result.data;
  }catch{setError("La operación no pudo completarse. No se considera guardada.");return null;}
  finally{setBusy(false);}
 }
 async function create(e:FormEvent){
  e.preventDefault();
  if(!contactId||!tenantId)return;
  const id=await invoke("crm_family_create_quotation",{
   p_tenant_id:tenantId,p_contact_id:contactId,p_valid_until:validUntil||null,
   p_notes:notes.trim()||null
  });
  if(typeof id==="string"){setSelected(id);setNotes("");setValidUntil("");}
 }
 async function addItem(e:FormEvent){
  e.preventDefault();
  if(!tenantId||!current||!selectedProduct)return;
  const qty=Number(quantity),disc=Number(discount);
  if(!Number.isFinite(qty)||qty<=0||qty>Number(selectedProduct.stock_snapshot??0))
   return setError("Cantidad fuera del stock confirmado.");
  if(!Number.isFinite(disc)||disc<0||disc>100)return setError("Descuento inválido.");
  const saved=await invoke("crm_family_add_quote_item",{
   p_tenant_id:tenantId,p_quote_id:current.id,p_product_id:selectedProduct.id,
   p_quantity:qty,p_discount_percent:disc
  });
  if(saved){setProductId("");setQuantity("1");setDiscount("0");}
 }
 async function decide(status:"sent"|"accepted"){
  if(!tenantId||!current||evidence.trim().length<8)return setError("Registra la referencia del envío o la confirmación humana (mínimo 8 caracteres).");
  const saved=await invoke("crm_family_record_quote_decision",{
   p_tenant_id:tenantId,p_quote_id:current.id,p_new_status:status,
   p_evidence_reference:evidence.trim()
  });
  if(saved)setEvidence("");
 }
 if(!allowed)return <main className="content"><h1>Acceso restringido</h1><p>Solo la administración autorizada de Family Power puede crear cotizaciones en esta fase.</p></main>;
 return <main className="content" style={{maxWidth:1320,margin:"0 auto"}}>
  <header className="topbar">
   <div><div className="eyebrow"><ShieldCheck size={16}/> Family Power · Ventas verificables</div>
    <h1>Cotizaciones</h1><p className="muted">Solo productos, fotos y precios aprobados. Descuentos registrados e impuestos según ficha validada.</p></div>
   <button type="button" className="button" disabled={busy||loading} onClick={reload}><RefreshCw size={16}/> Actualizar</button>
  </header>
  {loading&&<p role="status">Comprobando catálogo y cotizaciones autorizadas…</p>}
  {error&&<div role="alert" className="notice">{error}</div>}
  {message&&<div role="status" className="notice">{message}</div>}
  {!loading&&verifiedProducts.length===0&&<div className="notice">
   Todavía no existen productos aprobados para una cotización comercial. No se inventan SKU, precios, impuestos ni existencias.
   <Link className="button" href="/crm/family-power-setup"> Revisar verificación del catálogo</Link>
  </div>}
  <section className="grid two-col section-gap">
   <form className="card stack gap-12" onSubmit={e=>void create(e)}>
    <h2>Nuevo borrador</h2>
    <label>Cliente existente
     <select aria-label="Cliente de la cotización" required value={contactId} onChange={e=>setContactId(e.target.value)}>
      <option value="">Selecciona un cliente</option>
      {contacts.map(c=><option key={c.id} value={c.id}>{c.display_name}</option>)}
     </select>
    </label>
    <label>Vigencia opcional (máximo 90 días)<input type="date" value={validUntil} onChange={e=>setValidUntil(e.target.value)}/></label>
    <label>Notas internas<textarea value={notes} maxLength={1000} onChange={e=>setNotes(e.target.value)}/></label>
    <button className="button primary" disabled={busy||!backendReady||!contactId}><Plus size={16}/> Crear borrador</button>
   </form>
   <section className="card">
    <h2>Historial de cotizaciones</h2>
    {quotes.length===0?<p className="muted">Todavía no hay cotizaciones en Family Power.</p>:
    <div className="stack gap-8">{quotes.map(q=><button type="button" key={q.id}
     aria-pressed={q.id===selected} className="priority-item" onClick={()=>{setSelected(q.id);setEvidence("");}}
     style={{width:"100%",textAlign:"left",borderColor:q.id===selected?"var(--accent)":"var(--border)"}}>
      <span><strong>{q.quote_number}</strong><small className="muted" style={{display:"block"}}>{q.status}</small></span>
      <strong>{money(q.total)}</strong>
     </button>)}</div>}
   </section>
  </section>
  <section className="card section-gap">
   <h2>Detalle del documento</h2>
   {!current?<p className="muted">Selecciona un borrador existente o crea uno.</p>:<>
    <div className="priority-item"><strong>{current.quote_number} · {current.status}</strong><strong>{money(current.total)}</strong></div>
    <div className="table-wrap section-gap"><table className="data-table"><thead><tr>
     <th>Producto</th><th>Cantidad</th><th>Precio</th><th>Descuento</th><th>ITBIS / impuesto</th>
    </tr></thead><tbody>{currentLines.map(line=><tr key={line.id}>
      <td>{line.description}</td><td>{line.quantity}</td><td>{money(line.unit_price)}</td>
      <td>{line.discount_percent}%</td><td>{line.tax_rate}%</td>
     </tr>)}
     {currentLines.length===0&&<tr><td colSpan={5}>Sin artículos aprobados.</td></tr>}</tbody></table></div>
    <div className="top-actions"><span>Subtotal: <strong>{money(current.subtotal)}</strong></span>
     <span>Descuentos: <strong>{money(current.discount_total)}</strong></span>
     <span>Impuestos: <strong>{money(current.tax_total)}</strong></span>
     <strong>Total: {money(current.total)}</strong></div>
    {current.status==="draft"&&<form onSubmit={e=>void addItem(e)} className="stack gap-12 section-gap">
      <h3>Agregar producto validado</h3>
      <div className="form-grid">
       <label>Producto<select aria-label="Producto aprobado" required value={productId} onChange={e=>setProductId(e.target.value)}>
        <option value="">Selecciona un producto aprobado</option>
        {verifiedProducts.map(p=><option key={p.id} value={p.id}>{p.name} · {money(p.sale_price)} · {p.stock_snapshot} disponibles</option>)}
       </select></label>
       <label>Cantidad<input aria-label="Cantidad" type="number" min="1" step="1" required value={quantity} onChange={e=>setQuantity(e.target.value)}/></label>
       <label>Descuento (%)<input aria-label="Descuento porcentual" type="number" min="0" max="100" step=".01" value={discount} onChange={e=>setDiscount(e.target.value)}/></label>
       <label>Impuesto autorizado<input aria-label="Impuesto autorizado" value={selectedProduct?String(selectedProduct.tax_rate)+" %":"Selecciona producto"} readOnly/></label>
      </div>
      <button className="button primary" disabled={!backendReady||busy||!selectedProduct}>Agregar artículo y calcular totales</button>
     </form>}
    <div className="top-actions section-gap">
      <Link href={"/crm/family-power-quote?id="+encodeURIComponent(current.id)} className="button"><FileText size={16}/> Revisar PDF profesional</Link>
    </div>
    {(current.status==="draft"||current.status==="sent")&&<div className="stack gap-12 section-gap">
      <p className="muted">Registrar la fecha, canal o referencia de comunicación real. No se envía automáticamente ningún WhatsApp.</p>
      <label>Referencia humana verificable<input aria-label="Evidencia de aprobación o envío" maxLength={250} value={evidence} onChange={e=>setEvidence(e.target.value)} placeholder="Ej.: reunión, correo, mensaje confirmado"/></label>
      <div className="top-actions">
       {current.status==="draft"&&<button className="button" type="button" disabled={busy||!backendReady||evidence.trim().length<8} onClick={()=>void decide("sent")}>Registrar envío comprobado</button>}
       {current.status==="sent"&&<button className="button primary" type="button" disabled={busy||!backendReady||evidence.trim().length<8} onClick={()=>void decide("accepted")}>Registrar aceptación humana</button>}
      </div>
     </div>}
   </>}
  </section>
 </main>;
}

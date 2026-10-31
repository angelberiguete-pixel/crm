"use client";
import Link from "next/link";
import {useCallback,useEffect,useMemo,useState,type FormEvent} from "react";
import {FileText,Plus,RefreshCw,Trash2,ShieldCheck} from "lucide-react";
import {useActiveTenant} from "@/components/tenant-context";
import {supabase} from "@/lib/supabase";

type Product={id:string;sku:string;name:string;status:string;sale_price:number;currency:string;tax_rate:number;stock_snapshot:number|null};
type Approval={product_id:string;approved_price:number;currency:string};
type Contact={id:string;display_name:string};
type Quote={id:string;quote_number:string;total:number;currency:string;status:string;created_at:string;contact_id:string|null};
type Line={key:number;product_id:string;quantity:string;discount_percent:string};
const money=(value:number,currency:string)=>{try{return new Intl.NumberFormat("es-DO",{style:"currency",currency}).format(Number(value||0));}catch{return currency+" "+value;}};
const defaultLine=(key:number):Line=>({key,product_id:"",quantity:"1",discount_percent:"0"});
export default function FamilyPowerQuoteBuilder(){
 const tenant=useActiveTenant(),tenantId=tenant?.tenant_id??null;
 const allowed=tenant?.tenant_slug==="family-power"&&["owner","admin"].includes(tenant?.membership_role??"");
 const [version,setVersion]=useState(0),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false);
 const [error,setError]=useState(""),[feedback,setFeedback]=useState("");
 const [products,setProducts]=useState<Product[]>([]),[approvals,setApprovals]=useState<Approval[]>([]);
 const [contacts,setContacts]=useState<Contact[]>([]),[quotes,setQuotes]=useState<Quote[]>([]);
 const [backendReady,setBackendReady]=useState(false),[contactId,setContactId]=useState("");
 const [validUntil,setValidUntil]=useState(""),[notes,setNotes]=useState("");
 const [lines,setLines]=useState<Line[]>([defaultLine(1)]);
 const [createdId,setCreatedId]=useState("");
 const reload=useCallback(()=>setVersion(n=>n+1),[]);
 useEffect(()=>{
  let active=true;
  setLoading(true);setError("");setProducts([]);setApprovals([]);setContacts([]);setQuotes([]);
  if(!allowed||!tenantId){setLoading(false);return()=>{active=false;};}
  void(async()=>{
   try{
    const [p,a,c,q]=await Promise.all([
      supabase.from("products").select("id,sku,name,status,sale_price,currency,tax_rate,stock_snapshot")
       .eq("tenant_id",tenantId).eq("status","active").limit(500),
      supabase.from("crm_family_product_approvals").select("product_id,approved_price,currency")
       .eq("tenant_id",tenantId).limit(500),
      supabase.from("contacts").select("id,display_name").eq("tenant_id",tenantId).order("display_name").limit(500),
      supabase.from("quotations").select("id,quote_number,total,currency,status,created_at,contact_id")
       .eq("tenant_id",tenantId).order("created_at",{ascending:false}).limit(100)
    ]);
    if(!active)return;
    if(p.error||c.error||q.error){setError("No se pudo recuperar el catálogo o las cotizaciones autorizadas.");return;}
    setProducts((p.data??[]) as Product[]);setContacts((c.data??[]) as Contact[]);setQuotes((q.data??[]) as Quote[]);
    setBackendReady(!a.error);
    if(!a.error)setApprovals((a.data??[]) as Approval[]);
   }catch{if(active)setError("No se pudo conectar con el CRM.");}
   finally{if(active)setLoading(false);}
  })();
  return()=>{active=false;};
 },[tenantId,allowed,version]);
 const approved=useMemo(()=>{
  const map=new Map(approvals.map(a=>[a.product_id,a]));
  return products.filter(p=>p.status==="active"&&p.sale_price>0
   &&Number(p.stock_snapshot)>0&&map.get(p.id)?.approved_price===p.sale_price
   &&map.get(p.id)?.currency===p.currency);
 },[products,approvals]);
 const productById=useMemo(()=>new Map(approved.map(p=>[p.id,p])),[approved]);
 const detailed=lines.map(l=>({line:l,product:productById.get(l.product_id),quantity:Number(l.quantity),discount:Number(l.discount_percent)}));
 const validLines=detailed.length>0&&detailed.every(x=>x.product&&Number.isInteger(x.quantity)&&x.quantity>0
  &&x.quantity<=Number(x.product.stock_snapshot)&&Number.isFinite(x.discount)&&x.discount>=0&&x.discount<=25);
 const currencies=[...new Set(detailed.map(x=>x.product?.currency).filter(Boolean))];
 const validCurrency=currencies.length===1;
 const total=detailed.reduce((sum,x)=>{
  if(!x.product||!Number.isFinite(x.quantity)||!Number.isFinite(x.discount))return sum;
  const base=x.quantity*x.product.sale_price*(1-x.discount/100);
  return sum+base*(1+Number(x.product.tax_rate||0)/100);
 },0);
 const edit=(key:number,field:keyof Omit<Line,"key">,value:string)=>setLines(old=>old.map(l=>l.key===key?{...l,[field]:value}:l));
 async function submit(e:FormEvent){
  e.preventDefault();if(!tenantId||!allowed||saving||!backendReady||!contactId||!validLines||!validCurrency)return;
  setSaving(true);setError("");setFeedback("");setCreatedId("");
  const payload=lines.map(l=>({product_id:l.product_id,quantity:Number(l.quantity),discount_percent:Number(l.discount_percent)}));
  try{
    const {data,error:rpcError}=await supabase.rpc("crm_family_create_quote",{
      p_tenant_id:tenantId,p_contact_id:contactId,p_valid_until:validUntil||null,
      p_notes:notes.trim()||null,p_lines:payload
    });
    if(rpcError||typeof data!=="string"){setError("No se pudo generar la cotización. Comprueba aprobación, inventario y permisos.");return;}
    setCreatedId(data);setFeedback("Cotización creada como BORRADOR. Aún no está enviada ni aprobada.");
    setLines([defaultLine(1)]);setNotes("");setContactId("");setValidUntil("");reload();
  }catch{setError("No se confirmó la operación. Comprueba el estado antes de repetirla.");}
  finally{setSaving(false);}
 }
 if(!allowed)return <main className="content"><h1>Acceso restringido</h1>
  <p>La emisión inicial de cotizaciones de Family Power requiere propietario o administrador autorizado.</p></main>;
 return <div className="stack gap-16">
  <header className="topbar"><div><div className="eyebrow">Family Power · Venta profesional</div>
   <h1>Cotizador de inversores</h1><p className="muted">Utiliza únicamente productos con fotografía, ficha técnica, precio y stock aprobados.</p></div>
   <button className="button" type="button" onClick={reload} disabled={saving||loading}><RefreshCw size={15}/> Actualizar catálogo</button>
  </header>
  {error&&<div className="notice" role="alert">{error}</div>}
  {!loading&&!backendReady&&<div className="notice" role="alert">El módulo de aprobación y cotización está pendiente de validar su migración SQL en un entorno de pruebas. No es posible emitir cotizaciones desde aquí todavía.</div>}
  {!loading&&backendReady&&approved.length===0&&<div className="notice" role="status">
   No hay modelos aprobados para cotizar. Los 70 inversores mencionados son unidades por verificar, no modelos ni precios autorizados.
   <p><Link href="/crm/family-power-setup">Ir a preparación del catálogo</Link></p>
  </div>}
  {loading?<p role="status">Consultando inventario real…</p>:<form className="card stack gap-16" onSubmit={submit}>
   <h2>Nueva cotización manual</h2>
   <div className="form-grid">
    <label>Cliente registrado<select value={contactId} onChange={e=>setContactId(e.target.value)} required>
     <option value="">Selecciona el cliente real</option>{contacts.map(c=><option key={c.id} value={c.id}>{c.display_name}</option>)}</select></label>
    <label>Válida hasta<input type="date" value={validUntil} onChange={e=>setValidUntil(e.target.value)}/></label>
   </div>
   <div className="stack gap-12">
    <h3>Productos y cantidades</h3>
    {lines.map(l=>{const p=productById.get(l.product_id);return <div key={l.key} className="card" style={{background:"var(--panel2)"}}>
     <div className="form-grid">
      <label>Modelo aprobado<select value={l.product_id} onChange={e=>edit(l.key,"product_id",e.target.value)} required>
       <option value="">Selecciona un SKU verificado</option>
       {approved.map(x=><option key={x.id} value={x.id}>{x.sku} — {x.name} — {money(x.sale_price,x.currency)} · stock {x.stock_snapshot}</option>)}
      </select></label>
      <label>Cantidad<input type="number" min="1" step="1" max={p?.stock_snapshot??undefined} value={l.quantity}
       onChange={e=>edit(l.key,"quantity",e.target.value)} required/></label>
      <label>Descuento (%)<input type="number" min="0" max="25" step="0.01" value={l.discount_percent}
       onChange={e=>edit(l.key,"discount_percent",e.target.value)} required/></label>
     </div>
     <div className="top-actions" style={{marginTop:10}}>
      <small>{p?money((Number(l.quantity)||0)*p.sale_price*(1-(Number(l.discount_percent)||0)/100)*(1+Number(p.tax_rate||0)/100),p.currency):"Selecciona un producto"}</small>
      <button type="button" className="button" disabled={lines.length===1} onClick={()=>setLines(old=>old.filter(x=>x.key!==l.key))}><Trash2 size={14}/> Quitar</button>
     </div>
    </div>})}
    <button type="button" className="button" disabled={lines.length>=20} onClick={()=>setLines(old=>[...old,defaultLine(Math.max(...old.map(l=>l.key))+1)])}>
     <Plus size={15}/> Añadir otro producto</button>
   </div>
   <label>Condiciones y notas<textarea value={notes} onChange={e=>setNotes(e.target.value)} maxLength={2000} placeholder="Garantía, condiciones o plazo autorizados por Family Power"/></label>
   <p><strong>Total estimado:</strong> {validCurrency?money(total,currencies[0]||"DOP"):"Selecciona productos de una misma moneda"}</p>
   <p className="muted">La base de datos calculará nuevamente los importes y verificará el catálogo antes de guardar el borrador. No enviará mensajes ni registrará pagos.</p>
   <button type="submit" className="button primary" disabled={saving||!backendReady||!approved.length||!contactId||!validLines||!validCurrency||total<=0}>
    <ShieldCheck size={15}/>{saving?"Comprobando inventario…":"Guardar cotización verificada como borrador"}</button>
  </form>}
  {feedback&&<div className="notice" role="status">{feedback}
   {createdId&&<p><Link className="button primary" href={`/crm/family-power-quote?id=${encodeURIComponent(createdId)}`}><FileText size={15}/> Ver documento y PDF</Link></p>}</div>}
  <section className="card"><h2>Cotizaciones de Family Power</h2>
   {quotes.map(q=><div className="priority-item" key={q.id}>
    <div><strong>{q.quote_number}</strong><div className="muted">{q.status} · {money(q.total,q.currency)}</div></div>
    <Link className="button" href={`/crm/family-power-quote?id=${encodeURIComponent(q.id)}`}>Ver PDF</Link>
   </div>)}
   {!quotes.length&&<p className="muted">Todavía no existen cotizaciones comerciales de esta empresa.</p>}
  </section>
 </div>;
}

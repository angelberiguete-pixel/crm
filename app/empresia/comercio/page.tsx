"use client";

import Link from "next/link";
import {FormEvent,useCallback,useEffect,useState} from "react";
import {supabase} from "@/lib/supabase";

type Offer={
 id:string;slug:string;title:string;description:string;kind:"one_time"|"monthly";
 usd_price_cents:number;fulfillment:"assisted"|"entitlement";
 status:"draft"|"published"|"archived";paypal_plan_id:string|null;
};
type Sale={id:string;status:string;buyer_email:string;amount_cents:number;kind:string;created_at:string;offer_id:string};
const money=(c:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(c/100);

export default function EmpresiaCommerceAdmin(){
 const [authorized,setAuthorized]=useState<boolean|null>(null);
 const [offers,setOffers]=useState<Offer[]>([]);
 const [sales,setSales]=useState<Sale[]>([]);
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState("");
 const [error,setError]=useState("");
 const [loading,setLoading]=useState(true);
 const [title,setTitle]=useState("");
 const [slug,setSlug]=useState("");
 const [description,setDescription]=useState("");
 const [amount,setAmount]=useState("");
 const [kind,setKind]=useState<"one_time"|"monthly">("one_time");
 const [fulfillment,setFulfillment]=useState<"assisted"|"entitlement">("assisted");

 const load=useCallback(async()=>{
  const {data:{session}}=await supabase.auth.getSession();
  if(!session){setAuthorized(false);setLoading(false);return;}
  const check=await supabase.rpc("crm_billing_financial_snapshot",{p_tenant_id:null});
  if(check.error){setAuthorized(false);setLoading(false);return;}
  setAuthorized(true);
  const [offersResult,salesResult]=await Promise.all([
   supabase.from("empresia_offers").select("id,slug,title,description,kind,usd_price_cents,fulfillment,status,paypal_plan_id").order("created_at",{ascending:false}),
   supabase.from("empresia_checkout_orders").select("id,status,buyer_email,amount_cents,kind,created_at,offer_id").order("created_at",{ascending:false}).limit(60)
  ]);
  if(offersResult.error||salesResult.error)setError("No se pudo consultar el catálogo o las ventas.");
  else{
   setOffers((offersResult.data??[]) as Offer[]);
   setSales((salesResult.data??[]) as Sale[]);
  }
  setLoading(false);
 },[]);
 useEffect(()=>{void load();},[load]);

 async function createOffer(e:FormEvent){
  e.preventDefault();if(busy||!authorized)return;
  const cents=Math.round(Number(amount)*100);
  if(!Number.isSafeInteger(cents)||cents<100||cents>100000000){
    setError("Define un precio real en USD (mínimo US$1.00).");return;
  }
  if(!/^[a-z0-9][a-z0-9-]{2,70}$/.test(slug)){
    setError("El identificador debe tener 3 a 71 caracteres, letras minúsculas, números o guiones.");return;
  }
  setBusy(true);setError("");setNotice("");
  const {error:e2}=await supabase.from("empresia_offers").insert({
    title:title.trim(),slug:slug.trim(),description:description.trim(),
    kind,usd_price_cents:cents,fulfillment,status:"draft"
  });
  setBusy(false);
  if(e2){setError("No se creó la oferta: comprueba los campos y que el identificador sea único.");return;}
  setTitle("");setSlug("");setAmount("");setDescription("");setKind("one_time");setFulfillment("assisted");
  setNotice("Oferta guardada como borrador. Todavía no es visible ni cobrable.");
  await load();
 }
 async function setStatus(offer:Offer,status:"published"|"archived"|"draft"){
  if(busy)return;
  if(status==="published"){
    if(offer.kind==="monthly"&&!offer.paypal_plan_id){
      setError("Primero crea el plan de suscripción en PayPal.");return;
    }
    if(!window.confirm("¿Publicar "+offer.title+" por "+money(offer.usd_price_cents)+(offer.kind==="monthly"?"/mes":"")+" para que los clientes puedan comprarlo?"))return;
  }
  setBusy(true);setError("");setNotice("");
  const {error:e}=await supabase.from("empresia_offers").update({
    status,updated_at:new Date().toISOString()
  }).eq("id",offer.id);
  setBusy(false);
  if(e){setError("No se pudo actualizar el estado.");return;}
  setNotice(status==="published"?"Oferta publicada en la tienda.":"Estado actualizado.");
  await load();
 }
 async function createPlan(offer:Offer){
  if(busy||offer.kind!=="monthly"||offer.paypal_plan_id)return;
  if(!window.confirm("¿Crear en PayPal Live un producto y plan de "+money(offer.usd_price_cents)+"/mes? Esto no suscribe ni cobra a ningún cliente."))return;
  setBusy(true);setError("");setNotice("");
  const {data,error:e}=await supabase.functions.invoke("empresia-commerce",{
    body:{action:"publish_plan",offer_id:offer.id}
  });
  setBusy(false);
  if(e||!data||data.status!=="ready"){
    setError("No se creó el plan PayPal. Revisa el acceso de la app y el registro de la función.");
    return;
  }
  setNotice("Plan creado en PayPal. Puedes publicar la oferta cuando estés listo.");
  await load();
 }
 const paid=sales.filter(s=>["paid","active"].includes(s.status));
 return <main className="content" style={{maxWidth:1160,margin:"0 auto"}}>
  <header className="topbar" style={{alignItems:"center"}}>
   <div><div className="eyebrow">EMPRESIA · ADMINISTRACIÓN COMERCIAL</div>
    <h1>Catálogo, checkout y ventas</h1>
    <p className="muted">Precios aprobados en USD, pagos PayPal verificados y suscripciones con autorización del cliente.</p>
   </div>
   <div className="top-actions"><Link href="/platform-admin" className="button">Administración</Link><Link href="/empresia/tienda" className="button primary">Ver tienda</Link></div>
  </header>
  {loading?<div role="status" className="card">Verificando autorización y catálogo…</div>:
   !authorized?<div role="alert" className="notice">Este panel solo está disponible para el propietario autorizado de Empresia. <Link href="/login">Iniciar sesión</Link></div>:<>
    {error&&<div role="alert" className="notice">{error}</div>}
    {notice&&<div role="status" className="notice">{notice}</div>}
    <div className="grid metrics" style={{marginBottom:16}}>
     <div className="metric"><div className="metric-label">Ofertas publicadas</div><div className="metric-value">{offers.filter(o=>o.status==="published").length}</div></div>
     <div className="metric"><div className="metric-label">Órdenes pagadas o activas</div><div className="metric-value">{paid.length}</div></div>
     <div className="metric"><div className="metric-label">Valor de órdenes pagadas</div><div className="metric-value">{money(paid.filter(o=>o.kind==="one_time").reduce((a,x)=>a+x.amount_cents,0))}</div></div>
     <div className="metric"><div className="metric-label">Autorizaciones pendientes</div><div className="metric-value">{sales.filter(s=>s.status==="awaiting_approval").length}</div></div>
    </div>
    <section className="grid two-col" style={{marginBottom:16}}>
     <form onSubmit={createOffer} className="card stack gap-12">
      <h2>Crear producto o servicio</h2>
      <p className="muted">Primero se guarda como borrador. Ningún importe se factura automáticamente.</p>
      <label>Nombre de la oferta<input required minLength={3} maxLength={120} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Nombre comercial aprobado"/></label>
      <label>Identificador de enlace<input required pattern="[a-z0-9][a-z0-9-]{2,70}" value={slug} onChange={e=>setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,""))} placeholder="mi-solucion"/></label>
      <label>Descripción<textarea maxLength={1500} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Qué incluye, entregables y condiciones"/></label>
      <label>Modalidad<select value={kind} onChange={e=>setKind(e.target.value as "one_time"|"monthly")}>
        <option value="one_time">Pago único</option>
        <option value="monthly">Suscripción mensual autorizada</option>
      </select></label>
      <label>Precio en USD<input type="number" min="1.00" step=".01" required value={amount} onChange={e=>setAmount(e.target.value)} placeholder="Ej.: 197.00"/></label>
      <label>Entrega<select value={fulfillment} onChange={e=>setFulfillment(e.target.value as "assisted"|"entitlement")}>
       <option value="assisted">Implementación asistida (requiere revisión administrativa)</option>
       <option value="entitlement">Derecho de acceso digital (debe conectarse al módulo)</option>
      </select></label>
      <button type="submit" className="button primary" disabled={busy}>{busy?"Guardando…":"Guardar borrador"}</button>
     </form>
     <section className="card">
      <h2>Cómo opera el checkout</h2>
      <div className="priority-item"><strong>1. Oferta</strong><span>Precio definido por Empresia</span></div>
      <div className="priority-item"><strong>2. Cliente</strong><span>Cuenta autenticada</span></div>
      <div className="priority-item"><strong>3. Pago</strong><span>Autorización PayPal</span></div>
      <div className="priority-item"><strong>4. Validación</strong><span>Captura confirmada por API</span></div>
      <div className="priority-item"><strong>5. Servicio</strong><span>Derecho registrado / provisión</span></div>
      <p className="muted" style={{fontSize:12,marginTop:14}}>
       Las implementaciones personalizadas no activan automáticamente un tenant sin la aprobación prevista.
       Este comercio procesa cobros propios de Empresia, no los cobros de terceros.
      </p>
     </section>
    </section>
    <section className="card" style={{marginBottom:16}}>
      <h2>Ofertas configuradas</h2>
      {offers.length===0?<p className="muted">Todavía no hay productos publicados ni borradores.</p>:
       offers.map(o=><div className="priority-item" key={o.id} style={{flexWrap:"wrap",marginBottom:9}}>
        <div><strong>{o.title}</strong><div className="muted" style={{fontSize:12}}>{o.slug} · {o.kind==="monthly"?"Mensual":"Único"} · {o.status}</div></div>
        <span style={{fontWeight:750}}>{money(o.usd_price_cents)}{o.kind==="monthly"&&"/mes"}</span>
        <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
         {o.kind==="monthly"&&!o.paypal_plan_id&&o.status==="draft"&&<button type="button" disabled={busy} className="button small" onClick={()=>void createPlan(o)}>Crear plan PayPal</button>}
         {o.status!=="published"&&<button type="button" disabled={busy} className="button primary small" onClick={()=>void setStatus(o,"published")}>Publicar</button>}
         {o.status==="published"&&<button type="button" disabled={busy} className="button small" onClick={()=>void setStatus(o,"archived")}>Retirar</button>}
         <Link href={"/empresia/checkout?offer="+encodeURIComponent(o.slug)} className="button small">Ver checkout</Link>
        </div>
       </div>)}
    </section>
    <section className="card">
      <h2>Órdenes recientes</h2>
      {sales.length===0?<p className="muted">No hay ventas registradas todavía.</p>:
       sales.map(s=><div className="priority-item" key={s.id} style={{flexWrap:"wrap",marginBottom:7}}>
        <span><strong>{s.buyer_email}</strong><div className="muted" style={{fontSize:12}}>{s.id.slice(0,8)} · {new Date(s.created_at).toLocaleDateString("es-DO")}</div></span>
        <strong>{money(s.amount_cents)}{s.kind==="monthly"&&"/mes"}</strong>
        <span className="muted">{s.status==="paid"?"Pagado":s.status==="active"?"Activo":s.status==="awaiting_approval"?"Pendiente de aprobación":s.status}</span>
       </div>)}
      <p className="muted" style={{fontSize:12}}>Los importes cobrados se contabilizan en el panel financiero después de la verificación del proveedor.</p>
    </section>
   </>}
 </main>;
}

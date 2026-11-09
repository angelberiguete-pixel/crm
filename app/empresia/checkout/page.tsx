"use client";

import Link from "next/link";
import Image from "next/image";
import {useCallback,useEffect,useRef,useState} from "react";
import {supabase} from "@/lib/supabase";

type Offer={id:string;slug:string;title:string;description:string;kind:"one_time"|"monthly";usd_price_cents:number;fulfillment:string};
type Order={id:string;kind:string;status:string;amount_cents:number;paypal_order_id:string|null;paypal_subscription_id:string|null;created_at:string};
const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n/100);
const safePaypal=(value:unknown)=>typeof value==="string"&&value.startsWith("https://www.paypal.com/");

export default function EmpresiaCheckout(){
 const [offer,setOffer]=useState<Offer|null>(null);
 const [order,setOrder]=useState<Order|null>(null);
 const [slug,setSlug]=useState("");
 const [orderId,setOrderId]=useState("");
 const [returnState,setReturnState]=useState("");
 const [loggedIn,setLoggedIn]=useState<boolean|null>(null);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 const processed=useRef(false);

 const loadOrder=useCallback(async(id:string)=>{
  const {data,error:e}=await supabase.from("empresia_checkout_orders")
   .select("id,kind,status,amount_cents,paypal_order_id,paypal_subscription_id,created_at")
   .eq("id",id).maybeSingle();
  if(e||!data)return null;
  const found=data as Order;
  setOrder(found);return found;
 },[]);

 const reconcile=useCallback(async(id:string,action:"capture"|"sync")=>{
  setBusy(true);setError("");setMessage("");
  const {data,error:e}=await supabase.functions.invoke("empresia-commerce",{
   body:{action,order_id:id}
  });
  if(e||!data||data.error){
   setError("La operación no pudo confirmarse. No repitas el cobro; consulta el estado antes de intentarlo de nuevo.");
  }else if(["paid","already_paid","active"].includes(String(data.status))){
   setMessage("Pago confirmado por PayPal. Tu compra está registrada.");
  }else if(data.status==="awaiting_approval"||data.status==="awaiting_payment"){
   setMessage("PayPal todavía no confirma el pago. No se ha habilitado el producto.");
  }else{
   setMessage("Estado verificado: "+String(data.status??"en revisión")+".");
  }
  await loadOrder(id);
  setBusy(false);
 },[loadOrder]);

 useEffect(()=>{
  let alive=true;
  const query=new URLSearchParams(window.location.search);
  const offerSlug=query.get("offer")??"";
  const id=query.get("order")??"";
  const paypal=query.get("paypal")??"";
  setSlug(offerSlug);setOrderId(id);setReturnState(paypal);
  void (async()=>{
    const {data:{session}}=await supabase.auth.getSession();
    if(!alive)return;
    setLoggedIn(Boolean(session));
    if(offerSlug){
     const {data,error:e}=await supabase.from("empresia_offers")
      .select("id,slug,title,description,kind,usd_price_cents,fulfillment")
      .eq("slug",offerSlug).eq("status","published").maybeSingle();
     if(e||!data)setError("Esta oferta no está publicada o ya no está disponible.");
     else setOffer(data as Offer);
    }
    if(id&&session){
     await loadOrder(id);
     if(paypal==="approved"&&!processed.current){
      processed.current=true;
      await reconcile(id,"capture");
     }else if(paypal==="cancelled"){
      setMessage("Has vuelto sin finalizar el pago. Ningún acceso se activa sin confirmación de PayPal.");
     }
    }
    if(alive)setLoading(false);
  })();
  return()=>{alive=false;};
 },[loadOrder,reconcile]);

 async function beginCheckout(){
  if(!offer||busy||!loggedIn)return;
  setBusy(true);setError("");setMessage("");
  const {data,error:e}=await supabase.functions.invoke("empresia-commerce",{
   body:{action:"checkout",offer_slug:offer.slug}
  });
  if(e||!data||data.error){
   const key=data?.error;
   setError(key==="already_purchased"?"Ya tienes una compra o servicio activo de esta oferta.":
    "No se pudo preparar la autorización en PayPal. No se realizó ningún cobro.");
   setBusy(false);return;
  }
  if(!safePaypal(data.approval_url)){
   setError("PayPal no devolvió un enlace de autorización válido.");setBusy(false);return;
  }
  window.location.assign(data.approval_url);
 }
 const nextPath="/empresia/checkout"+(typeof window!=="undefined"?window.location.search:"");
 const loginHref="/login?next="+encodeURIComponent(nextPath);
 const status=order?.status;
 const success=status==="paid"||status==="active";
 return <main className="content" style={{maxWidth:760,minHeight:"100vh",margin:"0 auto"}}>
  <header className="topbar">
   <div><Link href="/empresia" aria-label="Empresia, inicio"><Image src="/empresia-logo.svg" width={145} height={41} alt="Empresia" unoptimized/></Link><div className="eyebrow">EMPRESIA · CHECKOUT SEGURO</div>
    <h1>{order?"Estado de tu compra":"Confirmar contratación"}</h1>
    <p className="muted">Pago procesado por PayPal, con confirmación verificada desde el servidor.</p>
   </div>
   <Link href="/empresia/tienda" className="button">Catálogo</Link>
  </header>
  {loading&&<p className="muted" role="status">Preparando checkout…</p>}
  {error&&<div className="notice" role="alert">{error}</div>}
  {message&&<div className="notice" role="status">{message}</div>}
  {order&&<section className="card" aria-label="Estado de la orden">
    <div className="eyebrow">Orden {order.id.slice(0,8)}</div>
    <h2>{success?"Pago confirmado":status==="awaiting_approval"?"Pendiente de autorización":"Orden registrada"}</h2>
    <div style={{fontWeight:800,fontSize:31,margin:"16px 0"}}>{money(order.amount_cents)}{order.kind==="monthly"&&<span style={{fontSize:14,fontWeight:400}}> / mes</span>}</div>
    {success?<p>PayPal confirmó la operación. Consulta el acceso o la gestión del servicio en tus compras.</p>:
      <p className="muted">Ningún producto se habilita solo por regresar de PayPal. Si ya autorizaste el pago, pulsa comprobar estado.</p>}
    {!success&&loggedIn&&<button className="button primary" disabled={busy} onClick={()=>void reconcile(order.id,returnState==="approved"?"capture":"sync")}>
      {busy?"Comprobando PayPal…":"Comprobar estado en PayPal"}
    </button>}
    <Link className="button" href="/empresia/mis-compras" style={{marginTop:12,marginLeft:8}}>Mis compras</Link>
  </section>}
  {!order&&!loading&&offer&&<section className="card">
   <div className="eyebrow">{offer.kind==="monthly"?"Suscripción mensual":"Compra única"}</div>
   <h2>{offer.title}</h2>
   <p className="muted" style={{whiteSpace:"pre-wrap"}}>{offer.description}</p>
   <div className="priority-item" style={{marginTop:20}}>
    <strong>Total autorizado</strong>
    <strong style={{fontSize:24}}>{money(offer.usd_price_cents)}{offer.kind==="monthly"&&" / mes"}</strong>
   </div>
   <p className="muted" style={{fontSize:12,marginTop:14}}>
    {offer.kind==="monthly"
     ?"Al continuar, PayPal mostrará los términos de renovación y te pedirá autorización antes de establecer cobros recurrentes."
     :"Después de aprobar el pago en PayPal, confirmaremos la transacción antes de registrar tu compra."}
   </p>
   {loggedIn?
    <button type="button" className="button primary" disabled={busy} onClick={()=>void beginCheckout()} style={{marginTop:12,width:"100%"}}>
      {busy?"Preparando PayPal…":offer.kind==="monthly"?"Autorizar suscripción en PayPal":"Continuar a PayPal"}
    </button>:
    <Link href={loginHref} className="button primary" style={{marginTop:12,width:"100%"}}>
      Acceder o registrarme para comprar
    </Link>}
  </section>}
  {!loading&&!offer&&!order&&!error&&<section className="card">No se encontró una compra en esta dirección. <Link href="/empresia/tienda">Ver catálogo</Link></section>}
  <p className="muted" style={{fontSize:12,marginTop:18}}>
   Empresia no almacena el número de tu tarjeta. La verificación, dirección y métodos disponibles dependen de PayPal.
  </p>
 </main>;
}

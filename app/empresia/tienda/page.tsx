"use client";

import Link from "next/link";
import {useEffect,useState} from "react";
import {supabase} from "@/lib/supabase";

type Offer={id:string;slug:string;title:string;description:string;kind:"one_time"|"monthly";usd_price_cents:number;fulfillment:string};
const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n/100);

export default function EmpresiaTienda(){
 const [offers,setOffers]=useState<Offer[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 useEffect(()=>{
  let live=true;
  void (async()=>{
    const {data,error:e}=await supabase.from("empresia_offers")
      .select("id,slug,title,description,kind,usd_price_cents,fulfillment")
      .eq("status","published").order("created_at",{ascending:false});
    if(!live)return;
    if(e)setError("No fue posible consultar las ofertas disponibles.");
    else setOffers((data??[]) as Offer[]);
    setLoading(false);
  })();
  return()=>{live=false;};
 },[]);
 return <main className="content" style={{maxWidth:1080,minHeight:"100vh",margin:"0 auto"}}>
  <header className="topbar" style={{alignItems:"center"}}>
   <div><div className="eyebrow">EMPRESIA · SOFTWARE Y SERVICIOS</div>
    <h1>Soluciones para hacer crecer tu negocio</h1>
    <p className="muted">Compra única o suscripción mensual. Todos los precios en dólares estadounidenses.</p>
   </div>
   <Link className="button" href="/empresia/mis-compras">Mis compras</Link>
  </header>
  {error&&<div className="notice" role="alert">{error}</div>}
  {loading?<p className="muted" role="status">Consultando catálogo…</p>:
   offers.length===0?<div className="card" role="status">
    <h2>Estamos preparando las soluciones disponibles</h2>
    <p className="muted">Aún no hay ofertas publicadas. Ningún precio se publica sin aprobación.</p>
   </div>:
   <div className="grid three-col">
    {offers.map(offer=><article className="card" key={offer.id} style={{display:"flex",flexDirection:"column",gap:14}}>
      <div className="eyebrow">{offer.kind==="monthly"?"Suscripción mensual":"Compra única"}</div>
      <h2>{offer.title}</h2>
      <p className="muted" style={{flex:1,whiteSpace:"pre-wrap"}}>{offer.description}</p>
      <div style={{fontWeight:800,fontSize:27}}>{money(offer.usd_price_cents)}{offer.kind==="monthly"&&<span style={{fontSize:13,fontWeight:500}}> / mes</span>}</div>
      <Link href={"/empresia/checkout?offer="+encodeURIComponent(offer.slug)} className="button primary">
        {offer.kind==="monthly"?"Ver suscripción":"Contratar y pagar"}
      </Link>
    </article>)}
   </div>}
  <p className="muted" style={{fontSize:12,marginTop:24}}>
   Los pagos se procesan mediante PayPal. La disponibilidad de tarjeta y los datos requeridos dependen de PayPal y del país del comprador.
  </p>
 </main>;
}

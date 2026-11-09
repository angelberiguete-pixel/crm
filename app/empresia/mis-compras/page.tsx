"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {supabase} from "@/lib/supabase";

type Order={id:string;status:string;kind:string;amount_cents:number;created_at:string;offer_id:string};
type Offer={id:string;title:string};
type Entitlement={order_id:string;status:string};
const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n/100);

export default function MisCompras(){
 const [user,setUser]=useState<boolean|null>(null);
 const [orders,setOrders]=useState<Order[]>([]);
 const [offers,setOffers]=useState<Record<string,string>>({});
 const [entitlements,setEntitlements]=useState<Record<string,string>>({});
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 useEffect(()=>{
  let live=true;
  void (async()=>{
   const {data:{session}}=await supabase.auth.getSession();
   if(!live)return;
   if(!session){setUser(false);setLoading(false);return;}
   setUser(true);
   const [res,offerRes,grants]=await Promise.all([
    supabase.from("empresia_checkout_orders")
     .select("id,status,kind,amount_cents,created_at,offer_id")
     .order("created_at",{ascending:false}).limit(100),
    supabase.from("empresia_offers").select("id,title"),
    supabase.from("empresia_entitlements").select("order_id,status")
   ]);
   if(!live)return;
   if(res.error){setError("No se pudo cargar el historial de compras.");setLoading(false);return;}
   setOrders((res.data??[]) as Order[]);
   setOffers(Object.fromEntries(((offerRes.data??[]) as Offer[]).map(x=>[x.id,x.title])));
   setEntitlements(Object.fromEntries(((grants.data??[]) as Entitlement[]).map(x=>[x.order_id,x.status])));
   setLoading(false);
  })();
  return()=>{live=false;};
 },[]);
 return <main className="content" style={{maxWidth:1000,margin:"0 auto",minHeight:"100vh"}}>
  <header className="topbar">
   <div><div className="eyebrow">EMPRESIA · MI CUENTA</div>
    <h1>Mis compras y suscripciones</h1>
    <p className="muted">Consulta pagos confirmados, autorizaciones y servicios pendientes de habilitación.</p>
   </div><Link className="button" href="/empresia/tienda">Ver catálogo</Link>
  </header>
  {error&&<div role="alert" className="notice">{error}</div>}
  {loading?<p role="status">Consultando tus compras…</p>:!user?
   <section className="card"><h2>Accede a tu cuenta</h2>
    <p className="muted">El historial es privado y se consulta con tu sesión de comprador.</p>
    <Link className="button primary" href="/login?next=%2Fempresia%2Fmis-compras">Acceder o crear cuenta</Link>
   </section>:
   orders.length===0?<section className="card"><h2>Todavía no tienes compras registradas</h2>
    <Link href="/empresia/tienda" className="button primary">Explorar soluciones</Link></section>:
   <div className="grid" style={{gap:12}}>
    {orders.map(o=><article key={o.id} className="card" style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:14,flexWrap:"wrap"}}>
      <div style={{minWidth:200}}>
       <div className="eyebrow">{o.kind==="monthly"?"Suscripción":"Compra única"} · {new Date(o.created_at).toLocaleDateString("es-DO")}</div>
       <h2 style={{marginBottom:8}}>{offers[o.offer_id]??"Solución Empresia"}</h2>
       <div className="muted">Orden {o.id.slice(0,8)} · {o.status==="paid"?"Pago confirmado":o.status==="active"?"Suscripción activa":o.status==="awaiting_approval"?"Esperando aprobación":o.status}</div>
       {entitlements[o.id]==="provisioning"&&<p className="muted" style={{fontSize:12}}>Pago confirmado. Configuración del servicio pendiente de habilitación por administración.</p>}
       {entitlements[o.id]==="active"&&<p className="muted" style={{fontSize:12}}>Derecho de acceso activo. La disponibilidad de cada módulo depende de su configuración.</p>}
      </div>
      <div style={{textAlign:"right"}}>
       <strong style={{fontSize:20}}>{money(o.amount_cents)}{o.kind==="monthly"&&"/mes"}</strong>
       <div><Link className="button small" href={"/empresia/checkout?order="+encodeURIComponent(o.id)}>Ver estado</Link></div>
      </div>
     </article>)}
   </div>}
 </main>;
}

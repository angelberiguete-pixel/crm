"use client";

import Link from "next/link";
import {useEffect,useState} from "react";
import {supabase} from "@/lib/supabase";

type Key="essential"|"growth"|"scale";
type Offer={slug:string;usd_price_cents:number;kind:string;status:string;paypal_plan_id:string|null};
const expected:Record<Key,number>={essential:8000,growth:46000,scale:80000};
const slugFor=(key:Key)=>"empresia-"+key;

/**
 * A PayPal recurring subscription is offered only after an owner has published
 * the matching USD plan. Never use a one-time PayPal payment link as a
 * substitute for authorization of monthly billing.
 */
export default function PricingCTA({plan}:{plan:Key}){
 const [state,setState]=useState<"loading"|"ready"|"unavailable">("loading");
 useEffect(()=>{
  let live=true;
  void (async()=>{
   try{
    const {data,error}=await supabase.from("empresia_offers")
     .select("slug,usd_price_cents,kind,status,paypal_plan_id")
     .eq("slug",slugFor(plan)).eq("status","published").maybeSingle();
    if(!live)return;
    const o=data as Offer|null;
    const matched=!error&&o?.kind==="monthly"&&o?.status==="published"&&
     Number(o.usd_price_cents)===expected[plan]&&
     typeof o.paypal_plan_id==="string"&&/^P-[A-Z0-9]+$/.test(o.paypal_plan_id);
    setState(matched?"ready":"unavailable");
   }catch{if(live)setState("unavailable");}
  })();
  return()=>{live=false;};
 },[plan]);
 if(state==="ready")return <div>
   <Link className="empresia-paypal-cta" href={"/empresia/checkout?offer="+slugFor(plan)}>Suscribirme con PayPal <span aria-hidden="true">↗</span></Link>
   <p className="empresia-paypal-status">Pago mensual autorizado en PayPal · verás los términos antes de confirmar.</p>
  </div>;
 return <div>
  <a className="empresia-paypal-cta empresia-paypal-cta--outline" href="#diagnostico">
   {state==="loading"?"Verificar disponibilidad del plan":"Solicitar activación del plan"} <span aria-hidden="true">↗</span>
  </a>
  <p className="empresia-paypal-status">{state==="loading"?"Comprobando el estado de PayPal…":"Suscripción PayPal en preparación. No se realizará ningún cobro desde esta solicitud."}</p>
 </div>;
}

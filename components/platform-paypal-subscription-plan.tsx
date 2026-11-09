"use client";

import {useCallback,useEffect,useState} from "react";
import {CreditCard,RefreshCw,ShieldCheck} from "lucide-react";
import {supabase} from "@/lib/supabase";
type Plan={plan_key:string;status:string;amount_cents:number;provider_plan_id:string|null};
const planKey="family-power-arm-usd80-month";

export default function PlatformPayPalSubscriptionPlan(){
  const [plan,setPlan]=useState<Plan|null>(null);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  const load=useCallback(async()=>{
    const {data,error:e}=await supabase.from("billing_gateway_plans")
      .select("plan_key,status,amount_cents,provider_plan_id").eq("plan_key",planKey).maybeSingle();
    if(e){setError("No se pudo consultar el catálogo de planes PayPal.");return;}
    setPlan(data as Plan|null);
  },[]);
  useEffect(()=>{void load();},[load]);
  async function ensurePlan(){
    if(busy||!plan||plan.status==="ready")return;
    if(!window.confirm("Se creará un producto y un plan de US$80 mensuales en tu cuenta PayPal Live. Esto NO cobra ni suscribe a ningún cliente. ¿Continuar?"))return;
    setBusy(true);setError("");setNotice("");
    const {data,error:e}=await supabase.functions.invoke("paypal-subscriptions",{
      body:{action:"ensure_plan"}
    });
    if(e||!data||data.status!=="ready"){
      setError("PayPal no pudo crear el plan. Revisa las credenciales Live, los permisos de Subscriptions y los registros de la función.");
    }else{
      setNotice("Plan mensual creado en PayPal. El cliente aún debe aprobar una suscripción.");
    }
    await load();setBusy(false);
  }
  return <section className="section-gap card" aria-label="Configuración PayPal mensual">
    <div className="eyebrow">Pasarela de pagos · Control central</div>
    <h2 style={{display:"flex",gap:9,alignItems:"center"}}><CreditCard size={20}/> Plan PayPal Family Power · US$80/mes</h2>
    <p className="muted">Una aplicación PayPal puede gestionar varios planes. Este plan es únicamente para la licencia y el mantenimiento de Family Power; el diseño es reutilizable para otras empresas.</p>
    {error&&<div className="notice" role="alert">{error}</div>}
    {notice&&<div className="notice" role="status">{notice}</div>}
    {!plan?<p className="muted">No hay configuración de plan disponible.</p>:<>
      <div className="priority-item">
        <strong>Estado: {plan.status==="ready"?"Creado en PayPal":plan.status==="pending"?"Por crear":plan.status==="provisioning"?"Creando":"Revisión requerida"}</strong>
        <span>{"US$"+(plan.amount_cents/100).toFixed(2)} mensual · USD</span>
      </div>
      {plan.provider_plan_id&&<p className="muted" style={{fontSize:12}}>PayPal Plan ID: {plan.provider_plan_id}</p>}
      {plan.status!=="ready"&&<button className="button primary" type="button" disabled={busy||plan.status==="provisioning"} onClick={()=>void ensurePlan()}>
        {busy?"Registrando en PayPal…":"Crear plan US$80 en PayPal Live"}
      </button>}
      <button type="button" className="button" style={{marginLeft:8}} disabled={busy} onClick={()=>void load()}><RefreshCw size={14}/> Actualizar</button>
    </>}
    <p className="muted" style={{fontSize:12,marginTop:15}}><ShieldCheck size={14} style={{verticalAlign:"middle",marginRight:4}}/> Crear el plan no autoriza cargos. Solo la aprobación explícita del cliente en PayPal puede iniciar su suscripción.</p>
  </section>;
}

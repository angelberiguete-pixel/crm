"use client";

import {useEffect,useMemo,useState} from "react";
import {supabase} from "@/lib/supabase";
import {
 followupRisk,quoteSignals,salesSignals,scoreMl,trainTenantModel,
 type MlOpportunity,type MlQuote,type MlQuoteItem,type MlStage,type MlTask,type MlTrainingExample,
} from "@/lib/tenant-ml";
import styles from "./crm-ml-hub.module.css";

type Section="ventas"|"cotizaciones"|"seguimiento"|"capacidades";
const sections:readonly [Section,string][]=[
 ["ventas","Ventas"],["cotizaciones","Cotizaciones"],["seguimiento","Seguimiento"],["capacidades","Próximas capacidades"]
];
const empty={
 opportunities:[] as MlOpportunity[],
 stages:[] as MlStage[],
 quotes:[] as MlQuote[],
 items:[] as MlQuoteItem[],
 tasks:[] as MlTask[],
 examples:[] as MlTrainingExample[]
};
export default function CrmMlHub({tenantId}:{tenantId:string}){
 const [data,setData]=useState(empty);
 const [active,setActive]=useState<Section>("ventas");
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [trainingAvailable,setTrainingAvailable]=useState(false);
 const [limited,setLimited]=useState(false);
 const [version,setVersion]=useState(0);
 useEffect(()=>{
  let alive=true;
  setData(empty);setError("");setLoading(true);setTrainingAvailable(false);setLimited(false);
  void(async()=>{
   try{
    const [o,s,q,i,t,e]=await Promise.all([
     supabase.from("opportunities").select("id,pipeline_id,stage_id,status,created_at,owner_user_id,last_activity_at,next_action_at")
      .eq("tenant_id",tenantId).order("created_at",{ascending:false}).limit(1000),
     supabase.from("pipeline_stages").select("id,pipeline_id,stage_type,position")
      .eq("tenant_id",tenantId).limit(500),
     supabase.from("quotations").select("id,opportunity_id,status,created_at,valid_until")
      .eq("tenant_id",tenantId).order("created_at",{ascending:false}).limit(1000),
     supabase.from("quotation_items").select("quotation_id")
      .eq("tenant_id",tenantId).limit(2500),
     supabase.from("tasks").select("opportunity_id,status,due_at")
      .eq("tenant_id",tenantId).limit(2500),
     supabase.from("crm_ml_training_examples").select("capability,features,positive,recorded_at")
      .eq("tenant_id",tenantId).order("recorded_at",{ascending:false}).limit(1000)
    ]);
    if(!alive)return;
    const missing=[o,s,q,i,t].find(x=>x.error)?.error;
    if(missing){setError("No se pudieron consultar los datos autorizados de esta empresa: "+missing.message);return;}
    setTrainingAvailable(!e.error);
    if(e.error)setError("El registro de aprendizaje está temporalmente indisponible; las prioridades se calculan por reglas sin probabilidades.");
    setLimited((o.data?.length??0)>=1000||(q.data?.length??0)>=1000||(i.data?.length??0)>=2500||(t.data?.length??0)>=2500||(e.data?.length??0)>=1000);
    setData({
     opportunities:(o.data??[]) as MlOpportunity[],
     stages:(s.data??[]) as MlStage[],
     quotes:(q.data??[]) as MlQuote[],
     items:(i.data??[]) as MlQuoteItem[],
     tasks:(t.data??[]) as MlTask[],
     examples:e.error?[]:(e.data??[]) as MlTrainingExample[]
    });
   }catch{
    if(alive)setError("No se pudo conectar con los datos de inteligencia comercial.");
   }finally{if(alive)setLoading(false);}
  })();
  return()=>{alive=false;};
 },[tenantId,version]);

 const salesModel=useMemo(()=>trainingAvailable?trainTenantModel("sales_win",data.examples):null,[data.examples,trainingAvailable]);
 const quoteModel=useMemo(()=>trainingAvailable?trainTenantModel("quote_acceptance",data.examples):null,[data.examples,trainingAvailable]);
 const sales=useMemo(()=>data.opportunities.filter(o=>o.status==="open").map(o=>({
   id:o.id,
   result:scoreMl("sales_win",salesSignals(o,data.stages,data.quotes,data.tasks),salesModel),
   risk:followupRisk(o)
  })).sort((a,b)=>b.result.score-a.result.score),[data,salesModel]);
 const quotes=useMemo(()=>data.quotes.filter(q=>q.status==="sent"||q.status==="draft").map(q=>({
   id:q.id,
   result:scoreMl("quote_acceptance",quoteSignals(q,data.items),quoteModel)
  })).sort((a,b)=>b.result.score-a.result.score),[data,quoteModel]);
 const attention=useMemo(()=>data.opportunities.filter(o=>o.status==="open").map(o=>({id:o.id,risk:followupRisk(o)}))
  .sort((a,b)=>({alta:0,media:1,baja:2}[a.risk.level]-{alta:0,media:1,baja:2}[b.risk.level])),[data.opportunities]);
 const salesLabels=data.examples.filter(e=>e.capability==="sales_win").length;
 const quoteLabels=data.examples.filter(e=>e.capability==="quote_acceptance").length;
 const urgent=attention.filter(x=>x.risk.level==="alta").length;
 const next=attention.filter(x=>x.risk.level==="media").length;
 const level=(n:number)=>n<25?"Baja":n<60?"Media":"Alta";
 const Score=({score,model}:{score:number;model:boolean})=><div className={styles.score}>
   <strong>{score}{model?"%":"/100"}</strong>
   <progress max={100} value={score} aria-label={model?"Estimación ML validada":"Prioridad operativa por reglas"}/>
 </div>;
 const Summary=({model,n,kind}:{model:typeof salesModel;n:number;kind:string})=>
 <p className={styles.intro}>{model?
   `Modelo estadístico de ${kind} validado con ${model.samples} resultados históricos. AUC de prueba: ${model.auc.toFixed(2)}; error Brier: ${model.brier.toFixed(2)}. Probabilidades aproximadas, no garantías.`:
   `Índice de prioridad basado en reglas (no es probabilidad de ${kind}). ${n} resultados verificados capturados; para activar ML hacen falta al menos 60 casos, dos clases y validación temporal satisfactoria.`}
 </p>;
 return <div className={styles.hub}>
  <section className={styles.hero}>
   <div>
    <div className={styles.eyebrow}>CRM/ARM · Inteligencia operativa</div>
    <h2>Centro de Machine Learning</h2>
    <p>Aprendizaje privado para cada empresa. Prioriza decisiones y detecta oportunidades sin enviar mensajes ni cambiar registros automáticamente.</p>
   </div>
   <button className="button" onClick={()=>setVersion(x=>x+1)} disabled={loading}>Actualizar análisis</button>
  </section>
  {error&&<p className={styles.warning} role="alert">{error}</p>}
  {loading?<p role="status">Analizando información de esta empresa…</p>:<>
   <div className={styles.metrics}>
    <div><span>Oportunidades abiertas</span><strong>{sales.length}</strong></div>
    <div><span>Cierres para aprender</span><strong>{salesLabels}</strong></div>
    <div><span>Cotizaciones abiertas</span><strong>{quotes.length}</strong></div>
    <div><span>Seguimientos vencidos</span><strong>{urgent}</strong></div>
   </div>
   {limited&&<p className={styles.warning}>El panel muestra una muestra limitada de registros recientes; no se utiliza para afirmar métricas históricas exhaustivas.</p>}
   <div className={styles.tabs} role="group" aria-label="Áreas del Centro ML">
    {sections.map(([key,title])=><button key={key} type="button" className={active===key?styles.selected:""}
     aria-pressed={active===key} onClick={()=>setActive(key)}>{title}</button>)}
   </div>
   {active==="ventas"&&<section className={styles.card}>
    <h3>Predicción de oportunidades</h3>
    <Summary model={salesModel} n={salesLabels} kind="cierre"/>
    {sales.length===0?<p>Esta empresa no tiene oportunidades abiertas.</p>:sales.slice(0,15).map(({id,result,risk},index)=>
      <div className={styles.record} key={id}>
       <div className={styles.recordMain}>
        <div><small>Oportunidad {index+1} · Ref. {id.slice(0,8)}</small><strong>{result.reasons.slice(0,2).join(" · ")}</strong></div>
        <Score score={result.score} model={result.mode==="validated_ml"}/>
       </div>
       <p className={styles.hint}>Seguimiento: {risk.reason}. El índice ordena prioridades, no modifica la probabilidad comercial ingresada.</p>
      </div>)}
   </section>}
   {active==="cotizaciones"&&<section className={styles.card}>
    <h3>Análisis de cotizaciones</h3>
    <Summary model={quoteModel} n={quoteLabels} kind="aceptación"/>
    {quotes.length===0?<p>No hay cotizaciones abiertas para priorizar.</p>:quotes.slice(0,15).map(({id,result},index)=>
      <div className={styles.record} key={id}>
       <div className={styles.recordMain}>
        <div><small>Cotización {index+1} · Ref. {id.slice(0,8)}</small><strong>{result.reasons.slice(0,2).join(" · ")}</strong></div>
        <Score score={result.score} model={result.mode==="validated_ml"}/>
       </div>
       <p className={styles.hint}>Solo análisis; precios, descuentos y aceptación siguen sujetos a aprobación humana.</p>
      </div>)}
   </section>}
   {active==="seguimiento"&&<section className={styles.card}>
    <h3>Riesgo de perder el seguimiento</h3>
    <p className={styles.intro}>Alertas verificables por vencimiento e inactividad. Son reglas operativas, no predicciones estadísticas.</p>
    <div className={styles.miniStats}><span>{urgent} vencidos</span><span>{next} sin actividad reciente</span></div>
    {attention.length===0?<p>No hay oportunidades abiertas.</p>:attention.slice(0,15).map(({id,risk},index)=>
      <div className={styles.record} key={id}>
       <div className={styles.recordMain}><div><small>Oportunidad {index+1} · Ref. {id.slice(0,8)}</small><strong>{risk.reason}</strong></div>
        <span className={styles.risk}>{risk.level}</span></div>
      </div>)}
   </section>}
   {active==="capacidades"&&<section className={styles.card}>
    <h3>Un motor común para toda la plataforma</h3>
    <div className={styles.capabilities}>
     <article><strong>Ventas y cotizaciones</strong><small>Reglas en funcionamiento; entrenamiento sujeto a resultados verificados</small></article>
     <article><strong>Tareas y seguimiento</strong><small>Alertas de fechas e inactividad en funcionamiento</small></article>
     <article><strong>Marketing, visitas e inbox</strong><small>Modelos por canal aún no implementados; requieren datos consentidos y validación</small></article>
     <article><strong>Agentes, inventario y operaciones</strong><small>Futuras integraciones con la misma autorización multiempresa</small></article>
    </div>
   </section>}
   <p className={styles.disclaimer}>Los modelos se entrenan por empresa y por tarea. No comparten registros entre empresas, no deciden cierres ni ejecutan acciones automáticas.</p>
  </>}
 </div>;
}

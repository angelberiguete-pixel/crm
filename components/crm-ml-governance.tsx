"use client";
import Link from "next/link";
import {useEffect,useMemo,useState} from "react";
import {supabase} from "@/lib/supabase";
import {assessOpportunityQuality,describeJourney,
 type JourneyEvent,type QualityOpportunity,type QualityStage} from "@/lib/crm-data-quality";
import CrmAgentAdvicePanel from "@/components/crm-agent-advice-panel";
import styles from "./crm-ml-hub.module.css";

type Tab="calidad"|"historial"|"agentes";
const tabs:readonly [Tab,string][]=[["calidad","Calidad de datos"],["historial","Historial de ventas"],["agentes","Agentes ARM"]];
export default function CrmMlGovernance({tenantId}:{tenantId:string}){
 const [tab,setTab]=useState<Tab>("calidad");
 const [rows,setRows]=useState<QualityOpportunity[]>([]);
 const [stages,setStages]=useState<QualityStage[]>([]);
 const [events,setEvents]=useState<JourneyEvent[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [limited,setLimited]=useState(false);
 const [revision,setRevision]=useState(0);
 useEffect(()=>{
  let live=true;
  setRows([]);setStages([]);setEvents([]);setLoading(true);setError("");setLimited(false);
  void(async()=>{
   try{
    const [o,s,h]=await Promise.all([
     supabase.from("opportunities").select(
      "id,title,status,stage_id,pipeline_id,contact_id,company_id,owner_user_id,next_action_at,last_activity_at,created_at,expected_close_date,actual_close_date,loss_reason,acquisition_source"
     ).eq("tenant_id",tenantId).order("created_at",{ascending:false}).limit(1000),
     supabase.from("pipeline_stages").select("id,pipeline_id,stage_type").eq("tenant_id",tenantId).limit(500),
     supabase.from("crm_opportunity_journey").select(
      "id,opportunity_id,event_type,from_stage_name,to_stage_name,from_status,to_status,occurred_at,is_historical_baseline"
     ).eq("tenant_id",tenantId).order("occurred_at",{ascending:false}).limit(200)
    ]);
    if(!live)return;
    if(o.error||s.error)throw new Error(o.error?.message??s.error?.message);
    setRows((o.data??[]) as QualityOpportunity[]);
    setStages((s.data??[]) as QualityStage[]);
    setLimited((o.data?.length??0)>=1000||(s.data?.length??0)>=500);
    if(h.error)setError("El historial no está disponible: "+h.error.message);
    else setEvents((h.data??[]) as JourneyEvent[]);
   }catch(e){if(live)setError("No se pudo auditar la calidad comercial: "+(e instanceof Error?e.message:"error de conexión"));}
   finally{if(live)setLoading(false);}
  })();
  return()=>{live=false;};
 },[tenantId,revision]);
 const quality=useMemo(()=>rows.map(o=>({o,q:assessOpportunityQuality(o,stages)}))
  .sort((a,b)=>a.q.score-b.q.score),[rows,stages]);
 const ready=quality.filter(x=>x.q.readyForProbability).length;
 const withoutNext=quality.filter(x=>x.o.status==="open"&&!x.o.next_action_at).length;
 const withoutActivity=quality.filter(x=>x.o.status==="open"&&!x.o.last_activity_at).length;
 const blocked=quality.filter(x=>x.q.issues.some(i=>i.blocking)).length;
 const names=useMemo(()=>new Map(rows.map(o=>[o.id,o.title])),[rows]);
 return <section aria-label="Gobierno de inteligencia del CRM" className={styles.hub}>
  <div className={styles.card}>
   <div className={styles.recordMain}>
    <div><h2>Calidad, trazabilidad y agentes</h2>
     <p className={styles.intro}>El sistema conserva cambios futuros, identifica registros incompletos y prepara recomendaciones verificables para revisión humana.</p></div>
    <button className="button" type="button" disabled={loading} onClick={()=>setRevision(v=>v+1)}>Actualizar</button>
   </div>
   <div className={styles.tabs} role="group" aria-label="Gobierno comercial">
    {tabs.map(([key,label])=><button key={key} aria-pressed={tab===key} type="button"
     className={tab===key?styles.selected:""} onClick={()=>setTab(key)}>{label}</button>)}
   </div>
  </div>
  {error&&<p role="alert" className={styles.warning}>{error}</p>}
  {loading?<p role="status">Verificando historial y calidad de esta empresa…</p>:<>
   {limited&&<p className={styles.warning}>La auditoría usa hasta 1000 oportunidades recientes y puede no representar todos los registros de la empresa.</p>}
   {tab==="calidad"&&<section className={styles.card}>
    <h3>Estado de los datos comerciales</h3>
    <div className={styles.metrics}>
     <div><span>Registros revisados</span><strong>{quality.length}</strong></div>
     <div><span>Aptos según reglas</span><strong>{ready}</strong></div>
     <div><span>Sin siguiente acción</span><strong>{withoutNext}</strong></div>
     <div><span>Sin actividad verificada</span><strong>{withoutActivity}</strong></div>
    </div>
    <p className={styles.intro}>{blocked} registros presentan al menos una inconsistencia importante. El puntaje de calidad es una lista de verificación, no una probabilidad de venta ni una certificación del origen de los datos.</p>
    {quality.length===0?<p>Esta empresa todavía no tiene oportunidades para auditar.</p>:
    quality.filter(x=>x.q.issues.length>0).slice(0,12).map(({o,q})=><article key={o.id} className={styles.record}>
      <div className={styles.recordMain}><div><small>{o.status==="open"?"Abierta":"Cerrada"} · Calidad {q.score}/100</small>
       <strong>{o.title}</strong></div><span className={styles.risk}>{q.readyForProbability?"Revisable":"Corregir"}</span></div>
      <p className={styles.hint}>{q.issues.slice(0,3).map(i=>i.label).join(" · ")}</p>
      <Link href="/crm/revenue" className="button" style={{display:"inline-flex",marginTop:9}}>Corregir en ventas</Link>
     </article>)}
    <p className={styles.disclaimer}>Solo se señalan inconsistencias; no se modifican registros automáticamente. La ausencia de actividades históricas no se interpreta como prueba de que no hubo contacto.</p>
   </section>}
   {tab==="historial"&&<section className={styles.card}>
    <h3>Movimientos y resultados comerciales</h3>
    <p className={styles.intro}>Historial creado desde su activación. Los registros anteriores reciben únicamente una fotografía inicial marcada como referencia; no se reconstruyen etapas ni cierres desconocidos.</p>
    {events.length===0?<p>Aún no hay movimientos registrados para esta empresa.</p>:
    events.slice(0,35).map(e=><article className={styles.record} key={e.id}>
      <div className={styles.recordMain}>
       <div><small>{new Date(e.occurred_at).toLocaleString("es-DO")} · {e.is_historical_baseline?"Punto de partida":"Cambio verificado"}</small>
        <strong>{names.get(e.opportunity_id)??"Referencia "+e.opportunity_id.slice(0,8)}</strong></div>
       <span className={styles.risk}>{e.to_status}</span>
      </div>
      <p className={styles.hint}>{describeJourney(e)}</p>
     </article>)}
    <p className={styles.disclaimer}>Se muestran los eventos más recientes. La identidad del actor se conserva en la base cuando la actualización proviene de una sesión autenticada; el historial no fabrica fechas anteriores.</p>
   </section>}
   {tab==="agentes"&&<CrmAgentAdvicePanel tenantId={tenantId}/>}
  </>}
 </section>;
}

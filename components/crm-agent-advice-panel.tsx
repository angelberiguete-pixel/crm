"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {supabase} from "@/lib/supabase";
import styles from "./crm-ml-hub.module.css";

type AgentAdvice={
 tenant_id:string;opportunity_id:string;opportunity_title:string;
 stage_name:string|null;recommendation_key:string;recommendation_reason:string;
 priority:"alta"|"media"|"baja";suggested_agent:string;
 evidence_source:string;requires_human_approval:boolean;verified_transitions:number;
};
const rank={alta:0,media:1,baja:2};
export default function CrmAgentAdvicePanel({tenantId,compact=false}:{tenantId:string;compact?:boolean}){
 const [items,setItems]=useState<AgentAdvice[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [revision,setRevision]=useState(0);
 const [limited,setLimited]=useState(false);
 useEffect(()=>{
  let live=true;setLoading(true);setError("");setItems([]);setLimited(false);
  void(async()=>{
   try{
    const response=await supabase.from("crm_arm_next_actions").select(
     "tenant_id,opportunity_id,opportunity_title,stage_name,recommendation_key,recommendation_reason,priority,suggested_agent,evidence_source,requires_human_approval,verified_transitions"
    ).eq("tenant_id",tenantId).limit(1000);
    if(!live)return;
    if(response.error)throw new Error(response.error.message);
    setLimited((response.data?.length??0)>=1000);
    const rows=(response.data??[]) as AgentAdvice[];
    setItems(rows.filter(x=>x.tenant_id===tenantId&&x.evidence_source==="crm_rules"&&x.requires_human_approval)
     .sort((a,b)=>rank[a.priority]-rank[b.priority]||b.verified_transitions-a.verified_transitions));
   }catch(e){if(live)setError("No se pudieron leer recomendaciones autorizadas: "+(e instanceof Error?e.message:"error de conexión"));}
   finally{if(live)setLoading(false);}
  })();
  return()=>{live=false;};
 },[tenantId,revision]);
 return <section className={styles.card} aria-label="Recomendaciones verificables para agentes ARM">
  <div className={styles.recordMain}>
   <div><h3>Recomendaciones para agentes ARM</h3><p className={styles.intro}>Contexto comercial de solo lectura para vendedor y supervisor. Las recomendaciones usan reglas y evidencia de la empresa, no órdenes automáticas.</p></div>
   <button type="button" className="button" onClick={()=>setRevision(n=>n+1)} disabled={loading}>Actualizar</button>
  </div>
  {error&&<p role="alert" className={styles.warning}>{error}</p>}
  {loading?<p role="status">Consultando prioridades de esta empresa…</p>:items.length===0?<p>Por ahora no hay recomendaciones para oportunidades abiertas.</p>:<>
   {limited&&<p className={styles.warning}>Se muestra hasta un máximo de 1000 oportunidades. La lista no es un ranking completo.</p>}
   {items.slice(0,compact?5:15).map(x=><article className={styles.record} key={x.opportunity_id}>
    <div className={styles.recordMain}>
     <div>
      <small>{x.stage_name??"Etapa no disponible"} · Agente sugerido: {x.suggested_agent}</small>
      <strong>{x.opportunity_title}</strong>
     </div>
     <span className={styles.risk}>{x.priority}</span>
    </div>
    <p className={styles.hint}>{x.recommendation_reason} {x.verified_transitions>0?`· ${x.verified_transitions} cambios verificados.`:"· Sin transiciones nuevas verificadas."}</p>
    <Link href="/crm/revenue" className="button" style={{display:"inline-flex",marginTop:9}}>Revisar oportunidad</Link>
   </article>)}
  </>}
  <p className={styles.disclaimer}>No envía WhatsApp, no genera cotizaciones ni cambia etapas. El vendedor o supervisor debe revisar y aprobar cualquier acción. No se transmite información a modelos externos.</p>
 </section>;
}

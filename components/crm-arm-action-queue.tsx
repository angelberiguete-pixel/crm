"use client";
import {useEffect,useState} from "react";
import {supabase} from "@/lib/supabase";
import {useActiveTenant} from "@/components/tenant-context";
import styles from "./crm-ml-hub.module.css";

type Recommendation={opportunity_id:string;recommendation_key:string;recommendation_reason:string;opportunity_title:string};
type Intervention={
 id:string;tenant_id:string;opportunity_id:string;recommendation_key:string;recommendation_reason:string;
 status:"proposed"|"approved"|"rejected"|"stale"|"executed"|"measured";
 task_id:string|null;observed_result:string|null;proposed_at:string;proposed_by:string;
 reviewed_by:string|null;executed_by:string|null;measured_by:string|null;
};
type Learned={tenant_id:string;recommendation_key:string;measured_count:number;progress_count:number;won_count:number;lost_count:number;no_progress_count:number};
const statusLabels:Record<Intervention["status"],string>={
 proposed:"Pendiente de aprobación",approved:"Aprobada",rejected:"Rechazada",
 stale:"Necesita nueva evaluación",executed:"Tarea creada",measured:"Resultado observado"
};
const resultLabels:Record<string,string>={
 won:"Oportunidad ganada",advanced:"Avanzó de etapa",lost:"Oportunidad perdida",
 no_progress_after_7d:"Sin avance observado tras 7 días"
};
const codes:Record<string,string>={
 not_authorized:"Tu rol no permite ejecutar esta acción.",
 approval_requires_owner_or_admin:"La aprobación requiere propietario o administrador.",
 opportunity_not_open:"La oportunidad ya no está abierta.",
 recommendation_changed:"La recomendación cambió; actualiza el panel.",
 intervention_not_pending:"Esta intervención ya fue revisada.",
 action_not_approved:"La intervención requiere aprobación previa.",
 intervention_not_executed:"Primero debes ejecutar la intervención.",
 task_must_be_completed_first:"Marca la tarea como completada antes de evaluar resultados.",
 result_window_not_finished:"Aún no se observa avance. Se necesitan 7 días desde la finalización para registrar ausencia de progreso."
};
function friendly(message:string){const found=Object.entries(codes).find(([key])=>message.includes(key));return found?.[1]??"No se pudo completar la operación: "+message;}
export default function CrmArmActionQueue({tenantId,recommendations}:{tenantId:string;recommendations:Recommendation[]}){
 const tenant=useActiveTenant();
 const approver=["owner","admin"].includes(tenant?.membership_role??"");
 const [rows,setRows]=useState<Intervention[]>([]);
 const [learning,setLearning]=useState<Learned[]>([]);
 const [pending,setPending]=useState<string|null>(null);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [loading,setLoading]=useState(true);
 const [revision,setRevision]=useState(0);
 useEffect(()=>{
  let alive=true;
  setRows([]);setLearning([]);setLoading(true);setError("");
  void(async()=>{
   try{
    const [a,l]=await Promise.all([
     supabase.from("crm_arm_interventions")
      .select("id,tenant_id,opportunity_id,recommendation_key,recommendation_reason,status,task_id,observed_result,proposed_at,proposed_by,reviewed_by,executed_by,measured_by")
      .eq("tenant_id",tenantId).order("proposed_at",{ascending:false}).limit(60),
     supabase.from("crm_arm_intervention_learning")
      .select("tenant_id,recommendation_key,measured_count,progress_count,won_count,lost_count,no_progress_count")
      .eq("tenant_id",tenantId)
    ]);
    if(!alive)return;
    if(a.error||l.error)throw new Error(a.error?.message??l.error?.message);
    setRows((a.data??[]) as Intervention[]);
    setLearning((l.data??[]) as Learned[]);
   }catch(e){if(alive)setError("No se pudo leer el circuito de aprobación: "+(e instanceof Error?e.message:"error"));}
   finally{if(alive)setLoading(false);}
  })();
  return()=>{alive=false;};
 },[tenantId,revision]);

 async function act(kind:"propose"|"approve"|"reject"|"execute"|"complete"|"measure",r:Recommendation|Intervention){
  if(pending)return;
  setError("");setNotice("");
  const id="id" in r?r.id:r.opportunity_id;
  setPending(id+"-"+kind);
  try{
   let res:{data:unknown;error:{message:string}|null};
   if(kind==="propose"){
    const item=r as Recommendation;
    res=await supabase.rpc("crm_arm_propose_intervention",{
     p_tenant_id:tenantId,p_opportunity_id:item.opportunity_id,p_recommendation_key:item.recommendation_key
    });
   }else{
    const action=r as Intervention;
    const args={p_tenant_id:tenantId,p_intervention_id:action.id};
    res=kind==="approve"||kind==="reject"?
      await supabase.rpc("crm_arm_review_intervention",{...args,p_approve:kind==="approve"}):
      kind==="execute"?await supabase.rpc("crm_arm_execute_intervention",args):
      kind==="complete"?await supabase.rpc("crm_arm_complete_intervention_task",args):
      await supabase.rpc("crm_arm_measure_intervention",args);
   }
   if(res.error)throw new Error(res.error.message);
   setNotice(kind==="propose"?"Propuesta creada. Requiere aprobación humana.":
    kind==="approve"?"Intervención aprobada; todavía no se ha ejecutado.":
    kind==="reject"?"Propuesta rechazada y registrada.":
    kind==="execute"?(res.data?"Tarea interna creada. Ningún mensaje fue enviado.":"La oportunidad cambió: propuesta marcada como desactualizada."):
    kind==="complete"?"Tarea marcada como completada. Ya puede evaluarse el avance observado.":
    "Resultado registrado: "+(resultLabels[String(res.data)]??String(res.data)));
   setRevision(v=>v+1);
  }catch(e){setError(friendly(e instanceof Error?e.message:"error de conexión"));}
  finally{setPending(null);}
 }
 const activeKeys=new Set(rows.filter(x=>["proposed","approved","executed"].includes(x.status))
  .map(x=>x.opportunity_id+":"+x.recommendation_key));
 const available=recommendations.filter(x=>!activeKeys.has(x.opportunity_id+":"+x.recommendation_key)).slice(0,5);
 return <section className={styles.card} aria-label="Intervenciones ARM supervisadas">
  <h3>Propuesta → aprobación → tarea → resultado</h3>
  <p className={styles.intro}>El CRM ejecuta exclusivamente tareas internas después de una aprobación de propietario o administrador. No envía mensajes ni cambia automáticamente el estado de ventas.</p>
  {error&&<p className={styles.warning} role="alert">{error}</p>}
  {notice&&<p className={styles.hint} role="status">{notice}</p>}
  {loading?<p role="status">Consultando aprobaciones de la empresa…</p>:<>
   {available.map(r=><div className={styles.record} key={r.opportunity_id+":"+r.recommendation_key}>
    <div className={styles.recordMain}><div><small>{r.opportunity_title}</small><strong>{r.recommendation_reason}</strong></div>
     <button className="button" disabled={!!pending} onClick={()=>act("propose",r)}>Proponer</button></div>
   </div>)}
   {rows.length>0&&<div style={{marginTop:16}}>
    <h3>Registro de intervenciones</h3>
    {rows.slice(0,15).map(a=><article className={styles.record} key={a.id}>
     <div className={styles.recordMain}><div><small>{new Date(a.proposed_at).toLocaleString("es-DO")} · {a.recommendation_key.replaceAll("_"," ")}</small>
      <strong>{a.recommendation_reason}</strong></div><span className={styles.risk}>{statusLabels[a.status]}</span></div>
     {a.observed_result&&<p className={styles.hint}>Resultado observado: {resultLabels[a.observed_result]??a.observed_result}</p>}
     <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:10}}>
      {a.status==="proposed"&&approver&&<>
       <button className="button primary" disabled={!!pending} onClick={()=>act("approve",a)}>Aprobar</button>
       <button className="button" disabled={!!pending} onClick={()=>act("reject",a)}>Rechazar</button>
      </>}
      {a.status==="approved"&&<button className="button primary" disabled={!!pending} onClick={()=>act("execute",a)}>Crear tarea autorizada</button>}
      {a.status==="executed"&&<>
       <button className="button" disabled={!!pending} onClick={()=>act("complete",a)}>Marcar tarea realizada</button>
       <button className="button" disabled={!!pending} onClick={()=>act("measure",a)}>Evaluar resultado</button>
      </>}
     </div>
    </article>)}
   </div>}
   <h3 style={{marginTop:18}}>Aprendizaje por intervención</h3>
   {learning.length===0?<p className={styles.intro}>Todavía no hay intervenciones con resultados observados. No se ha entrenado ningún modelo de eficacia.</p>:
   learning.map(x=><div className={styles.record} key={x.recommendation_key}>
    <div className={styles.recordMain}><div><small>{x.recommendation_key.replaceAll("_"," ")}</small>
     <strong>{x.measured_count} intervenciones evaluadas</strong></div>
     <span className={styles.risk}>{x.measured_count>=10?`${Math.round(100*x.progress_count/x.measured_count)}% con avance observado`:"Muestra insuficiente"}</span></div>
    <p className={styles.hint}>Ganadas: {x.won_count} · Avanzaron: {x.progress_count-x.won_count} · Perdidas: {x.lost_count} · Sin progreso tras 7 días: {x.no_progress_count}</p>
   </div>)}
  </>}
  <p className={styles.disclaimer}>Las métricas describen asociaciones observadas en cada empresa: no prueban que una acción haya causado el resultado. No se cruzan datos entre empresas ni se generan probabilidades ML con muestras insuficientes.</p>
 </section>;
}

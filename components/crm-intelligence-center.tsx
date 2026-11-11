"use client";

import Link from "next/link";
import {useEffect,useState} from "react";
import {BrainCircuit,RefreshCw,ShieldCheck,CheckCheck,AlertTriangle,Workflow} from "lucide-react";
import {supabase} from "@/lib/supabase";
import {useActiveTenant} from "@/components/tenant-context";
import styles from "./crm-intelligence-center.module.css";
import CrmIntelligenceDraft from "@/components/crm-intelligence-draft";

type BrainDecision={
 id:string;tenant_id:string;action_key:string;risk_level:string;
 reason_code:string;status:string;event_id:string;task_id:string|null;
 created_at:string;reviewed_at:string|null;executed_at:string|null;
 evidence:Record<string,unknown>|null;
};
type Learning={action_key:string;proposed_count:number;approved_count:number;executed_count:number;task_completed_count:number};
const stages=[
 {label:"Percibir",detail:"Eventos reales del CRM, canales y ERP"},
 {label:"Contexto",detail:"Identidad y registros de la empresa"},
 {label:"Decidir",detail:"Propuesta con motivo verificable"},
 {label:"Política",detail:"Roles, alcance y revisión humana"},
 {label:"Ejecutar",detail:"Solo tareas internas autorizadas"},
 {label:"Observar",detail:"Resultado registrado del trabajo"},
 {label:"Aprender",detail:"Resultados comprobados, sin inventar ventas"},
] as const;
const actionTitle:Record<string,string>={
 review_inbound:"Consulta recibida",qualify_contact:"Calificar contacto",
 review_opportunity:"Revisar oportunidad",review_quotation:"Revisar cotización",
 coordinate_order:"Coordinar pedido",followup_delivery:"Revisar entrega",
 verify_payment:"Verificar pago con proveedor"
};
const statusTitle:Record<string,string>={
 proposed:"Pendiente de revisión",approved:"Aprobada",rejected:"Rechazada",
 executed:"Tarea creada",observed:"Tarea terminada y medida"
};
const time=(date:string)=>new Intl.DateTimeFormat("es-DO",{dateStyle:"medium",timeStyle:"short"}).format(new Date(date));
export default function CrmIntelligenceCenter(){
 const tenant=useActiveTenant();
 const id=tenant?.tenant_slug==="eurevector"?tenant.tenant_id:null;
 const canReview=["owner","admin"].includes(tenant?.membership_role??"");
 const [decisions,setDecisions]=useState<BrainDecision[]>([]);
 const [learning,setLearning]=useState<Learning[]>([]);
 const [eventCount,setEventCount]=useState<number|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [saving,setSaving]=useState<string|null>(null);
 const [revision,setRevision]=useState(0);
 useEffect(()=>{
  let alive=true;
  setDecisions([]);setLearning([]);setEventCount(null);setLoading(true);setError("");
  if(!id){setLoading(false);return()=>{alive=false;};}
  void Promise.all([
    supabase.from("empresia_brain_decisions")
     .select("id,tenant_id,action_key,risk_level,reason_code,status,event_id,task_id,created_at,reviewed_at,executed_at,evidence")
     .eq("tenant_id",id).order("created_at",{ascending:false}).limit(40),
    supabase.from("empresia_brain_learning")
     .select("action_key,proposed_count,approved_count,executed_count,task_completed_count")
     .eq("tenant_id",id),
    supabase.from("empresia_brain_events").select("id",{head:true,count:"exact"}).eq("tenant_id",id),
  ]).then(([d,l,e])=>{
    if(!alive)return;
    if(d.error||l.error||e.error){
      setError("El núcleo de Empresia Intelligence todavía no está habilitado para esta empresa, o la lectura está restringida por permisos. No se muestran datos simulados.");
      return;
    }
    setDecisions((d.data??[]) as BrainDecision[]);
    setLearning((l.data??[]) as Learning[]);
    setEventCount(e.count??0);
  }).catch(()=>{if(alive)setError("No se pudo consultar el cerebro operativo. Comprueba tu conexión y permisos.");})
   .finally(()=>{if(alive)setLoading(false);});
  return()=>{alive=false};
 },[id,revision]);
 async function change(idDecision:string,action:"approve"|"reject"|"execute"){
   if(!id||!canReview||saving)return;
   setSaving(idDecision);setNotice("");
   try{
    const result=action==="execute"
     ?await supabase.rpc("empresia_brain_execute_task",{p_tenant_id:id,p_decision_id:idDecision})
     :await supabase.rpc("empresia_brain_review",{p_tenant_id:id,p_decision_id:idDecision,p_approve:action==="approve"});
    if(result.error)throw result.error;
    setNotice(action==="execute"
     ?"Tarea interna creada y auditada. No se envió ningún mensaje ni factura."
     :action==="approve"?"Revisión aprobada; la tarea aún no se ha ejecutado.":"Recomendación rechazada.");
    setRevision(x=>x+1);
   }catch(e){setNotice("Acción no realizada: "+(e instanceof Error?e.message:"no autorizada"));}
   finally{setSaving(null);}
 }
 const totals=learning.reduce((a,v)=>({
   proposed:a.proposed+Number(v.proposed_count||0),
   executed:a.executed+Number(v.executed_count||0),
   observed:a.observed+Number(v.task_completed_count||0)
 }),{proposed:0,executed:0,observed:0});
 if(!id)return <main className={styles.page}><p>Este módulo está habilitado únicamente para el piloto interno de Empresia.</p></main>;
 return <main className={styles.page}>
  <header className={styles.heading}>
   <div>
    <p className={styles.overline}>Empresia · Motor central multiempresa</p>
    <h1><BrainCircuit size={28}/> Intelligence Engine</h1>
    <p className={styles.subtitle}>Observa operaciones, propone acciones verificables, exige permisos y registra resultados. Empresa activa: <strong>{tenant?.tenant_name??"Sin empresa"}</strong>.</p>
   </div>
   <button type="button" className={styles.refresh} onClick={()=>setRevision(v=>v+1)} disabled={loading||!!saving}>
    <RefreshCw size={16}/> Actualizar
   </button>
  </header>
  <section className={styles.process} aria-label="Siete etapas del motor de decisión">
   {stages.map((stage,i)=><article key={stage.label}>
    <small>{String(i+1).padStart(2,"0")}</small>
    <strong>{stage.label}</strong><span>{stage.detail}</span>
   </article>)}
  </section>
  {error&&<p role="alert" className={styles.warning}><AlertTriangle size={17}/>{error}</p>}
  {notice&&<p role="status" className={styles.notice}>{notice}</p>}
  <section className={styles.summary} aria-label="Actividad comprobada de la empresa">
   <div><span>Eventos observados</span><strong>{loading?"…":eventCount??"—"}</strong></div>
   <div><span>Decisiones propuestas</span><strong>{loading?"…":error?"—":totals.proposed}</strong></div>
   <div><span>Tareas ejecutadas</span><strong>{loading?"…":error?"—":totals.executed}</strong></div>
   <div><span>Tareas terminadas</span><strong>{loading?"…":error?"—":totals.observed}</strong></div>
  </section>
  <section className={styles.panel}>
   <div className={styles.sectionHeading}>
    <div><h2>Cola de decisiones</h2><p>Hasta 40 decisiones recientes, siempre de la empresa activa. No se atribuyen ventas ni respuestas sin evidencia.</p></div>
    <Link href="/crm/revenue" className={styles.link}><Workflow size={16}/> Oportunidades</Link>
   </div>
   {loading?<p role="status">Comprobando eventos y autorizaciones…</p>:decisions.length===0&&!error?<p>Sin decisiones registradas. La cola comienza a alimentarse cuando existen operaciones reales y se activa la migración del motor.</p>:null}
   <div className={styles.queue}>
    {decisions.map(d=><article key={d.id} className={styles.decision}>
      <div className={styles.decisionTop}><strong>{actionTitle[d.action_key]??"Revisión comercial"}</strong><span>{statusTitle[d.status]??d.status}</span></div>
      <small>{time(d.created_at)} · Riesgo: {d.risk_level} · Evidencia: {d.reason_code.replaceAll("_"," ")}</small>
      {canReview&&id&&d.action_key==="review_inbound"&&d.status!=="rejected"&&<CrmIntelligenceDraft tenantId={id} evidence={d.evidence??{}}/>}
      {d.task_id&&<div className={styles.taskRef}><CheckCheck size={16}/> Tarea interna vinculada. No implica venta, pago ni respuesta enviada.</div>}
      {canReview&&d.status==="proposed"&&<div className={styles.actions}>
       <button type="button" disabled={!!saving} onClick={()=>void change(d.id,"approve")}>Aprobar tarea interna</button>
       <button type="button" disabled={!!saving} className={styles.secondary} onClick={()=>void change(d.id,"reject")}>Rechazar</button>
      </div>}
      {canReview&&d.status==="approved"&&<div className={styles.actions}>
       <button type="button" disabled={!!saving} onClick={()=>void change(d.id,"execute")}>Crear tarea autorizada</button>
      </div>}
    </article>)}
   </div>
  </section>
  <aside className={styles.safety}>
   <ShieldCheck size={22}/>
   <div><strong>Autonomía controlada, no ficticia</strong>
    <p>Esta versión detecta eventos y crea propuestas automáticamente cuando los datos llegan al CRM. Solo puede ejecutar tareas internas tras autorización del propietario o administrador. WhatsApp, promociones, precios, ERP financiero, pagos y e-CF permanecen fuera de la ejecución automática hasta integrar controles específicos.</p>
   </div>
  </aside>
 </main>;
}

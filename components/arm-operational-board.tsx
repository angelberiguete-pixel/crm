"use client";

import Link from "next/link";
import {type FormEvent,useEffect,useState} from "react";
import {AlertCircle,CalendarClock,CheckCircle2,ClipboardList,RefreshCw,Target} from "lucide-react";
import {supabase} from "@/lib/supabase";

type WorkTask={id:string;title:string;status:string;priority:string;due_at:string|null};
type FollowUp={id:string;title:string;next_action:string|null;next_action_at:string};
type ProspectFollowUp={id:string;name:string;stage:string;next_action:string|null;next_action_at:string};
type Stage={stage:string;prospect_count:number};
type QueueState={
 tasks:WorkTask[];tasksTotal:number|null;tasksOverdue:number|null;
 followups:FollowUp[];followupsOverdue:number|null;
 agencyStages:Stage[];agencyFollowups:ProspectFollowUp[];agencyOverdue:number|null;
 showAgency:boolean;operationsAllowed:boolean;pipelineAllowed:boolean;
 errors:string[];
};
const empty=():QueueState=>({
 tasks:[],tasksTotal:null,tasksOverdue:null,followups:[],followupsOverdue:null,
 agencyStages:[],agencyFollowups:[],agencyOverdue:null,showAgency:false,
 operationsAllowed:false,pipelineAllowed:false,errors:[]
});
const stageNames:Record<string,string>={
 prospecto:"Nuevos",contactado:"Contactados",respondio:"Respondieron",
 reunion:"Reuniones",calificado:"Calificados",propuesta:"Propuestas",
 negociacion:"Negociación",ganado:"Ganados",perdido:"Perdidos"
};
const number=(v:number|null)=>v===null?"—":new Intl.NumberFormat("es-DO").format(v);
const dateLabel=(v:string|null)=>{
 if(!v)return "Sin fecha programada";
 const d=new Date(v);
 return Number.isNaN(d.getTime())?"Fecha no disponible":
  new Intl.DateTimeFormat("es-DO",{dateStyle:"medium",timeStyle:"short"}).format(d);
};
const overdue=(v:string|null)=>!!v&&new Date(v).getTime()<Date.now();

export default function ArmOperationalBoard({tenantId,tenantSlug,memberRole}:{tenantId:string;tenantSlug:string;memberRole:string}){
 const canManageTasks=["owner","admin","manager"].includes(memberRole);
 const [draftTitle,setDraftTitle]=useState("");
 const [draftDue,setDraftDue]=useState("");
 const [writeError,setWriteError]=useState("");
 const [busyTask,setBusyTask]=useState<string|null>(null);
 const [state,setState]=useState<QueueState>(empty);
 const [loading,setLoading]=useState(true);
 const [revision,setRevision]=useState(0);
 useEffect(()=>{
  let alive=true;
  setLoading(true);setState(empty());
  void (async()=>{
   const now=new Date().toISOString();
   const [permissionsResult,modulesResult]=await Promise.all([
    supabase.rpc("tenant_current_permissions",{p_tenant_id:tenantId}),
    supabase.rpc("tenant_effective_modules",{p_tenant_id:tenantId})
   ]);
   if(!alive)return;
   if(permissionsResult.error||modulesResult.error){
    setState({...empty(),errors:["No fue posible verificar los permisos operativos. No se muestran datos privados."]});
    setLoading(false);return;
   }
   const permissions=(permissionsResult.data??{}) as Record<string,unknown>;
   const modules=(modulesResult.data??[]) as Array<{module_key:string;enabled:boolean}>;
   const allowed=(key:string)=>
    (permissions.all===true||permissions[key]===true)
    &&modules.find(m=>m.module_key===key)?.enabled!==false;
   const operationsAllowed=allowed("operations");
   const pipelineAllowed=allowed("pipeline");

   const [tasks,taskTotal,taskOverdue,followups,followupsOverdue,platformAccess]=await Promise.all([
    operationsAllowed
     ?supabase.from("tasks").select("id,title,status,priority,due_at").eq("tenant_id",tenantId)
       .in("status",["todo","in_progress"]).order("due_at",{ascending:true,nullsFirst:false}).limit(6)
     :Promise.resolve(null),
    operationsAllowed
     ?supabase.from("tasks").select("id",{count:"exact",head:true}).eq("tenant_id",tenantId).in("status",["todo","in_progress"])
     :Promise.resolve(null),
    operationsAllowed
     ?supabase.from("tasks").select("id",{count:"exact",head:true}).eq("tenant_id",tenantId)
       .in("status",["todo","in_progress"]).lt("due_at",now)
     :Promise.resolve(null),
    pipelineAllowed
     ?supabase.from("opportunities").select("id,title,next_action,next_action_at").eq("tenant_id",tenantId)
       .eq("status","open").not("next_action_at","is",null).order("next_action_at",{ascending:true}).limit(6)
     :Promise.resolve(null),
    pipelineAllowed
     ?supabase.from("opportunities").select("id",{count:"exact",head:true}).eq("tenant_id",tenantId)
       .eq("status","open").lt("next_action_at",now)
     :Promise.resolve(null),
    tenantSlug==="eurevector"
     ?supabase.rpc("platform_current_access")
     :Promise.resolve(null)
   ]);
   if(!alive)return;
   const showAgency=tenantSlug==="eurevector"&&!platformAccess?.error
     &&(platformAccess?.data as {is_platform_admin?:boolean}|null)?.is_platform_admin===true;
   // Agency records are private to the platform owner; non-admin tenants never query them.
   const [agencyStages,agencyFollowups,agencyOverdue]=showAgency?await Promise.all([
    supabase.rpc("agency_prospect_pipeline_summary"),
    supabase.from("agency_prospects").select("id,name,stage,next_action,next_action_at")
     .not("stage","in","(ganado,perdido)").not("next_action_at","is",null)
     .order("next_action_at",{ascending:true}).limit(6),
    supabase.from("agency_prospects").select("id",{count:"exact",head:true})
     .not("stage","in","(ganado,perdido)").lt("next_action_at",now)
   ]):[null,null,null];
   if(!alive)return;
   const errors:string[]=[];
   if([tasks,taskTotal,taskOverdue].some(r=>r?.error))
    errors.push("No se pudieron consultar todas las tareas de esta empresa.");
   if([followups,followupsOverdue].some(r=>r?.error))
    errors.push("No se pudieron consultar todas las oportunidades de esta empresa.");
   if([agencyStages,agencyFollowups,agencyOverdue].some(r=>r?.error))
    errors.push("El seguimiento de captación no está disponible en este momento.");
   setState({
    tasks:tasks&&!tasks.error?(tasks.data??[]) as WorkTask[]:[],
    tasksTotal:taskTotal&&!taskTotal.error?taskTotal.count??0:null,
    tasksOverdue:taskOverdue&&!taskOverdue.error?taskOverdue.count??0:null,
    followups:followups&&!followups.error?(followups.data??[]) as FollowUp[]:[],
    followupsOverdue:followupsOverdue&&!followupsOverdue.error?followupsOverdue.count??0:null,
    agencyStages:agencyStages&&!agencyStages.error?(agencyStages.data??[]) as Stage[]:[],
    agencyFollowups:agencyFollowups&&!agencyFollowups.error?(agencyFollowups.data??[]) as ProspectFollowUp[]:[],
    agencyOverdue:agencyOverdue&&!agencyOverdue.error?agencyOverdue.count??0:null,
    showAgency,operationsAllowed,pipelineAllowed,errors
   });
   setLoading(false);
  })().catch(()=>{
   if(alive){setState({...empty(),errors:["No se pudo consultar la agenda del ARM."]});setLoading(false);}
  });
  return()=>{alive=false;};
 },[tenantId,tenantSlug,revision]);

 async function createTask(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(!state.operationsAllowed||!canManageTasks||busyTask)return;
  const title=draftTitle.trim();
  if(title.length<3||title.length>180){setWriteError("El título debe contener entre 3 y 180 caracteres.");return;}
  let dueAt:string|null=null;
  if(draftDue){
   const parsed=new Date(draftDue);
   if(Number.isNaN(parsed.getTime())){setWriteError("Fecha de tarea inválida.");return;}
   dueAt=parsed.toISOString();
  }
  setBusyTask("new");setWriteError("");
  const result=await supabase.from("tasks").insert({
   tenant_id:tenantId,title,status:"todo",priority:"normal",source:"manual",due_at:dueAt
  }).select("id").single();
  setBusyTask(null);
  if(result.error){setWriteError("No se pudo guardar la tarea: "+result.error.message);return;}
  if(!result.data?.id){setWriteError("El servidor no confirmó la creación.");return;}
  setDraftTitle("");setDraftDue("");setRevision(v=>v+1);
 }

 async function completeTask(taskId:string){
  if(!state.operationsAllowed||!canManageTasks||busyTask)return;
  setBusyTask(taskId);setWriteError("");
  const result=await supabase.from("tasks").update({
   status:"done",completed_at:new Date().toISOString()
  }).eq("tenant_id",tenantId).eq("id",taskId)
   .in("status",["todo","in_progress"]).select("id");
  setBusyTask(null);
  if(result.error){setWriteError("No se pudo completar la tarea: "+result.error.message);return;}
  if(result.data?.length!==1){setWriteError("La tarea no estaba disponible para actualizar.");return;}
  setRevision(v=>v+1);
 }

 return <section className="section-gap" aria-label="Agenda operativa del ARM">
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}>
   <div><div className="eyebrow">Gestión de trabajo real</div><h2>Mi agenda y seguimiento</h2></div>
   <button type="button" className="button" onClick={()=>setRevision(v=>v+1)} disabled={loading}>
    <RefreshCw size={16}/> Actualizar agenda
   </button>
  </div>
  {state.errors.map(e=><div role="alert" className="notice" key={e}><AlertCircle size={15}/>{e}</div>)}
  {writeError&&<div role="alert" className="notice">{writeError}</div>}
  <div className="grid two-col" style={{marginTop:14}}>
   <article className="card">
    <div className="eyebrow"><ClipboardList size={16}/> Tareas operativas</div>
    <h3>{loading?"Consultando…":number(state.tasksTotal)} pendientes</h3>
    <p className="muted">{loading?"":number(state.tasksOverdue)+" vencidas · incluye tareas visibles según tu rol."}</p>
    {!loading&&state.operationsAllowed&&state.tasks.length===0&&state.tasksTotal===0&&<p className="muted">No hay tareas pendientes registradas.</p>}
    {!loading&&!state.operationsAllowed&&<p className="muted">El módulo de operaciones no está habilitado para este usuario.</p>}
    <div className="stack gap-12">
     {state.tasks.map(t=><div key={t.id} className="priority-item">
      <strong>{t.title}</strong>
      <small>{dateLabel(t.due_at)} {overdue(t.due_at)?"· Vencida":""} · {t.status==="todo"?"Pendiente":"En curso"}</small>
      {canManageTasks&&<button type="button" className="button small" disabled={!!busyTask||loading}
       onClick={()=>void completeTask(t.id)}>{busyTask===t.id?"Guardando…":"Completar tarea"}</button>}
     </div>)}
    </div>
    {state.operationsAllowed&&canManageTasks&&<form className="stack gap-12 section-gap" onSubmit={event=>void createTask(event)}>
     <h4>Nueva tarea manual</h4>
     <label>Título<input type="text" required minLength={3} maxLength={180}
      value={draftTitle} onChange={event=>setDraftTitle(event.target.value)} placeholder="Ej. Preparar propuesta comercial"/></label>
     <label>Fecha de vencimiento (opcional)<input type="datetime-local"
      value={draftDue} onChange={event=>setDraftDue(event.target.value)}/></label>
     <button className="button primary" type="submit" disabled={!!busyTask||loading||draftTitle.trim().length<3}>
      {busyTask==="new"?"Guardando…":"Crear tarea"}
     </button>
    </form>}
    {state.operationsAllowed&&<div className="section-gap"><Link className="button" href="/crm/operations">
     <CheckCircle2 size={16}/> Pedidos, entregas y cobros
    </Link></div>}
   </article>
   <article className="card">
    <div className="eyebrow"><Target size={16}/> Seguimientos comerciales</div>
    <h3>{loading?"Consultando…":number(state.followupsOverdue)} vencidos</h3>
    <p className="muted">Oportunidades abiertas con próxima acción y fecha registradas.</p>
    {!loading&&state.pipelineAllowed&&state.followups.length===0&&state.followupsOverdue===0&&<p className="muted">No hay seguimientos fechados en las oportunidades visibles.</p>}
    {!loading&&!state.pipelineAllowed&&<p className="muted">El módulo de oportunidades no está habilitado para este usuario.</p>}
    <div className="stack gap-12">
     {state.followups.map(o=><div key={o.id} className="priority-item">
      <strong>{o.title}</strong><span>{o.next_action??"Acción por definir"}</span>
      <small><CalendarClock size={13}/> {dateLabel(o.next_action_at)} {overdue(o.next_action_at)?"· Vencida":""}</small>
     </div>)}
    </div>
    {state.pipelineAllowed&&<div className="section-gap"><Link className="button" href="/crm/revenue">
     <Target size={16}/> Gestionar oportunidades
    </Link></div>}
   </article>
  </div>
  {state.showAgency&&<article className="card section-gap">
   <div className="eyebrow">Solo administración de Look Social Media</div>
   <h2>Prospección y captación comercial</h2>
   <p className="muted">Se utiliza el registro privado existente; no se importa ni duplica la base de prospectos. Las etapas no representan ingresos ni contactos realizados automáticamente.</p>
   <div className="grid dashboard-kpis" style={{marginTop:12}}>
    {state.agencyStages.map(s=><div key={s.stage} className="metric">
     <div className="metric-label">{stageNames[s.stage]??s.stage}</div>
     <strong className="metric-value">{number(Number(s.prospect_count))}</strong>
    </div>)}
   </div>
   <h3>Próximos contactos · {number(state.agencyOverdue)} vencidos</h3>
   {state.agencyFollowups.length===0&&state.agencyOverdue===0&&<p className="muted">No hay próximos contactos con fecha registrada.</p>}
   <div className="stack gap-12">
    {state.agencyFollowups.map(p=><div className="priority-item" key={p.id}>
     <strong>{p.name}</strong><span>{stageNames[p.stage]??p.stage} · {p.next_action??"Acción por definir"}</span>
     <small>{dateLabel(p.next_action_at)} {overdue(p.next_action_at)?"· Vencido":""}</small>
    </div>)}
   </div>
   <div className="section-gap">
    <Link className="button primary" href="/agency">Abrir captación y registrar actividad real</Link>
   </div>
  </article>}
 </section>;
}

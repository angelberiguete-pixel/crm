"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Check, Plus, RefreshCw, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import styles from "@/components/customer-history.module.css";

type Customer = {id:string;name:string;kind:"company"|"contact";companyId:string|null};
type ContactRef = {id:string;company_id:string|null;display_name:string};
type OpportunityRef = {id:string;company_id:string|null;contact_id:string|null;title:string;status:string;owner_user_id:string|null;next_action:string|null;next_action_at:string|null};
type Task = {id:string;title:string;description:string|null;status:string;priority:string;due_at:string|null;completed_at:string|null;assigned_user_id:string|null;contact_id:string|null;company_id:string|null;opportunity_id:string|null;created_at:string};
type Activity = {id:string;contact_id:string|null;opportunity_id:string|null;type:string;title:string;description:string|null;completed_at:string|null;created_at:string;created_by:string|null};
type Assignee = {user_id:string;display_name:string;team_role:string};
const statusLabels:Record<string,string>={todo:"Por hacer",in_progress:"En curso",done:"Completada",cancelled:"Cancelada",open:"Abierta",won:"Ganada",lost:"Perdida"};
const priorityLabels:Record<string,string>={low:"Baja",normal:"Normal",high:"Alta",urgent:"Urgente"};
const when=(date:string|null)=>{if(!date)return "Sin fecha";const d=new Date(date);return Number.isNaN(d.getTime())?"Fecha no disponible":new Intl.DateTimeFormat("es-DO",{dateStyle:"medium",timeStyle:"short"}).format(d);};
const isOverdue=(task:Task)=>task.status!=="done"&&task.status!=="cancelled"&&!!task.due_at&&new Date(task.due_at).getTime()<Date.now();

export default function CustomerHistory({tenantId,record,contacts,opportunities,onClose}:{
 tenantId:string;record:Customer;contacts:ContactRef[];opportunities:OpportunityRef[];onClose:()=>void;
}){
 const relatedContacts=useMemo(()=>record.kind==="company"?contacts.filter(c=>c.company_id===record.id):contacts.filter(c=>c.id===record.id),[record,contacts]);
 const relatedDeals=useMemo(()=>opportunities.filter(o=>record.kind==="company"?o.company_id===record.id:o.contact_id===record.id),[record,opportunities]);
 const [tasks,setTasks]=useState<Task[]>([]),[activities,setActivities]=useState<Activity[]>([]),[assignees,setAssignees]=useState<Assignee[]>([]);
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[busyId,setBusyId]=useState<string|null>(null);
 const [reload,setReload]=useState(0),[feedback,setFeedback]=useState(""),[error,setError]=useState("");
 const [taskTitle,setTaskTitle]=useState(""),[taskDue,setTaskDue]=useState(""),[taskAssignee,setTaskAssignee]=useState(""),[taskPriority,setTaskPriority]=useState("normal");
 const [noteText,setNoteText]=useState(""),[noteContact,setNoteContact]=useState(record.kind==="contact"?record.id:"");
 const panelRef=useRef<HTMLDivElement>(null);
 const closeButtonRef=useRef<HTMLButtonElement>(null);
 useEffect(()=>{
   const opener=document.activeElement instanceof HTMLElement?document.activeElement:null;
   const oldOverflow=document.body.style.overflow;
   document.body.style.overflow="hidden";
   closeButtonRef.current?.focus();
   const trapTab=(event:KeyboardEvent)=>{
     if(event.key!=="Tab"||!panelRef.current)return;
     const panel=panelRef.current;
     const focusable=Array.from(panel.querySelectorAll<HTMLElement>(
       'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])'
     )).filter(element=>element.getClientRects().length>0);
     if(!focusable.length){event.preventDefault();panel.focus();return;}
     const first=focusable[0],last=focusable[focusable.length-1];
     if(event.shiftKey&&(document.activeElement===first||!panel.contains(document.activeElement))){
       event.preventDefault();last.focus();
     }else if(!event.shiftKey&&(document.activeElement===last||!panel.contains(document.activeElement))){
       event.preventDefault();first.focus();
     }
   };
   document.addEventListener("keydown",trapTab,true);
   return()=>{
     document.removeEventListener("keydown",trapTab,true);
     document.body.style.overflow=oldOverflow;
     if(opener?.isConnected)opener.focus();
   };
 },[]);
 useEffect(()=>{
   const closeOnEscape=(event:KeyboardEvent)=>{
     if(event.key==="Escape"&&!saving){event.preventDefault();event.stopPropagation();onClose();}
   };
   document.addEventListener("keydown",closeOnEscape,true);
   return()=>document.removeEventListener("keydown",closeOnEscape,true);
 },[onClose,saving]);
 useEffect(()=>{setNoteContact(record.kind==="contact"?record.id:"");setFeedback("");setError("");},[record.id,record.kind]);
 useEffect(()=>{
   let alive=true;setLoading(true);setError("");setTasks([]);setActivities([]);
   (async()=>{
     try{
       const taskQuery=supabase.from("tasks").select("id,title,description,status,priority,due_at,completed_at,assigned_user_id,contact_id,company_id,opportunity_id,created_at")
         .eq("tenant_id",tenantId).eq(record.kind==="company"?"company_id":"contact_id",record.id).order("created_at",{ascending:false}).limit(150);
       const contactIds=relatedContacts.map(c=>c.id);
       const dealIds=relatedDeals.map(d=>d.id);
       const lookups:PromiseLike<{data:unknown;error:unknown}>[]=[];
       if(contactIds.length)lookups.push(supabase.from("activities").select("id,contact_id,opportunity_id,type,title,description,completed_at,created_at,created_by").eq("tenant_id",tenantId).in("contact_id",contactIds).order("created_at",{ascending:false}).limit(150));
       if(dealIds.length)lookups.push(supabase.from("activities").select("id,contact_id,opportunity_id,type,title,description,completed_at,created_at,created_by").eq("tenant_id",tenantId).in("opportunity_id",dealIds).order("created_at",{ascending:false}).limit(150));
       const [taskRes,staffRes,...history]=await Promise.all([
         taskQuery,supabase.rpc("tenant_inbox_assignees",{p_tenant_id:tenantId}),...lookups
       ]);
       if(!alive)return;
       if(taskRes.error){setError("No se pudieron cargar las tareas: "+taskRes.error.message);return;}
       const historyError=history.find(row=>row.error)?.error as {message?:string}|undefined;
       if(historyError){setError("No se pudo cargar el historial: "+(historyError.message??"Error de lectura"));return;}
       setTasks((taskRes.data??[]) as Task[]);
       const merged=new Map<string,Activity>();
       for(const page of history)for(const activity of ((page.data??[]) as Activity[]))merged.set(activity.id,activity);
       setActivities([...merged.values()].sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime()).slice(0,150));
       if(!staffRes.error)setAssignees((staffRes.data??[]) as Assignee[]);
       else setAssignees([]);
     }catch{if(alive)setError("No se pudo cargar el historial del cliente. Reintenta.");}
     finally{if(alive)setLoading(false);}
   })();
   return()=>{alive=false;};
 },[tenantId,record.id,record.kind,reload,relatedContacts,relatedDeals]);
 const assigneeName=(id:string|null)=>id?(assignees.find(a=>a.user_id===id)?.display_name??"Responsable no disponible"):"Sin asignar";
 const pending=tasks.filter(task=>task.status!=="done"&&task.status!=="cancelled");
 const late=pending.filter(isOverdue);
 async function createTask(event:FormEvent<HTMLFormElement>){
   event.preventDefault();if(saving)return;
   const title=taskTitle.trim();if(!title)return;
   if(taskAssignee&&!assignees.some(a=>a.user_id===taskAssignee)){setError("El responsable no pertenece al equipo disponible.");return;}
   setSaving(true);setError("");setFeedback("");
   try{
     const due_at=taskDue?new Date(taskDue).toISOString():null;
     const payload={tenant_id:tenantId,title,priority:taskPriority,status:"todo",source:"manual",due_at,
       assigned_user_id:taskAssignee||null,company_id:record.kind==="company"?record.id:record.companyId,
       contact_id:record.kind==="contact"?record.id:null};
     const response=await supabase.from("tasks").insert(payload).select("id").single();
     if(response.error||!response.data?.id)throw new Error(response.error?.message??"No se confirmó la tarea.");
     setTaskTitle("");setTaskDue("");setTaskAssignee("");setTaskPriority("normal");setFeedback("Tarea creada y vinculada correctamente.");setReload(n=>n+1);
   }catch(cause){setError("No se pudo registrar la tarea: "+(cause instanceof Error?cause.message:"Intenta de nuevo."));}
   finally{setSaving(false);}
 }
 async function changeTask(task:Task){
   if(busyId)return;setBusyId(task.id);setError("");setFeedback("");
   const done=task.status!=="done";
   try{
     const patch={status:done?"done":"todo",completed_at:done?new Date().toISOString():null};
     const response=await supabase.from("tasks").update(patch).eq("tenant_id",tenantId).eq("id",task.id)
       .eq(record.kind==="company"?"company_id":"contact_id",record.id).select("id").maybeSingle();
     if(response.error||!response.data)throw new Error(response.error?.message??"No se confirmó la actualización.");
     setTasks(previous=>previous.map(row=>row.id===task.id?{...row,...patch}:row));setFeedback(done?"Tarea completada.":"Tarea reabierta.");
   }catch(cause){setError("No se pudo actualizar la tarea: "+(cause instanceof Error?cause.message:"Intenta nuevamente."));}
   finally{setBusyId(null);}
 }
 async function createNote(event:FormEvent<HTMLFormElement>){
   event.preventDefault();if(saving)return;
   const title=noteText.trim();
   if(!title||!noteContact||!relatedContacts.some(c=>c.id===noteContact)){setError("Selecciona un contacto válido para guardar la nota.");return;}
   setSaving(true);setError("");setFeedback("");
   try{
     const response=await supabase.from("activities").insert({tenant_id:tenantId,contact_id:noteContact,type:"note",title}).select("id").single();
     if(response.error||!response.data?.id)throw new Error(response.error?.message??"No se confirmó la nota.");
     setNoteText("");setFeedback("Nota añadida al historial del contacto.");setReload(n=>n+1);
   }catch(cause){setError("No se pudo guardar la nota: "+(cause instanceof Error?cause.message:"Intenta nuevamente."));}
   finally{setSaving(false);}
 }
 const activityLabel:Record<string,string>={task:"Tarea",call:"Llamada",meeting:"Reunión",note:"Nota",email:"Correo",message:"Mensaje",follow_up:"Seguimiento",whatsapp:"WhatsApp",linkedin:"LinkedIn",proposal:"Propuesta",other:"Actividad"};
 return <div className={styles.overlay} role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&!saving)onClose();}}>
   <div ref={panelRef} className={styles.panel} role="dialog" aria-modal="true" aria-labelledby="history-title" tabIndex={-1}>
     <header className={styles.header}><div><div className={styles.muted}>Ficha comercial · {record.kind==="company"?"Empresa":"Contacto"}</div><h2 id="history-title">{record.name}</h2><div className={styles.muted}>Tareas, oportunidades y actividades de esta cuenta</div></div><button ref={closeButtonRef} type="button" className="button" onClick={onClose} aria-label="Cerrar ficha comercial"><X size={16}/> Cerrar</button></header>
     <div className={styles.actions}><button type="button" className="button" disabled={loading} onClick={()=>setReload(n=>n+1)}><RefreshCw size={15}/> Actualizar ficha</button>
       <Link className="button" href={"/crm/revenue?"+(record.kind==="company"?"companyId":"contactId")+"="+encodeURIComponent(record.id)}>Abrir oportunidades</Link></div>
     {error&&<div className={styles.notice} role="alert">{error}</div>}
     {feedback&&<div className={styles.notice} role="status">{feedback}</div>}
     {loading?<div className="loading" role="status">Cargando historial comercial…</div>:<>
       <section className={styles.metrics} aria-label="Resumen de seguimiento">
         <div className={styles.metric}><strong>{relatedDeals.length}</strong><span className={styles.muted}>Oportunidades</span></div>
         <div className={styles.metric}><strong>{pending.length}</strong><span className={styles.muted}>Tareas abiertas</span></div>
         <div className={styles.metric}><strong>{late.length}</strong><span className={styles.muted}>Tareas vencidas</span></div>
       </section>
       <div className={styles.sections}>
         <section className={styles.section}><h3>Seguimientos y responsables</h3>
           <div className={styles.list}>
             {tasks.length===0&&<p className={styles.muted}>Sin tareas vinculadas a esta ficha.</p>}
             {tasks.map(task=><article key={task.id} className={styles.item}>
               <h4>{task.title}</h4>
               <p className={styles.muted}>{statusLabels[task.status]??task.status} · Prioridad {priorityLabels[task.priority]??task.priority}</p>
               <p className={styles.muted}>Responsable: {assigneeName(task.assigned_user_id)}</p>
               <small>Fecha: {when(task.due_at)}{isOverdue(task)?" · Vencida":""}</small>
               <div className={styles.actions}><button type="button" className="button" disabled={busyId!==null} onClick={()=>void changeTask(task)}><Check size={15}/>{task.status==="done"?"Reabrir tarea":"Marcar completada"}</button></div>
             </article>)}
           </div>
           <form className={styles.form} onSubmit={createTask}>
             <strong>Nueva tarea de seguimiento</strong>
             <label>Qué hay que hacer<input required maxLength={200} value={taskTitle} onChange={event=>setTaskTitle(event.target.value)} placeholder="Llamar para dar seguimiento"/></label>
             <label>Fecha y hora<input aria-label="Fecha de seguimiento" type="datetime-local" value={taskDue} onChange={event=>setTaskDue(event.target.value)}/></label>
             <label>Prioridad<select aria-label="Prioridad de tarea" value={taskPriority} onChange={event=>setTaskPriority(event.target.value)}><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option><option value="low">Baja</option></select></label>
             <label>Asignar a<select aria-label="Responsable de tarea" value={taskAssignee} onChange={event=>setTaskAssignee(event.target.value)}><option value="">Sin asignar</option>{assignees.map(a=><option key={a.user_id} value={a.user_id}>{a.display_name}</option>)}</select></label>
             <button type="submit" className="button primary" disabled={saving}><Plus size={15}/>{saving?"Guardando…":"Crear tarea"}</button>
           </form>
         </section>
         <section className={styles.section}><h3>Oportunidades del cliente</h3>
           <div className={styles.list}>{relatedDeals.length===0?<p className={styles.muted}>Todavía no hay oportunidades vinculadas.</p>:relatedDeals.map(deal=><article key={deal.id} className={styles.item}>
             <h4>{deal.title}</h4><p className={styles.muted}>{statusLabels[deal.status]??deal.status} · Responsable: {assigneeName(deal.owner_user_id)}</p>
             {deal.next_action&&<p className={styles.muted}>Próxima acción: {deal.next_action}</p>}
             {deal.next_action_at&&<small>{when(deal.next_action_at)}</small>}
           </article>)}</div>
           <h3>Registrar nota</h3>
           <form className={styles.form} onSubmit={createNote}>
             {record.kind==="company"&&<label>Contacto de la empresa<select aria-label="Contacto para la nota" value={noteContact} onChange={event=>setNoteContact(event.target.value)}>
               <option value="">Seleccionar contacto</option>{relatedContacts.map(c=><option key={c.id} value={c.id}>{c.display_name}</option>)}
             </select></label>}
             {relatedContacts.length===0&&<p className={styles.muted}>Añade primero un contacto a esta empresa para registrar notas en su historial.</p>}
             <label>Nota<textarea required maxLength={2000} value={noteText} onChange={event=>setNoteText(event.target.value)} placeholder="Resultado de llamada, reunión o siguiente paso"/></label>
             <button className="button primary" disabled={saving||relatedContacts.length===0} type="submit">Guardar nota</button>
           </form>
         </section>
         <section className={`${styles.section} ${styles.timeline}`}><h3>Historial de actividades</h3>
           <div className={styles.list}>{activities.length===0?<p className={styles.muted}>Aún no hay actividades registradas para los contactos y oportunidades vinculados.</p>:activities.map(activity=><article key={activity.id} className={styles.item}>
             <h4>{activityLabel[activity.type]??activity.type}: {activity.title}</h4>
             {activity.description&&<p className={styles.muted}>{activity.description}</p>}
             <small>{when(activity.completed_at??activity.created_at)} · {activity.created_by?assigneeName(activity.created_by):"Responsable no registrado"}</small>
           </article>)}</div>
         </section>
       </div>
     </>}
   </div>
 </div>;
}

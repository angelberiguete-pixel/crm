"use client";

import {useEffect,useState,type FormEvent} from "react";
import {AlertTriangle,Check,Plus,RefreshCw,X} from "lucide-react";
import {supabase} from "@/lib/supabase";
import {useActiveTenant} from "@/components/tenant-context";

type Evidence={detail:string;verified_by:string;verified_at:string;method:"human_confirmation"};
type Task={
 id:string;title:string;status:string;priority:string;due_at:string|null;created_at:string;
 source:string;description:string|null;metadata:Record<string,unknown>|null;
};
const eventName="family-power:tasks-updated";
const format=(value:string)=>new Intl.DateTimeFormat("es-DO",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value));

export default function FamilyPowerTasks({tenantId}:{tenantId:string}){
 const tenant=useActiveTenant();
 const [rows,setRows]=useState<Task[]>([]);
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const [error,setError]=useState(""),[title,setTitle]=useState(""),[due,setDue]=useState("");
 const [filter,setFilter]=useState("pending"),[version,setVersion]=useState(0);
 const [completing,setCompleting]=useState<string|null>(null);
 const [verification,setVerification]=useState("");

 useEffect(()=>{
  let live=true;setLoading(true);setError("");setCompleting(null);setVerification("");
  void supabase.from("tasks")
   .select("id,title,status,priority,due_at,created_at,source,description,metadata")
   .eq("tenant_id",tenantId).order("created_at",{ascending:false}).limit(200)
   .then(({data,error:err})=>{
    if(!live)return;
    if(err)setError("No fue posible consultar las tareas.");
    else setRows((data??[]) as Task[]);
    setLoading(false);
   }).then(undefined,()=>{if(live){setError("Error al cargar las tareas.");setLoading(false);}});
  return()=>{live=false;};
 },[tenantId,version]);

 const refresh=()=>{setVersion(v=>v+1);window.dispatchEvent(new Event(eventName));};

 async function add(e:FormEvent){
  e.preventDefault();if(busy||!title.trim())return;
  setBusy(true);setError("");
  const parsed=due?new Date(due):null;
  if(parsed&&Number.isNaN(parsed.valueOf())){setError("Fecha no válida.");setBusy(false);return;}
  try{
   const result=await supabase.from("tasks").insert({
    tenant_id:tenantId,title:title.trim(),status:"todo",priority:"normal",
    source:"manual",due_at:parsed?.toISOString()??null
   });
   if(result.error)throw result.error;
   setTitle("");setDue("");refresh();
  }catch{setError("No se pudo guardar la tarea.");}
  finally{setBusy(false);}
 }

 async function finish(task:Task){
  if(busy||verification.trim().length<12)return;
  setBusy(true);setError("");
  try{
   const auth=await supabase.auth.getUser();
   if(auth.error||!auth.data.user)throw new Error("session_required");
   const evidence:Evidence={
    detail:verification.trim(),verified_by:auth.data.user.id,
    verified_at:new Date().toISOString(),method:"human_confirmation"
   };
   const result=await supabase.from("tasks")
    .update({
     status:"done",completed_at:evidence.verified_at,
     metadata:{...(task.metadata??{}),completion_evidence:evidence}
    })
    .eq("tenant_id",tenantId).eq("id",task.id)
    .in("status",["todo","in_progress"])
    .select("id").maybeSingle();
   if(result.error||!result.data)throw new Error("completion_not_saved");
   setCompleting(null);setVerification("");refresh();
  }catch{setError("No se pudo completar la tarea. Verifica tu acceso y registra lo realizado.");}
  finally{setBusy(false);}
 }

 if(tenant?.tenant_slug!=="family-power")return null;
 const shown=rows.filter(t=>filter==="all"||(filter==="done"?t.status==="done":t.status!=="done"&&t.status!=="cancelled"));
 const outstanding=rows.filter(t=>t.status!=="done"&&t.status!=="cancelled").length;
 return <section className="stack gap-16">
  <header><h1>Tareas</h1><p className="muted">Seguimientos y actividades del equipo. Las sugerencias de IA siempre requieren comprobación humana.</p></header>
  <form className="card stack gap-12" onSubmit={add}>
   <div className="form-grid">
    <label>Nueva tarea<input required maxLength={180} value={title} onChange={e=>setTitle(e.target.value)}/></label>
    <label>Vencimiento<input type="datetime-local" value={due} onChange={e=>setDue(e.target.value)}/></label>
   </div>
   <div><button type="submit" className="button primary" disabled={busy}><Plus size={16}/> Añadir tarea</button></div>
  </form>
  <div className="card stack gap-12">
   <div className="topbar">
    <div><h2>Listado</h2><small className="muted">{outstanding} pendientes entre las últimas {rows.length} tareas</small></div>
    <div className="top-actions">
     <select aria-label="Filtrar tareas" value={filter} onChange={e=>setFilter(e.target.value)}>
      <option value="pending">Pendientes</option><option value="done">Completadas</option><option value="all">Todas</option>
     </select>
     <button type="button" className="button" onClick={refresh} aria-label="Actualizar tareas"><RefreshCw size={16}/></button>
    </div>
   </div>
   {error&&<div className="notice" role="alert">{error}</div>}
   {loading?<p role="status">Cargando tareas…</p>:shown.length===0?<p className="muted">No hay tareas para este filtro.</p>:
   <div className="stack gap-12">{shown.map(t=>{
    const pending=t.status!=="done"&&t.status!=="cancelled";
    const overdue=pending&&t.due_at&&new Date(t.due_at).getTime()<Date.now();
    const stored=t.metadata?.completion_evidence;
    const evidence=stored&&typeof stored==="object"&&!Array.isArray(stored)?stored as Partial<Evidence>:null;
    return <div className="priority-item" key={t.id}>
     <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
      <div style={{flex:"1 1 190px"}}>
       <strong>{t.title}</strong>
       <small className="muted" style={{display:"block"}}>
        {t.due_at?format(t.due_at):"Sin fecha"} · {t.status==="done"?"Completada":"Pendiente"}
        {t.source==="ai"?" · Sugerida por IA":""}
       </small>
       {overdue&&<small style={{display:"inline-flex",gap:5,alignItems:"center",color:"#B00B1B"}}><AlertTriangle size={13}/> Vencida</small>}
       {t.description&&<p className="muted" style={{fontSize:13,marginTop:5}}>{t.description}</p>}
       {t.status==="done"&&evidence?.detail&&<p className="muted" style={{fontSize:13,marginTop:5}}>Verificación registrada: {evidence.detail}</p>}
      </div>
      {pending&&<button type="button" className="button small" disabled={busy}
       onClick={()=>{setCompleting(t.id===completing?null:t.id);setVerification("");setError("");}}>
       <Check size={15}/> Verificar y completar
      </button>}
     </div>
     {pending&&completing===t.id&&<div className="stack gap-12" style={{marginTop:12}}>
      <label>¿Qué acción realizaste y cómo comprobaste que se completó?
       <textarea rows={3} minLength={12} maxLength={1000} required value={verification}
        onChange={e=>setVerification(e.target.value)}
        placeholder="Describe la acción ejecutada y la evidencia que revisaste."/>
      </label>
      <p className="muted" style={{fontSize:12}}>Quedará guardada tu confirmación con usuario y fecha. Una sugerencia de IA no equivale a una acción realizada.</p>
      <div className="top-actions">
       <button type="button" className="button primary small" disabled={busy||verification.trim().length<12}
        onClick={()=>void finish(t)}><Check size={15}/> Confirmar realización</button>
       <button type="button" className="button small" disabled={busy}
        onClick={()=>{setCompleting(null);setVerification("");}}><X size={15}/> Cancelar</button>
      </div>
     </div>}
    </div>;
   })}</div>}
  </div>
 </section>;
}

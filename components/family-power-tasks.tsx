"use client";

import {useEffect,useState,type FormEvent} from "react";
import {Check,Plus,RefreshCw} from "lucide-react";
import {supabase} from "@/lib/supabase";
import {useActiveTenant} from "@/components/tenant-context";
type Task={id:string;title:string;status:string;priority:string;due_at:string|null;created_at:string};
export default function FamilyPowerTasks({tenantId}:{tenantId:string}){
 const tenant=useActiveTenant();
 const [rows,setRows]=useState<Task[]>([]),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const [error,setError]=useState(""),[title,setTitle]=useState(""),[due,setDue]=useState(""),[filter,setFilter]=useState("pending");
 const [version,setVersion]=useState(0);
 useEffect(()=>{
  let live=true;setLoading(true);setError("");
  void supabase.from("tasks").select("id,title,status,priority,due_at,created_at").eq("tenant_id",tenantId)
   .order("created_at",{ascending:false}).limit(200).then(({data,error:err})=>{
    if(!live)return;
    if(err)setError("No fue posible consultar las tareas.");
    else setRows((data??[]) as Task[]);
    setLoading(false);
   }).then(undefined,()=>{if(live){setError("Error al cargar las tareas.");setLoading(false);}});
  return()=>{live=false;};
 },[tenantId,version]);
 async function add(e:FormEvent){
  e.preventDefault();if(busy||!title.trim())return;setBusy(true);setError("");
  const parsed=due?new Date(due):null;
  if(parsed&&Number.isNaN(parsed.valueOf())){setError("Fecha no válida.");setBusy(false);return;}
  const result=await supabase.from("tasks").insert({tenant_id:tenantId,title:title.trim(),status:"todo",priority:"normal",source:"manual",due_at:parsed?.toISOString()??null});
  if(result.error)setError("No se pudo guardar la tarea.");
  else {setTitle("");setDue("");setVersion(v=>v+1);}
  setBusy(false);
 }
 async function finish(id:string){
  if(busy)return;setBusy(true);setError("");
  const result=await supabase.from("tasks").update({status:"done",completed_at:new Date().toISOString()}).eq("tenant_id",tenantId).eq("id",id);
  if(result.error)setError("No se pudo completar la tarea.");
  else setVersion(v=>v+1);
  setBusy(false);
 }
 if(tenant?.tenant_slug!=="family-power")return null;
 const shown=rows.filter(t=>filter==="all"||(filter==="done"?t.status==="done":t.status!=="done"&&t.status!=="cancelled"));
 return <section className="stack gap-16">
  <header><h1>Tareas</h1></header>
  <form className="card stack gap-12" onSubmit={add}>
   <div className="form-grid"><label>Nueva tarea<input required maxLength={180} value={title} onChange={e=>setTitle(e.target.value)}/></label>
   <label>Vencimiento<input type="datetime-local" value={due} onChange={e=>setDue(e.target.value)}/></label></div>
   <div><button type="submit" className="button primary" disabled={busy}><Plus size={16}/> Añadir tarea</button></div>
  </form>
  <div className="card stack gap-12">
   <div className="topbar"><h2>Listado</h2><div className="top-actions"><select aria-label="Filtrar tareas" value={filter} onChange={e=>setFilter(e.target.value)}>
   <option value="pending">Pendientes</option><option value="done">Completadas</option><option value="all">Todas</option>
   </select><button type="button" className="button" onClick={()=>setVersion(v=>v+1)} aria-label="Actualizar tareas"><RefreshCw size={16}/></button></div></div>
   {error&&<div className="notice" role="alert">{error}</div>}
   {loading?<p role="status">Cargando tareas…</p>:shown.length===0?<p className="muted">No hay tareas.</p>:
   <div className="stack gap-12">{shown.map(t=><div className="priority-item" key={t.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
    <div><strong>{t.title}</strong><small className="muted" style={{display:"block"}}>{t.due_at?new Date(t.due_at).toLocaleDateString("es-DO"):"Sin fecha"} · {t.status==="done"?"Completada":"Pendiente"}</small></div>
    {t.status!=="done"&&t.status!=="cancelled"&&<button type="button" className="button small" disabled={busy} onClick={()=>void finish(t.id)}><Check size={15}/> Completar</button>}
   </div>)}</div>}
  </div>
 </section>;
}

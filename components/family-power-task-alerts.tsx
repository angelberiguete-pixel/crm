"use client";

import Link from "next/link";
import {useCallback,useEffect,useId,useState} from "react";
import {Bell,Clock3,RefreshCw,X} from "lucide-react";
import {supabase} from "@/lib/supabase";
import {useActiveTenant} from "@/components/tenant-context";

type PendingTask={id:string;title:string;due_at:string|null;priority:string;source:string};
const pendingStatuses=["todo","in_progress"];
const dateLabel=(due:string|null,now:number)=>{
  if(!due)return "Pendiente · sin vencimiento";
  const when=new Date(due).getTime();
  if(!Number.isFinite(when))return "Pendiente";
  const label=new Intl.DateTimeFormat("es-DO",{dateStyle:"short",timeStyle:"short"}).format(new Date(due));
  return when<now?"Vencida · "+label:when-now<=86400000?"Próxima · "+label:"Vence · "+label;
};

/** Visible in the shared authorized header, not only on the tasks route.
 * Real records only: no demo notification records and no client-side agent writes.
 */
export default function FamilyPowerTaskAlerts(){
  const tenant=useActiveTenant();
  const tenantId=tenant?.tenant_slug==="family-power"?tenant.tenant_id:null;
  const listId=useId();
  const [allowed,setAllowed]=useState(false);
  const [open,setOpen]=useState(false);
  const [count,setCount]=useState<number|null>(null);
  const [rows,setRows]=useState<PendingTask[]>([]);
  const [error,setError]=useState("");
  const [now,setNow]=useState(()=>Date.now());
  const load=useCallback(async()=>{
    if(!tenantId)return;
    try{
      const result=await supabase.from("tasks")
        .select("id,title,due_at,priority,source",{count:"exact"})
        .eq("tenant_id",tenantId).in("status",pendingStatuses)
        .order("due_at",{ascending:true,nullsFirst:false}).limit(12);
      if(result.error)throw result.error;
      setRows((result.data??[]) as PendingTask[]);
      setCount(result.count??0);setNow(Date.now());setError("");
    }catch{setCount(null);setRows([]);setError("No se pudieron consultar las tareas pendientes.");}
  },[tenantId]);

  useEffect(()=>{
    let alive=true;
    setOpen(false);setAllowed(false);setCount(null);setRows([]);setError("");
    if(!tenantId)return()=>{alive=false;};
    const authorize=async()=>{
      const [p,m]=await Promise.all([
        supabase.rpc("tenant_current_permissions",{p_tenant_id:tenantId}),
        supabase.rpc("tenant_effective_modules",{p_tenant_id:tenantId}),
      ]);
      if(!alive||p.error||m.error)return;
      const permissions=(p.data??{}) as Record<string,unknown>;
      const mods=(m.data??[]) as Array<{module_key:string;enabled:boolean}>;
      if(!(permissions.all===true||permissions.operations===true)||
        mods.some(mod=>mod.module_key==="operations"&&mod.enabled===false))return;
      setAllowed(true);
      await load();
    };
    void authorize().catch(()=>{if(alive)setError("No se pudieron validar las alertas.");});
    return()=>{alive=false;};
  },[tenantId,load]);
  useEffect(()=>{
    if(!tenantId||!allowed)return;
    const refresh=()=>{if(document.visibilityState!=="hidden")void load();};
    const timer=window.setInterval(refresh,45000);
    window.addEventListener("focus",refresh);
    document.addEventListener("visibilitychange",refresh);
    return()=>{
      window.clearInterval(timer);
      window.removeEventListener("focus",refresh);
      document.removeEventListener("visibilitychange",refresh);
    };
  },[tenantId,allowed,load]);
  if(!tenantId||!allowed)return null;
  const overdue=rows.filter(t=>t.due_at&&new Date(t.due_at).getTime()<now).length;
  return <div style={{position:"relative",flexShrink:0}} className="family-power-task-alerts">
    <button type="button" className="button" aria-controls={listId} aria-expanded={open}
      aria-label={count===null?"Notificaciones de tareas":`Tareas pendientes: ${count}`}
      onClick={()=>setOpen(value=>!value)}
      style={{display:"inline-flex",alignItems:"center",gap:7,position:"relative",minHeight:42}}>
      <Bell size={19}/><span>Alertas</span>
      {count!==null&&count>0&&<strong aria-hidden="true" style={{background:"#C8081B",color:"white",borderRadius:99,
        minWidth:23,padding:"2px 6px",fontSize:12,textAlign:"center"}}>{count>99?"99+":count}</strong>}
    </button>
    {open&&<section id={listId} aria-label="Centro de notificaciones de Family Power"
      style={{position:"absolute",right:0,top:"calc(100% + 8px)",zIndex:200,
        width:"min(355px, calc(100vw - 24px))",maxHeight:"min(65vh, 480px)",overflowY:"auto",
        border:"1px solid var(--border, #D7D7D7)",boxShadow:"0 12px 32px #0003",borderRadius:14,
        background:"var(--card, #FFFFFF)",color:"var(--text, #161616)",padding:16}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
        <strong>Tareas pendientes{count!==null?` (${count})`:""}</strong>
        <button type="button" className="button small" aria-label="Cerrar notificaciones"
          onClick={()=>setOpen(false)}><X size={16}/></button>
      </div>
      {overdue>0&&<p role="status" style={{marginTop:8,fontSize:13,color:"#AF0A19"}}>
        {overdue} {overdue===1?"tarea vencida entre las mostradas":"tareas vencidas entre las mostradas"}.
      </p>}
      {error&&<p role="alert">{error}</p>}
      {!error&&count===0&&<p className="muted" style={{marginTop:12}}>No hay tareas pendientes.</p>}
      {!error&&rows.map(t=><div key={t.id} style={{padding:"11px 0",borderBottom:"1px solid #E4E4E4"}}>
        <strong style={{display:"block",fontSize:14}}>{t.title}</strong>
        <small style={{display:"flex",gap:6,alignItems:"center",marginTop:4}}>
          <Clock3 size={13}/>{dateLabel(t.due_at,now)}{t.source==="ai"?" · IA":""}
        </small>
      </div>)}
      <div style={{display:"flex",gap:8,marginTop:12,justifyContent:"space-between",alignItems:"center"}}>
        <button type="button" className="button small" onClick={()=>void load()} aria-label="Actualizar alertas">
          <RefreshCw size={15}/> Actualizar
        </button>
        <Link className="button primary small" href="/crm/tasks" onClick={()=>setOpen(false)}>Ver tareas</Link>
      </div>
    </section>}
  </div>;
}

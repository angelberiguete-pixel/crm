"use client";
import {useEffect,useRef,useState} from "react";
import {CheckCircle2,RefreshCw,ShieldCheck,XCircle} from "lucide-react";
import {supabase} from "@/lib/supabase";

type Trial={
  id:string;agent_id:string;created_at:string;status:string;
  input:{question?:string}|null;
  output:{draft?:string;review_required?:boolean}|null;
};
type Review={run_id:string;decision:string;created_at:string};
export default function DigitalEmployeeReviewQueue({tenantId}:{tenantId:string}){
 const tenantRef=useRef(tenantId);tenantRef.current=tenantId;
 const [runs,setRuns]=useState<Trial[]>([]);
 const [reviewed,setReviewed]=useState<Set<string>>(new Set());
 const [selected,setSelected]=useState<string|null>(null);
 const [edited,setEdited]=useState("");
 const [comment,setComment]=useState("");
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false);
 const [error,setError]=useState(""),[notice,setNotice]=useState("");
 const [refresh,setRefresh]=useState(0);
 useEffect(()=>{
  setRuns([]);setReviewed(new Set());setSelected(null);
  setEdited("");setComment("");setError("");setNotice("");
 },[tenantId]);
 useEffect(()=>{
  let live=true;setLoading(true);
  (async()=>{
   const [drafts,decisions]=await Promise.all([
    supabase.from("ai_agent_runs").select("id,agent_id,status,input,output,created_at")
      .eq("tenant_id",tenantId).eq("status","awaiting_approval").order("created_at",{ascending:false}).limit(100),
    supabase.from("ai_agent_reviews").select("run_id,decision,created_at").eq("tenant_id",tenantId).limit(200),
   ]);
   if(!live||tenantRef.current!==tenantId)return;
   if(drafts.error||decisions.error){
    setError("No se pudo consultar la bandeja de revisión. Verifica que la migración de aprobaciones esté aplicada.");
   }else{
    setRuns((drafts.data??[]) as Trial[]);
    setReviewed(new Set((decisions.data??[] as Review[]).map(x=>x.run_id)));
   }
   setLoading(false);
  })().catch(()=>{if(live&&tenantRef.current===tenantId){setError("No se pudo leer la bandeja.");setLoading(false);}});
  return()=>{live=false;};
 },[tenantId,refresh]);
 const pending=runs.filter(r=>!reviewed.has(r.id));
 const current=pending.find(r=>r.id===selected)??null;
 function open(run:Trial){
   setSelected(run.id);
   setEdited(typeof run.output?.draft==="string"?run.output.draft:"");
   setComment("");setError("");setNotice("");
 }
 async function decide(decision:"approved"|"rejected"){
   if(!current||saving)return;
   if(decision==="approved"&&(!edited.trim()||edited.length>5000)){setError("El borrador aprobado debe contener entre 1 y 5000 caracteres.");return;}
   const forTenant=tenantId;
   setSaving(true);setError("");setNotice("");
   try{
    const auth=await supabase.auth.getUser();
    if(auth.error||!auth.data.user)throw new Error("Debes iniciar sesión.");
    const response=await supabase.from("ai_agent_reviews").insert({
      tenant_id:forTenant,run_id:current.id,reviewed_by:auth.data.user.id,
      decision,reviewed_text:decision==="approved"?edited.trim():null,
      note:comment.trim()||null
    });
    if(response.error)throw response.error;
    if(tenantRef.current!==forTenant)return;
    setReviewed(prev=>new Set(prev).add(current.id));
    setSelected(null);setEdited("");setComment("");
    setNotice(decision==="approved"?"Borrador revisado y aprobado; NO enviado al cliente.":"Borrador rechazado; no se ha enviado.");
    setRefresh(v=>v+1);
   }catch(e){
    if(tenantRef.current===forTenant)setError("No se pudo registrar la revisión: "+(e instanceof Error?e.message:"Intenta de nuevo."));
   }finally{if(tenantRef.current===forTenant)setSaving(false);}
 }
 return <section className="card" aria-label="Aprobación humana de empleados digitales" style={{marginTop:18}}>
  <div className="topbar"><div><div className="eyebrow">Control humano obligatorio</div><h2>Bandeja de borradores IA</h2></div>
   <button type="button" className="button" onClick={()=>setRefresh(v=>v+1)}><RefreshCw size={15}/> Actualizar</button>
  </div>
  <div className="notice"><ShieldCheck size={16}/> Aprobar no envía mensajes, no confirma citas y no cambia oportunidades. Solo registra tu decisión en una auditoría inmutable.</div>
  {notice&&<div className="notice" role="status">{notice}</div>}
  {error&&<div className="notice" role="alert">{error}</div>}
  {loading?<p>Cargando borradores…</p>:pending.length===0?<div className="empty">Sin borradores pendientes de aprobación.</div>:
   <div className="stack gap-12">{pending.map(run=><button type="button" key={run.id}
     className={"button "+(selected===run.id?"primary":"")}
     onClick={()=>open(run)} style={{textAlign:"left",justifyContent:"flex-start"}}>
     {new Date(run.created_at).toLocaleString("es-DO")} · {String(run.input?.question??"Consulta").slice(0,90)}
   </button>)}</div>}
  {current&&<div className="stack gap-12" style={{marginTop:18}}>
   <label>Consulta que originó el borrador<textarea value={current.input?.question??""} readOnly rows={2}/></label>
   <label>Revisar y corregir la respuesta antes de aprobar<textarea value={edited} onChange={e=>setEdited(e.target.value)} rows={6} maxLength={5000}/></label>
   <label>Observaciones internas (opcionales)<textarea value={comment} onChange={e=>setComment(e.target.value)} rows={2} maxLength={1000}/></label>
   <div className="top-actions">
    <button type="button" className="button primary" disabled={saving||!edited.trim()} onClick={()=>void decide("approved")}><CheckCircle2 size={16}/> Aprobar borrador</button>
    <button type="button" className="button" disabled={saving} onClick={()=>void decide("rejected")}><XCircle size={16}/> Rechazar</button>
   </div>
  </div>}
 </section>;
}

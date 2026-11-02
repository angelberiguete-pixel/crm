"use client";

import Link from "next/link";
import {type FormEvent,useEffect,useState} from "react";
import {CalendarDays,PhoneCall,Search,Target} from "lucide-react";
import {supabase} from "@/lib/supabase";
import ArmAgencyProspectProfile from "@/components/arm-agency-prospect-profile";

type Prospect={
 id:string;name:string;stage:string;phone:string|null;decision_maker:string|null;
 next_action:string|null;next_action_at:string|null;city:string|null;
};
type Opportunity={
 id:string;title:string;status:string;contact_id:string|null;
 next_action:string|null;next_action_at:string|null
};
const stageLabels:Record<string,string>={
 prospecto:"Prospecto",contactado:"Contactado",respondio:"Respondió",
 reunion:"Reunión",calificado:"Calificado",propuesta:"Propuesta",
 negociacion:"Negociación",ganado:"Ganado",perdido:"Perdido"
};
const activityTypes=[
 {value:"call",label:"Llamada ya realizada"},
 {value:"whatsapp",label:"WhatsApp enviado manualmente"},
 {value:"email",label:"Correo enviado manualmente"},
 {value:"meeting",label:"Reunión ya realizada"},
 {value:"scheduled_meeting",label:"Programar una reunión futura"},
 {value:"proposal",label:"Propuesta ya presentada"},
 {value:"note",label:"Nota interna"},
] as const;

const dateLocal=(value:string|null)=>{
 if(!value)return "";
 const date=new Date(value);
 if(Number.isNaN(date.getTime()))return "";
 return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
};

export default function ArmAgencySalesDesk({tenantId,tenantSlug}:{tenantId:string;tenantSlug:string}){
 const [query,setQuery]=useState("");
 const [appliedQuery,setAppliedQuery]=useState("");
 const [searchBy,setSearchBy]=useState<"name"|"phone"|"email"|"decision_maker">("name");
 const [appliedSearchBy,setAppliedSearchBy]=useState<"name"|"phone"|"email"|"decision_maker">("name");
 const [stageFilter,setStageFilter]=useState("");
 const [page,setPage]=useState(0);
 const [total,setTotal]=useState(0);
 const [rows,setRows]=useState<Prospect[]>([]);
 const [selectedId,setSelectedId]=useState("");
 const [loading,setLoading]=useState(false);
 const [linkLoading,setLinkLoading]=useState(false);
 const [linkError,setLinkError]=useState(false);
 const [linkFor,setLinkFor]=useState("");
 const [opportunities,setOpportunities]=useState<Opportunity[]>([]);
 const [notice,setNotice]=useState("");
 const [error,setError]=useState("");
 const [saving,setSaving]=useState(false);
 const [revision,setRevision]=useState(0);
 const [kind,setKind]=useState("call");
 const [summary,setSummary]=useState("");
 const [outcome,setOutcome]=useState("");
 const [stage,setStage]=useState("prospecto");
 const [nextAction,setNextAction]=useState("");
 const [nextDate,setNextDate]=useState("");
 const [meetingLocation,setMeetingLocation]=useState("");

 const selected=rows.find(p=>p.id===selectedId)??null;
 const linkResolved=!!selectedId&&linkFor===selectedId&&!linkLoading;
 const linked=linkResolved&&!linkError&&opportunities.length===1?opportunities[0]:null;

 useEffect(()=>{
  let alive=true;
  setSelectedId("");setRows([]);setError("");setLoading(true);
  if(tenantSlug!=="eurevector"){setLoading(false);return()=>{alive=false;};}
  void (async()=>{
   let request=supabase.from("agency_prospects")
    .select("id,name,stage,phone,decision_maker,next_action,next_action_at,city",{count:"exact"});
   if(appliedQuery.trim().length>=2){
    const safe=appliedQuery.trim().replace(/[%_,()]/g," ").slice(0,80).trim();
    if(safe)request=request.ilike(appliedSearchBy,"%"+safe+"%");
   }
   if(stageFilter&&Object.hasOwn(stageLabels,stageFilter))request=request.eq("stage",stageFilter);
   const result=await request.order("created_at",{ascending:false}).range(page*25,page*25+24);
   if(!alive)return;
   if(result.error)setError("No se pudieron consultar los prospectos: "+result.error.message);
   else {setRows((result.data??[]) as Prospect[]);setTotal(result.count??0);}
   setLoading(false);
  })().catch(()=>{if(alive){setLoading(false);setError("No se pudo cargar la búsqueda de prospectos.");}});
  return()=>{alive=false;};
 },[appliedQuery,appliedSearchBy,stageFilter,page,revision,tenantId,tenantSlug]);

 useEffect(()=>{
  const p=rows.find(r=>r.id===selectedId);
  setStage(p?.stage??"prospecto");
  setNextAction(p?.next_action??"");
  setNextDate(dateLocal(p?.next_action_at??null));
  setSummary("");setOutcome("");setKind("call");setMeetingLocation("");setNotice("");
 },[selectedId]);

 useEffect(()=>{
  let alive=true;
  setOpportunities([]);setLinkFor("");setLinkError(false);setLinkLoading(!!selectedId);
  if(!selectedId||tenantSlug!=="eurevector"){setLinkLoading(false);return()=>{alive=false;};}
  void (async()=>{
   const result=await supabase.from("opportunities")
    .select("id,title,status,contact_id,next_action,next_action_at")
    .eq("tenant_id",tenantId)
    .contains("metadata",{agency_prospect_id:selectedId})
    .limit(2);
   if(!alive)return;
   if(result.error)setLinkError(true);
   else setOpportunities((result.data??[]) as Opportunity[]);
   setLinkFor(selectedId);
   setLinkLoading(false);
  })().catch(()=>{if(alive){setLinkError(true);setLinkLoading(false);}});
  return()=>{alive=false;};
 },[selectedId,tenantId,tenantSlug]);

 async function save(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(saving||!selected||tenantSlug!=="eurevector"||!linkResolved)return;
  if(summary.trim().length<3||summary.trim().length>1200){
   setError("Describe lo ocurrido con entre 3 y 1,200 caracteres.");return;
  }
  if(outcome.trim().length>200){setError("El resultado breve supera 200 caracteres.");return;}
  if(!Object.hasOwn(stageLabels,stage)){setError("Etapa comercial inválida.");return;}
  const planned=kind==="scheduled_meeting";
  const action=planned?(nextAction.trim().startsWith("Reunión presencial:")?nextAction.trim():"Reunión presencial: "+nextAction.trim()):nextAction.trim();
  if(action.length>300){setError("La próxima acción supera 300 caracteres.");return;}
  if(planned&&!nextAction.trim()){setError("Indica el motivo o asunto de la reunión.");return;}
  if(action&&!nextDate){setError("Indica cuándo debe realizarse la próxima acción.");return;}
  if(!action&&nextDate){setError("Escribe primero la próxima acción.");return;}
  if(planned&&new Date(nextDate).getTime()<=Date.now()){
   setError("Una nueva reunión debe programarse para una fecha futura.");return;
  }
  const date=nextDate?new Date(nextDate):null;
  if(date&&Number.isNaN(date.getTime())){setError("La fecha indicada no es válida.");return;}
  const backendType=planned?"task":kind;
  if(!["call","whatsapp","email","meeting","proposal","note","task"].includes(backendType)){
   setError("Actividad no permitida.");return;
  }
  setSaving(true);setError("");setNotice("");
  try{
   // A fresh authorization read is required even if the parent previously allowed rendering.
   const access=await supabase.rpc("platform_current_access");
   if(access.error||(access.data as {is_platform_admin?:boolean}|null)?.is_platform_admin!==true){
    throw new Error("La sesión no tiene permisos administrativos vigentes.");
   }
   const r=await supabase.rpc("agency_record_prospect_touch",{
    p_prospect_id:selected.id,p_activity_type:backendType,
    p_summary:summary.trim(),p_outcome:outcome.trim()||null,
    p_stage:stage===selected.stage?null:stage,
    p_next_action:action||null,
    p_next_action_at:date?date.toISOString():null
   });
   if(r.error)throw r.error;
   if((r.data as {prospect_id?:string}|null)?.prospect_id!==selected.id){
    throw new Error("No se recibió confirmación de la actividad comercial.");
   }
   // The agency RPC commits prospect+activity atomically. The opportunity is a
   // separate RLS-controlled write; report partial success instead of hiding it.
   let detail="Actividad registrada y prospecto actualizado. ";
   if(!linkResolved||linkError||opportunities.length!==1){
    detail+="La oportunidad no se sincronizó: no existe un único vínculo verificado.";
   }else if(linked?.status!=="open"){
    detail+="La oportunidad vinculada está cerrada y no se modificó.";
   }else{
    const patch=await supabase.from("opportunities")
     .update({next_action:action||null,next_action_at:date?date.toISOString():null})
     .eq("tenant_id",tenantId).eq("id",linked.id).eq("status","open")
     .contains("metadata",{agency_prospect_id:selected.id}).select("id");
    if(patch.error||patch.data?.length!==1){
     detail+="La actualización de la oportunidad no se confirmó; revisa su seguimiento por separado.";
    }else{
     detail+="El siguiente seguimiento también se actualizó en su oportunidad existente.";
    }
   }
   if(planned&&date){
    // A scheduled meeting is an internal CRM appointment, not a confirmed customer invitation.
    const [permissionsResult,modulesResult]=await Promise.all([
     supabase.rpc("tenant_current_permissions",{p_tenant_id:tenantId}),
     supabase.rpc("tenant_effective_modules",{p_tenant_id:tenantId})
    ]);
    const permissions=(permissionsResult.data??{}) as Record<string,unknown>;
    const modules=(modulesResult.data??[]) as Array<{module_key:string;enabled:boolean}>;
    const canUseCalendar=!permissionsResult.error&&!modulesResult.error
     &&(permissions.all===true||permissions.calendar===true)
     &&modules.find(m=>m.module_key==="calendar")?.enabled!==false;
    const activityId=(r.data as {activity_id?:string}|null)?.activity_id;
    if(!canUseCalendar||!activityId){
     detail+=" No se pudo validar el acceso al calendario; la reunión permanece como seguimiento.";
    }else{
     const end=new Date(date.getTime()+45*60*1000);
     const event=await supabase.from("calendar_events").insert({
      tenant_id:tenantId,title:"Reunión · "+selected.name,
      description:summary.trim(),event_type:"meeting",status:"scheduled",
      starts_at:date.toISOString(),ends_at:end.toISOString(),
      timezone:"America/Santo_Domingo",location:meetingLocation.trim()||null,
      contact_id:linked?.contact_id??null,
      opportunity_id:linked?.id??null,
      metadata:{agency_prospect_id:selected.id,agency_activity_id:activityId,source:"arm_agency_manual"}
     }).select("id").single();
     if(event.error||!event.data?.id){
      detail+=" El seguimiento se guardó, pero el calendario no confirmó la creación de la cita.";
     }else{
      detail+=" Se agregó una reunión interna de 45 minutos al calendario del CRM, sin enviar invitaciones.";
     }
    }
   }
   setRows(previous=>previous.map(p=>p.id===selected.id
    ?{...p,stage,next_action:action||null,next_action_at:date?date.toISOString():null}
    :p));
   setSummary("");setOutcome("");
   setNotice(detail+" Utiliza «Actualizar agenda» para refrescar los totales.");
  }catch(e){
   setError("No se pudo registrar la actividad: "+(e instanceof Error?e.message:"error desconocido"));
  }finally{setSaving(false);}
 }

 if(tenantSlug!=="eurevector")return null;
 return <section className="card section-gap" aria-label="Registro comercial integrado">
  <div className="eyebrow"><PhoneCall size={16}/> Operación comercial exclusiva · Look Social Media</div>
  <h2>Registrar una llamada, reunión o próximo contacto</h2>
  <p className="muted">Utiliza prospectos existentes y sus oportunidades vinculadas. Esto registra actividades que tú confirmes; no inicia llamadas ni envía mensajes.</p>
  <form className="section-gap" onSubmit={e=>{
   e.preventDefault();setPage(0);setAppliedSearchBy(searchBy);setAppliedQuery(query.trim());setNotice("");
  }}>
   <div className="form-grid">
    <label>Buscar prospectos
     <input type="search" value={query} onChange={e=>setQuery(e.target.value)}
      placeholder="Nombre o dato según el filtro" maxLength={80}/></label>
    <label>Buscar por
     <select value={searchBy} onChange={e=>setSearchBy(e.target.value as typeof searchBy)}>
      <option value="name">Nombre del negocio</option>
      <option value="phone">Teléfono</option>
      <option value="email">Correo</option>
      <option value="decision_maker">Persona encargada</option>
     </select>
    </label>
    <label>Etapa comercial
     <select value={stageFilter} onChange={e=>{setStageFilter(e.target.value);setPage(0);}}>
      <option value="">Todas las etapas</option>
      {Object.entries(stageLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}
     </select>
    </label>
    <button className="button" type="submit" disabled={loading}><Search size={16}/> Buscar</button>
   </div>
   <small className="muted">Consultas paginadas sobre la cartera existente: 25 registros por página. No se importan prospectos duplicados.</small>
  </form>
  <div className="section-gap" style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
   <span className="muted">{loading?"Consultando…":total+" prospectos encontrados · Página "+(page+1)+" de "+Math.max(1,Math.ceil(total/25))}</span>
   <div style={{display:"flex",gap:8}}>
    <button type="button" className="button small" disabled={loading||saving||page===0} onClick={()=>setPage(n=>Math.max(0,n-1))}>Anterior</button>
    <button type="button" className="button small" disabled={loading||saving||(page+1)*25>=total} onClick={()=>setPage(n=>n+1)}>Siguiente</button>
    <button type="button" className="button small" disabled={loading||saving} onClick={()=>setRevision(n=>n+1)}>Actualizar</button>
   </div>
  </div>
  {loading&&<p className="muted">Consultando prospectos…</p>}
  {!loading&&rows.length===0&&<p className="muted">No se encontraron prospectos visibles con ese nombre.</p>}
  <div className="section-gap">
   <label>Prospecto
    <select aria-label="Prospecto comercial" value={selectedId} onChange={e=>setSelectedId(e.target.value)}
     disabled={loading||saving}>
     <option value="">Selecciona un prospecto</option>
     {rows.map(p=><option value={p.id} key={p.id}>{p.name} · {stageLabels[p.stage]??p.stage}</option>)}
    </select>
   </label>
  </div>
  {selected&&<div className="stack gap-12 section-gap">
   <ArmAgencyProspectProfile key={tenantId+":"+selected.id} tenantId={tenantId} tenantSlug={tenantSlug} prospectId={selected.id} contactId={linked?.contact_id??null}
    onSaved={(id,fields)=>setRows(current=>current.map(p=>p.id===id?{...p,decision_maker:fields.decision_maker===undefined?p.decision_maker:fields.decision_maker}:p))}/>
   <div className="priority-item">
    <strong>{selected.name}</strong>
    <span>{selected.city??"Ciudad no registrada"} · {selected.decision_maker??"Responsable no registrado"}</span>
    {selected.phone&&<a href={"tel:"+selected.phone.replace(/[^\d+]/g,"")}><PhoneCall size={15}/> Llamar (no registra actividad automáticamente)</a>}
    {!linkResolved?<small>Comprobando vínculo con oportunidad…</small>:
     linkError?<small>No se pudo comprobar la oportunidad vinculada.</small>:
     linked?<div><small><Target size={13}/> Oportunidad existente: {linked.title} · {linked.status==="open"?"Abierta":"Cerrada"}</small>
       {linked.contact_id&&<Link href={"/crm/revenue?contactId="+encodeURIComponent(linked.contact_id)}>Abrir oportunidad vinculada</Link>}
     </div>:<small>{opportunities.length>1?"Vínculo ambiguo; sincronización bloqueada.":"Sin oportunidad vinculada; no se creará otra automáticamente."}</small>}
   </div>
   <form className="stack gap-12" onSubmit={event=>void save(event)}>
    <div className="form-grid">
     <label>Actividad
      <select value={kind} onChange={e=>setKind(e.target.value)} disabled={saving}>
       {activityTypes.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
      </select>
     </label>
     <label>Etapa del prospecto
      <select value={stage} onChange={e=>setStage(e.target.value)} disabled={saving}>
       {Object.entries(stageLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}
      </select>
     </label>
    </div>
    <label>{kind==="scheduled_meeting"?"Motivo de la reunión que vas a programar":"Descripción de lo que ocurrió realmente"}
     <textarea required minLength={3} maxLength={1200} rows={3}
      value={summary} disabled={saving} onChange={e=>setSummary(e.target.value)}
      placeholder={kind==="scheduled_meeting"?"Ej. Solicitar cita presencial para presentar la solución":"Ej. Llamé al negocio; no contestaron"}/>
    </label>
    <label>Resultado breve (opcional)
     <input maxLength={200} value={outcome} disabled={saving} onChange={e=>setOutcome(e.target.value)}
      placeholder="Ej. Sin respuesta, interés confirmado"/>
    </label>
    <div className="form-grid">
     <label>{kind==="scheduled_meeting"?"Asunto de la reunión":"Próxima acción (en blanco: sin seguimiento)"}
      <input value={nextAction} maxLength={260} disabled={saving}
       onChange={e=>setNextAction(e.target.value)} placeholder="Ej. Llamar para confirmar cita"/>
     </label>
     <label>Fecha y hora del próximo seguimiento
      <input type="datetime-local" value={nextDate} disabled={saving} onChange={e=>setNextDate(e.target.value)}/>
     </label>
    </div>
    {kind==="scheduled_meeting"&&<>
     <label>Lugar previsto (opcional)
      <input maxLength={200} value={meetingLocation} disabled={saving} onChange={e=>setMeetingLocation(e.target.value)}
       placeholder="Ej. Dirección por confirmar"/>
     </label>
     <p className="muted"><CalendarDays size={15}/> Se registra un evento interno de 45 minutos y su seguimiento. No se marca la reunión como realizada, confirmada por el cliente ni se le envía una invitación.</p>
    </>}
    {notice&&<div role="status" className="notice">{notice}</div>}
    {error&&<div role="alert" className="notice">{error}</div>}
    <button type="submit" disabled={saving||!linkResolved||summary.trim().length<3} className="button primary">
     {saving?"Guardando registro…":"Registrar actividad y actualizar seguimiento"}
    </button>
   </form>
  </div>}
  {!selected&&error&&<div role="alert" className="notice">{error}</div>}
 </section>;
}

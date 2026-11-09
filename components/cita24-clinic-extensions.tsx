"use client";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Config={
 tenant_id:string;slug:string;clinic_name:string;services:string[];
 enabled:boolean;ai_enabled:boolean;whatsapp_reminders_enabled:boolean;
};
type VisitRequest={
 id:string;full_name:string;phone:string;email:string|null;
 service:string;preferred_day:string;preferred_window:string;
 status:"pending"|"contacted"|"scheduled"|"declined";
 whatsapp_opt_in:boolean;created_at:string;
};
type WhatsAppState={provider_ready?:boolean;outbound_send_tested?:boolean;routes?:Array<{is_enabled?:boolean;channel_status?:string;verified_at?:string|null}>};
const windows:Record<string,string>={morning:"Mañana",afternoon:"Tarde",evening:"Noche"};
const safeMessage=(err:unknown)=>err instanceof Error?err.message:"Operación no disponible.";
export default function Cita24ClinicExtensions({
 tenantId,tenantName,tenantSlug,role,
}:{tenantId:string;tenantName:string;tenantSlug:string;role:string}){
 const canConfigure=["owner","admin"].includes(role);
 const [config,setConfig]=useState<Config|null>(null);
 const [requests,setRequests]=useState<VisitRequest[]>([]);
 const [whatsApp,setWhatsApp]=useState<WhatsAppState|null>(null);
 const [fetching,setFetching]=useState(true);
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState("");
 const [slug,setSlug]=useState(tenantSlug.replace(/[^a-z0-9-]/g,"-").slice(0,56));
 const [clinicName,setClinicName]=useState(tenantName);
 const [servicesText,setServicesText]=useState("Evaluación inicial\nConsulta de información");
 const [portalEnabled,setPortalEnabled]=useState(false);
 const [aiEnabled,setAiEnabled]=useState(false);
 const [question,setQuestion]=useState("¿Cómo solicito una evaluación y quién confirma la cita?");
 const [draft,setDraft]=useState("");
 const [reload,setReload]=useState(0);

 const refresh=useCallback(()=>setReload(v=>v+1),[]);
 useEffect(()=>{
  let alive=true;
  setFetching(true);setConfig(null);setRequests([]);setWhatsApp(null);
  void (async()=>{
   const [c,r]=await Promise.all([
    supabase.from("cita24_portal_configs")
      .select("tenant_id,slug,clinic_name,services,enabled,ai_enabled,whatsapp_reminders_enabled")
      .eq("tenant_id",tenantId).maybeSingle(),
    supabase.from("cita24_visit_requests")
      .select("id,full_name,phone,email,service,preferred_day,preferred_window,status,whatsapp_opt_in,created_at")
      .eq("tenant_id",tenantId).order("created_at",{ascending:false}).limit(100),
   ]);
   if(!alive)return;
   if(c.error||r.error)throw c.error??r.error;
   const cfg=(c.data??null) as Config|null;
   setConfig(cfg);setRequests((r.data??[]) as VisitRequest[]);
   if(cfg){setSlug(cfg.slug);setClinicName(cfg.clinic_name);
    setServicesText(cfg.services.join("\n"));setPortalEnabled(cfg.enabled);setAiEnabled(cfg.ai_enabled);}
   if(canConfigure){
    const result=await supabase.rpc("tenant_ycloud_connection_status",{p_tenant_id:tenantId});
    if(alive&&result.data&&!result.error)setWhatsApp(result.data as WhatsAppState);
   }
  })().catch((err:unknown)=>{if(alive)setNotice("No se pudo consultar el módulo: "+safeMessage(err))})
   .finally(()=>{if(alive)setFetching(false)});
  return()=>{alive=false};
 },[tenantId,canConfigure,reload]);
 async function savePortal(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(!canConfigure||busy)return;
  const services=servicesText.split("\n").map(x=>x.trim()).filter(Boolean);
  if(!/^[a-z0-9][a-z0-9-]{2,55}$/.test(slug)||
     clinicName.trim().length<3||clinicName.trim().length>100||
     services.length<1||services.length>12||services.some(x=>x.length<2||x.length>80||/[<>]/.test(x))){
    setNotice("Valida identificador, nombre de la clínica y entre 1 y 12 servicios administrativos.");return;
  }
  setBusy(true);setNotice("");
  try{
   const values={
    tenant_id:tenantId,slug,clinic_name:clinicName.trim(),services,
    enabled:portalEnabled,ai_enabled:aiEnabled,whatsapp_reminders_enabled:config?.whatsapp_reminders_enabled??false,
    updated_at:new Date().toISOString(),
   };
   const result=config
    ?await supabase.from("cita24_portal_configs").update(values).eq("tenant_id",tenantId).select("tenant_id").single()
    :await supabase.from("cita24_portal_configs").insert(values).select("tenant_id").single();
   if(result.error)throw result.error;
   setNotice("Configuración guardada. La apertura al público también requiere CAPTCHA configurado en el servidor.");
   refresh();
  }catch(err){setNotice("No se guardó: "+safeMessage(err))}
  finally{setBusy(false)}
 }
 async function triageRequest(row:VisitRequest, action:"contacted"|"declined"){
  if(busy)return;
  setBusy(true);setNotice("");
  try{
   if(action==="contacted"){
    const existing=await supabase.from("contacts").select("id")
     .eq("tenant_id",tenantId).eq("phone",row.phone).limit(1);
    if(existing.error)throw existing.error;
    let contactId=existing.data?.[0]?.id as string|undefined;
    if(!contactId){
     const saved=await supabase.from("contacts").insert({
      tenant_id:tenantId,display_name:row.full_name,phone:row.phone,
      email:row.email,whatsapp_phone:row.whatsapp_opt_in?row.phone:null,
      source:"web",status:"lead",
      metadata:{
       origin_module:"cita24",request_id:row.id,
       cita24_whatsapp_admin_consent:row.whatsapp_opt_in,
       cita24_consent_captured_at:row.whatsapp_opt_in?row.created_at:null
      }
     }).select("id").single();
     if(saved.error)throw saved.error;
     contactId=saved.data.id;
    }
    const task=await supabase.from("tasks").insert({
      tenant_id:tenantId,contact_id:contactId,
      title:"Contactar solicitud web · "+row.full_name,
      description:"Solicitud de "+row.service+" para "+row.preferred_day+
       " ("+(windows[row.preferred_window]??"Por confirmar")+"). Confirmar disponibilidad antes de agendar.",
      source:"manual",status:"todo",priority:"normal",
      due_at:new Date().toISOString(),metadata:{module:"cita24",kind:"public_request",request_id:row.id}
    });
    if(task.error)throw task.error;
   }
   const result=await supabase.from("cita24_visit_requests").update({
    status:action,updated_at:new Date().toISOString()
   }).eq("tenant_id",tenantId).eq("id",row.id).eq("status","pending").select("id").single();
   if(result.error)throw result.error;
   setNotice(action==="contacted"
     ?"Contacto incorporado al CRM con tarea. Todavía no tiene una cita confirmada."
     :"Solicitud marcada como declinada. No se enviaron mensajes.");
   refresh();
  }catch(err){setNotice("No se pudo procesar: "+safeMessage(err))}
  finally{setBusy(false)}
 }
 async function generateDraft(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy||!question.trim())return;
  setBusy(true);setDraft("");setNotice("");
  try{
   const result=await supabase.functions.invoke("cita24-reception-draft",{
    body:{tenant_id:tenantId,request_id:crypto.randomUUID(),question:question.trim()}
   });
   if(result.error||result.data?.ok!==true){
    const code=result.data?.error??"Función desactivada o no configurada";
    throw Error(String(code));
   }
   setDraft(String(result.data.draft??""));
   setNotice("Borrador generado. Una persona debe revisarlo antes de usarlo.");
  }catch(err){setNotice("IA no disponible: "+safeMessage(err))}
  finally{setBusy(false)}
 }
 const pending=requests.filter(r=>r.status==="pending");
 if(fetching)return <section className="card"><p className="muted">Cargando solicitudes e integraciones de Cita-24…</p></section>;
 const field={width:"100%",minHeight:40,padding:"8px",marginTop:5};
 return <div style={{display:"grid",gap:16,marginTop:18}}>
  {notice&&<div className="notice" role="status">{notice}</div>}
  <section className="card">
   <h2>Solicitudes recibidas desde la web</h2>
   <p className="muted">{pending.length} pendientes, {requests.length} solicitudes recientes. Son solicitudes, no citas reservadas.</p>
   {pending.length===0?<p className="muted">Aún no hay solicitudes pendientes.</p>:
    <div style={{display:"grid",gap:10}}>
     {pending.slice(0,30).map(row=><article className="priority-item" key={row.id}
      style={{display:"flex",flexWrap:"wrap",gap:12,justifyContent:"space-between",alignItems:"center"}}>
      <div><strong>{row.full_name}</strong><div className="muted">{row.phone} · {row.service}</div>
       <div className="muted">Preferencia: {row.preferred_day} · {windows[row.preferred_window]??row.preferred_window}</div></div>
      <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
       <button type="button" className="button small" disabled={busy} onClick={()=>void triageRequest(row,"contacted")}>Registrar en CRM y dar seguimiento</button>
       <button type="button" className="button small" disabled={busy} onClick={()=>void triageRequest(row,"declined")}>Declinar</button>
      </div>
     </article>)}
    </div>}
  </section>
  <section className="card">
   <h2>WhatsApp oficial de la clínica</h2>
   <p>{whatsApp?.provider_ready===true?"Ruta YCloud registrada y habilitada.":"No se ha confirmado una ruta YCloud habilitada para esta clínica."}</p>
   <p className="muted">Las solicitudes y citas no disparan mensajes sin canal empresarial verificado, consentimiento, plantilla aprobada y autorización de envío. El envío manual existente sigue separado.</p>
   <Link className="button" href="/crm/channels">Configurar canales en Empresia</Link>
  </section>
  <section className="card">
   <h2>Asistente de recepción con IA</h2>
   <p className="muted">Genera respuestas administrativas para revisión humana. No escribas información médica ni datos personales de pacientes.</p>
   <form onSubmit={(event)=>void generateDraft(event)} style={{display:"grid",gap:10}}>
    <label>Pregunta administrativa<textarea style={{width:"100%",padding:10,minHeight:88}}
     minLength={8} maxLength={400} required value={question} onChange={e=>setQuestion(e.target.value)}/></label>
    <button type="submit" className="button" disabled={busy||!aiEnabled}>Generar borrador con IA</button>
   </form>
   {draft&&<div className="notice" style={{marginTop:10}}><strong>Borrador sin enviar</strong><p>{draft}</p>
      <button type="button" className="button small" onClick={()=>void navigator.clipboard.writeText(draft)}>Copiar borrador</button></div>}
   {!aiEnabled&&<p className="muted">El administrador aún no ha habilitado pruebas de IA para esta clínica.</p>}
  </section>
  {canConfigure&&<form className="card" onSubmit={(event)=>void savePortal(event)}
      style={{display:"grid",gap:12}}>
    <h2>Configuración del portal Cita-24</h2>
    <p className="muted">Solo administradores. Se crea deshabilitado y no activa gastos ni envíos de mensajería.</p>
    <label>Identificador público<input style={field} minLength={3} maxLength={56}
       value={slug} onChange={e=>setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,""))}/></label>
    <label>Nombre público<input style={field} minLength={3} maxLength={100}
       value={clinicName} onChange={e=>setClinicName(e.target.value)}/></label>
    <label>Opciones de consulta, una por línea<textarea style={{width:"100%",minHeight:90,padding:10}}
       value={servicesText} onChange={e=>setServicesText(e.target.value)}/></label>
    <label><input type="checkbox" checked={portalEnabled} onChange={e=>setPortalEnabled(e.target.checked)}/>
      Habilitar portal de solicitudes (requiere verificación antiabuso configurada en servidor).</label>
    <label><input type="checkbox" checked={aiEnabled} onChange={e=>setAiEnabled(e.target.checked)}/>
      Permitir pruebas de borradores IA (requiere proveedor y límite de gasto configurados).</label>
    <button className="button primary" type="submit" disabled={busy}>Guardar configuración</button>
    {config&&<div className="muted">Ruta pública prevista: <code>/cita24/{config.slug}</code> ·
      El paciente no reserva hasta que recepción confirme personalmente.</div>}
  </form>}
 </div>;
}

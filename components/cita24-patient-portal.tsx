"use client";
import Script from "next/script";
import { FormEvent, useEffect, useRef, useState } from "react";
import { CRM_SUPABASE_URL, CRM_SUPABASE_PUBLISHABLE_KEY } from "@/lib/supabase";

type PortalConfig = {ok:boolean;clinic_name:string;services:string[];timezone:string;note:string};
type TurnstileWidget = {
 render: (element: HTMLElement, config: Record<string, unknown>) => string;
 remove: (id:string)=>void;
 reset:(id:string)=>void;
};
const siteKey=process.env.NEXT_PUBLIC_CITA24_TURNSTILE_SITE_KEY || "";
const windows=[["morning","Mañana"],["afternoon","Tarde"],["evening","Noche"]] as const;
const dateText=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Santo_Domingo",year:"numeric",month:"2-digit",day:"2-digit"});
function normalPhone(input:string){
 const digits=input.replace(/\D/g,"");
 if(digits.length===10)return "+1"+digits;
 if(digits.length>=8&&digits.length<=15)return "+"+digits;
 return "";
}
function securityWidget(){
 return (window as Window & {turnstile?:TurnstileWidget}).turnstile;
}
export default function Cita24PatientPortal({slug}:{slug:string}){
 const [clinic,setClinic]=useState<PortalConfig|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [sent,setSent]=useState(false);
 const [busy,setBusy]=useState(false);
 const [name,setName]=useState("");
 const [phone,setPhone]=useState("");
 const [email,setEmail]=useState("");
 const [service,setService]=useState("");
 const [preferredDate,setPreferredDate]=useState("");
 const [windowName,setWindowName]=useState("morning");
 const [privacy,setPrivacy]=useState(false);
 const [whatsapp,setWhatsapp]=useState(false);
 const [website,setWebsite]=useState("");
 const [token,setToken]=useState("");
 const [scriptReady,setScriptReady]=useState(false);
 const widgetRoot=useRef<HTMLDivElement>(null);
 const widgetId=useRef<string|null>(null);
 const endpoint=CRM_SUPABASE_URL+"/functions/v1/cita24-public-request";

 useEffect(()=>{
  const controller=new AbortController();
  void fetch(endpoint+"?clinic="+encodeURIComponent(slug),{
    headers:{"apikey":CRM_SUPABASE_PUBLISHABLE_KEY},
    cache:"no-store",signal:controller.signal,
  }).then(async response=>{
    const data=await response.json();
    if(!response.ok||data.ok!==true)throw Error("El portal no está habilitado para esta clínica.");
    setClinic(data as PortalConfig);
    setService((data as PortalConfig).services?.[0]??"");
  }).catch(()=>{if(!controller.signal.aborted)setError("Esta clínica todavía no recibe solicitudes desde Cita-24.");})
    .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[slug,endpoint]);

 useEffect(()=>{
  const turnstile=securityWidget();
  if(!scriptReady||!siteKey||!clinic||!widgetRoot.current||!turnstile)return;
  const id=turnstile.render(widgetRoot.current,{
   sitekey:siteKey,
   callback:(value:unknown)=>setToken(typeof value==="string"?value:""),
   "expired-callback":()=>setToken(""),
   "error-callback":()=>setToken("")
  });
  widgetId.current=id;
  return()=>{
   try{turnstile.remove(id)}catch{}
   widgetId.current=null;
  };
 },[scriptReady,clinic]);

 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(!clinic||busy||!token||!privacy||!siteKey)return;
  const recipient=normalPhone(phone);
  if(!recipient){setError("Incluye un teléfono válido, por ejemplo +18095550123.");return;}
  setBusy(true);setError("");
  try{
   const response=await fetch(endpoint,{
    method:"POST",headers:{"Content-Type":"application/json","apikey":CRM_SUPABASE_PUBLISHABLE_KEY},
    body:JSON.stringify({
      clinic:slug,name:name.trim(),phone:recipient,email:email.trim(),
      service,preferred_day:preferredDate,preferred_window:windowName,
      privacy_accepted:privacy,whatsapp_opt_in:whatsapp,turnstile_token:token,website
    }),
   });
   const data=await response.json().catch(()=>({}));
   if(response.status===429)throw Error("Demasiadas solicitudes. Intenta mañana o comunícate con la clínica.");
   if(!response.ok||data.ok!==true)throw Error("No se pudo recibir la solicitud. Verifica los datos y vuelve a intentarlo.");
   setSent(true);
  }catch(err){
   setError(err instanceof Error?err.message:"No se pudo enviar.");
   setToken("");
   if(widgetId.current)securityWidget()?.reset(widgetId.current);
  }finally{setBusy(false);}
 }
 const dateMin=dateText.format(new Date());
 const max=new Date(dateMin+"T16:00:00Z");
 max.setUTCDate(max.getUTCDate()+45);
 const dateMax=max.toISOString().slice(0,10);
 const field={width:"100%",minHeight:42,padding:"9px 12px",borderRadius:8,marginTop:5};
 return <main style={{minHeight:"100vh",padding:"40px 16px",background:"var(--background,#f7f8fa)"}}>
  <div style={{maxWidth:700,margin:"0 auto"}}>
   <header style={{marginBottom:20}}>
    <div className="eyebrow">Cita-24 · Empresia</div>
    <h1>Solicitar una cita</h1>
    <p className="muted">Este formulario recibe solicitudes administrativas. No es una reserva confirmada ni un servicio de urgencias médicas.</p>
   </header>
   {loading?<section className="card"><p>Cargando información de la clínica…</p></section>:
    !clinic?<section className="card" role="alert"><h2>Portal no disponible</h2><p>{error}</p></section>:
    sent?<section className="card" role="status"><h2>Solicitud recibida</h2>
      <p>Gracias. {clinic.clinic_name} revisará tu solicitud y confirmará si hay disponibilidad.</p>
      <p className="muted">No tienes una cita reservada todavía.</p></section>:
    <form className="card" onSubmit={(event)=>void submit(event)} style={{display:"grid",gap:16}}>
      <h2>{clinic.clinic_name}</h2>
      <label>Nombre y apellido<input style={field} required minLength={2} maxLength={100}
       autoComplete="name" value={name} onChange={e=>setName(e.target.value)}/></label>
      <label>Teléfono de contacto<input style={field} required autoComplete="tel" inputMode="tel"
       placeholder="+18095550123" value={phone} onChange={e=>setPhone(e.target.value)}/></label>
      <label>Correo electrónico (opcional)<input style={field} type="email" maxLength={180}
       autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label>
      <label>Tipo de consulta<select required style={field} value={service} onChange={e=>setService(e.target.value)}>
       {clinic.services.map(x=><option key={x} value={x}>{x}</option>)}</select></label>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:14}}>
       <label>Fecha preferida<input style={field} type="date" required min={dateMin} max={dateMax}
        value={preferredDate} onChange={e=>setPreferredDate(e.target.value)}/></label>
       <label>Horario preferido<select required style={field} value={windowName} onChange={e=>setWindowName(e.target.value)}>
        {windows.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      </div>
      <label><input type="checkbox" required checked={privacy} onChange={e=>setPrivacy(e.target.checked)}/> Autorizo que la clínica utilice estos datos exclusivamente para responder y administrar mi solicitud.</label>
      <label><input type="checkbox" checked={whatsapp} onChange={e=>setWhatsapp(e.target.checked)}/> Acepto recibir mensajes administrativos sobre esta solicitud por WhatsApp. (Opcional)</label>
      <div aria-hidden="true" style={{position:"absolute",left:"-99999px"}}>
       <label>No completar<input tabIndex={-1} autoComplete="off" value={website} onChange={e=>setWebsite(e.target.value)}/></label>
      </div>
      {siteKey&&<Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
         strategy="afterInteractive" onLoad={()=>setScriptReady(true)}/>}
      {siteKey?<div ref={widgetRoot} aria-label="Verificación antiabuso"/>:
       <div className="notice" role="alert">Las solicitudes están temporalmente deshabilitadas mientras configuramos la verificación antiabuso.</div>}
      {error&&<div className="notice" role="alert">{error}</div>}
      <button className="button primary" disabled={!siteKey||!token||busy||!privacy} type="submit">
       {busy?"Enviando…":"Enviar solicitud"}
      </button>
      <p className="muted">La clínica revisará la solicitud antes de ofrecer y confirmar una cita. Para una emergencia, comunícate directamente con tu centro médico.</p>
    </form>}
  </div>
 </main>;
}

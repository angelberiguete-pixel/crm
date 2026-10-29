"use client";

import Link from "next/link";
import {type FormEvent,useCallback,useEffect,useRef,useState} from "react";
import {AtSign,Bot,CheckCircle2,ClipboardCopy,ExternalLink,Inbox,Mail,MessageCircle,RefreshCw,ShieldCheck,Unplug,Workflow} from "lucide-react";
import {supabase} from "@/lib/supabase";
import {useActiveTenant} from "@/components/tenant-context";
import {useTenantBrand} from "@/components/tenant-brand-provider";
import styles from "./crm-integration-center.module.css";

type Provider="whatsapp"|"instagram"|"email";
type Channel={id:string;provider:Provider;name:string;record_status:string;verified:boolean};
type Health={tenant_id:string;whatsapp_verified_route:boolean;ai_spending_blocked:boolean;staff_profiles:number;channels:Channel[]};
type RequestRow={channel_id:string;provider:Provider;display_name:string;request_identifier:string|null;record_status:string;request_stage:string;requested_at:string};
const formLabel:{[K in Provider]:{title:string;label:string;placeholder:string;description:string;external:string;externalLabel:string}}={
 whatsapp:{
  title:"WhatsApp Business",label:"Número del negocio",placeholder:"+1 849 570 6550",
  description:"Primero verifica la titularidad en Meta, el Phone Number ID, WABA y la opción de coexistencia. Registrar un número no activa Cloud API.",
  external:"https://business.facebook.com/settings/whatsapp-business-accounts",
  externalLabel:"Revisar cuenta WhatsApp en Meta"
 },
 instagram:{
  title:"Instagram",label:"Usuario profesional",placeholder:"miempresa",
  description:"La mensajería requiere cuenta profesional, permisos de Meta y autorización oficial. No conecta Instagram al escribir el usuario.",
  external:"https://developers.facebook.com/apps/",
  externalLabel:"Configurar aplicación en Meta"
 },
 email:{
  title:"Correo empresarial",label:"Correo de la empresa",placeholder:"ventas@empresa.com",
  description:"La lectura y envío requieren OAuth del proveedor y permisos explícitos; nunca solicitamos la contraseña de Gmail.",
  external:"https://console.cloud.google.com/apis/credentials",
  externalLabel:"Revisar configuración de Google OAuth"
 },
};
const route="https://ygipjqgyreeahslzorik.supabase.co/functions/v1/meta-whatsapp-inbound";

function integrationState(kind:Provider,health:Health|null,requests:RequestRow[]){
 const channels=(health?.channels??[]).filter(c=>c.provider===kind);
 if(kind==="whatsapp"&&channels.some(c=>c.verified)&&health?.whatsapp_verified_route)
   return {text:"Número verificado en servidor",color:"verified",detail:"Ruta Meta registrada. Aún hay que comprobar recepción y entrega de extremo a extremo."};
 if(requests.some(r=>r.provider===kind)||channels.length>0)
   return {text:"Pendiente de autorización",color:"pending",detail:"Solicitud o registro detectado; no se ha validado la conexión real con el proveedor."};
 return {text:"Sin conectar",color:"off",detail:"Todavía no hay solicitud ni prueba oficial completada."};
}

export default function CrmIntegrationCenter(){
 const tenant=useActiveTenant();
 const brand=useTenantBrand();
 const id=tenant?.tenant_id??null;
 const admin=["owner","admin","manager"].includes(tenant?.membership_role??"");
 const activeId=useRef(id);activeId.current=id;
 const [health,setHealth]=useState<Health|null>(null);
 const [requests,setRequests]=useState<RequestRow[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [provider,setProvider]=useState<Provider|null>(null);
 const [identifier,setIdentifier]=useState("");
 const [channelName,setChannelName]=useState("");
 const [saving,setSaving]=useState(false);
 const [revision,setRevision]=useState(0);
 const refresh=useCallback(()=>setRevision(v=>v+1),[]);

 useEffect(()=>{
  let alive=true;
  setHealth(null);setRequests([]);setProvider(null);setIdentifier("");
  setLoading(true);setError("");setNotice("");
  if(!id||!admin){setLoading(false);return;}
  (async()=>{
   const [h,r]=await Promise.all([
     supabase.rpc("tenant_integration_health",{p_tenant_id:id}),
     supabase.rpc("tenant_channel_requests_overview",{p_tenant_id:id})
   ]);
   if(!alive||activeId.current!==id)return;
   if(h.error||r.error)throw h.error??r.error;
   const data=h.data as Health;
   if(data.tenant_id!==id)throw new Error("La respuesta no pertenece al negocio actual.");
   setHealth(data);
   setRequests((r.data??[]) as RequestRow[]);
  })().catch(e=>{if(alive&&activeId.current===id)setError("No se pudo verificar el estado: "+(e instanceof Error?e.message:"Intenta actualizar."));})
  .finally(()=>{if(alive&&activeId.current===id)setLoading(false);});
  return()=>{alive=false;};
 },[id,admin,revision]);

 const choose=(value:Provider)=>{
  setProvider(value);setIdentifier("");
  setChannelName(value==="whatsapp"?"WhatsApp comercial":value==="instagram"?"Instagram comercial":"Correo de atención");
  setError("");setNotice("");
 };
 async function submit(e:FormEvent){
  e.preventDefault();
  if(!id||!admin||!provider||saving)return;
  const sourceTenant=id;
  const value=identifier.trim(),name=channelName.trim();
  if(value.length<3||value.length>160||name.length<2||name.length>90){setError("Revisa el identificador y el nombre del canal.");return;}
  if(provider==="whatsapp"&&!/^\+[1-9]\d{7,14}$/.test(value)){setError("Incluye el número con código de país, por ejemplo +1 849 570 6550 (sin espacios).");return;}
  if(provider==="instagram"&&!/^[a-zA-Z0-9._]{1,30}$/.test(value)){setError("Escribe un usuario de Instagram válido, sin @.");return;}
  if(provider==="email"&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)){setError("Introduce un correo empresarial válido.");return;}
  setSaving(true);setError("");setNotice("");
  const result=await supabase.rpc("tenant_register_channel_request",{
    p_tenant_id:id,p_provider:provider,p_channel_name:name,p_identifier:value,
  });
  if(activeId.current!==sourceTenant)return;
  setSaving(false);
  if(result.error||typeof result.data!=="string"){setError("No se pudo registrar la solicitud: "+(result.error?.message??"No se confirmó la operación."));return;}
  setNotice("Solicitud registrada para esta empresa. La autorización de la API sigue pendiente; no se enviará ni recibirá contenido automáticamente.");
  setIdentifier("");setProvider(null);refresh();
 }
 if(!tenant)return <main className="content"><div className="loading">Selecciona la empresa para revisar sus integraciones.</div></main>;
 if(!admin)return <main className="content"><div role="alert" className="notice">Solo el propietario o administrador de la empresa puede gestionar integraciones.</div></main>;
 return <main className={styles.page}>
   <div className={styles.header}>
     <div><div className={styles.eyebrow}>CONFIGURACIÓN / INTEGRACIONES</div>
       <h1>Centro de Integraciones</h1>
       <p>Conecta la atención comercial con los empleados digitales de <strong>{brand?.name??tenant.tenant_name}</strong> sin mezclar las cuentas de otras empresas.</p></div>
     <button className={styles.refresh} type="button" onClick={refresh}><RefreshCw size={17}/> Actualizar</button>
   </div>
   <div className={styles.rule}><ShieldCheck size={20}/><div><strong>Las credenciales nunca se escriben en este panel.</strong>
     <p>Las solicitudes son reales y se guardan en el CRM, pero <b>no equivalen a una API conectada</b>. Los tokens, códigos y secretos solo se gestionarán en un flujo seguro de servidor con la autorización oficial del proveedor.</p></div></div>
   {loading&&<div role="status" className={styles.loading}>Comprobando conexiones y permisos de la empresa…</div>}
   {error&&<div role="alert" className={styles.error}>{error}</div>}
   {notice&&<div role="status" className={styles.success}>{notice}</div>}
   <div className={styles.grid}>
    {(["whatsapp","instagram","email"] as Provider[]).map(kind=>{
      const cfg=formLabel[kind],status=integrationState(kind,health,requests);
      const Icon=kind==="whatsapp"?MessageCircle:kind==="instagram"?AtSign:Mail;
      const connectedChannels=(health?.channels??[]).filter(c=>c.provider===kind);
      return <section className={styles.card} key={kind}>
        <div className={styles.cardHead}><span className={styles.icon}><Icon size={23}/></span>
          <span className={styles.status+" "+styles[status.color]}>{status.text}</span></div>
        <h2>{cfg.title}</h2>
        <p className={styles.summary}>{status.detail}</p>
        {connectedChannels.map(c=><div className={styles.record} key={c.id}>
          <span>{c.name}</span><small>{c.verified?"Ruta verificada":"Sin prueba de proveedor"}</small>
        </div>)}
        {requests.filter(r=>r.provider===kind&&!connectedChannels.some(c=>c.id===r.channel_id)).map(r=>
          <div className={styles.record} key={r.channel_id}><span>{r.display_name}</span><small>{r.request_stage||"Pendiente"}</small></div>)}
        <div className={styles.actions}>
          <button className={styles.primary} type="button" disabled={loading} onClick={()=>choose(kind)}>
            {status.color==="off"?"Preparar conexión":"Gestionar solicitud"}
          </button>
          <a href={cfg.external} target="_blank" rel="noopener noreferrer" className={styles.aux}>
            <ExternalLink size={14}/> {cfg.externalLabel}
          </a>
        </div>
      </section>;
    })}
    <section className={styles.card}>
      <div className={styles.cardHead}><span className={styles.icon}><Bot size={23}/></span>
        <span className={styles.status+" "+styles.off}>Bloqueado para gasto</span></div>
      <h2>Motor de IA · OpenAI</h2>
      <p className={styles.summary}>El proveedor de IA se configura en el servidor. Tu instrucción de no consumir créditos sigue vigente; ninguna empresa puede reactivarlo aquí.</p>
      <div className={styles.record}><span>Perfiles digitales preparados</span><strong>{health?.staff_profiles??"—"}</strong></div>
      <div className={styles.actions}>
        <Link className={styles.primary} href="/crm/employees">Configurar empleados</Link>
        <span className={styles.aux}>Sin pagos ni generación automática</span>
      </div>
    </section>
   </div>
   {provider&&<section className={styles.wizard} aria-label={"Solicitud de "+formLabel[provider].title}>
       <div className={styles.wizardTitle}><div><span className={styles.eyebrow}>PASO DE CONFIGURACIÓN REAL</span><h2>Preparar {formLabel[provider].title}</h2></div><button className={styles.close} type="button" onClick={()=>setProvider(null)}>Cerrar</button></div>
       <p>{formLabel[provider].description}</p>
       <form className={styles.form} onSubmit={e=>void submit(e)}>
         <label>Nombre interno del canal<input required minLength={2} maxLength={90} value={channelName} onChange={e=>setChannelName(e.target.value)}/></label>
         <label>{formLabel[provider].label}<input type={provider==="email"?"email":"text"} required maxLength={160}
           placeholder={formLabel[provider].placeholder} value={identifier} onChange={e=>setIdentifier(e.target.value)}/></label>
         <button className={styles.primary} disabled={saving}>{saving?"Registrando…":"Registrar solicitud segura"}</button>
       </form>
       <p className={styles.smallPrint}>No introduzcas tokens, contraseñas, códigos SMS ni secretos. El registro no autoriza el envío de mensajes.</p>
    </section>}
   <section className={styles.footerGrid}>
     <div className={styles.panel}>
       <div className={styles.eyebrow}>ORQUESTACIÓN COMERCIAL</div><h2>Del canal al empleado digital</h2>
       <div className={styles.steps}><span><MessageCircle size={18}/> Mensaje verificado</span><span><Workflow size={18}/> Conversación de la empresa</span><span><Bot size={18}/> Empleado asignado</span><span><ShieldCheck size={18}/> Revisión humana</span></div>
       <p>Los agentes solo usarán la información de su propia empresa. Las propuestas, citas y cobros requieren confirmación humana; actualmente no se generan respuestas automáticas de pago.</p>
       <div className={styles.footerActions}><Link href="/crm/employees" className={styles.primary}>Asignar empleados</Link><Link href="/crm/inbox" className={styles.secondary}><Inbox size={16}/> Ver conversaciones</Link></div>
     </div>
     <div className={styles.panel}>
       <div className={styles.eyebrow}>META WHATSAPP</div><h2>Configuración técnica</h2>
       <p>La dirección del receptor firmado ya está desplegada. Solo se activará una cuenta cuando Meta confirme la aplicación, el número y sus permisos.</p>
       <div className={styles.webhook}><small>Dirección de webhook (pública, no es una clave)</small><code>{route}</code>
         <button type="button" onClick={()=>void navigator.clipboard.writeText(route).then(()=>setNotice("Dirección pública copiada. Nunca compartas el secreto de Meta."))}><ClipboardCopy size={16}/> Copiar URL</button></div>
       <Link href="/crm/channels" className={styles.secondary}>Ver solicitudes y pruebas de canal</Link>
     </div>
   </section>
   <footer className={styles.disclaimer}><Unplug size={16}/> Conexiones por empresa en fase de autorización. No se declara operativa una API sin comprobación real de proveedor, entrega y permisos.</footer>
 </main>;
}

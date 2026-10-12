"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Clock3, Mail, MessageCircle, RefreshCw, ShieldCheck, Instagram } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useActiveTenant } from "@/components/tenant-context";
import styles from "@/components/crm-channel-setup.module.css";

type Provider = "whatsapp" | "instagram" | "email";
type RequestRow = {
  channel_id:string;provider:Provider;display_name:string;request_identifier:string|null;
  record_status:string;request_stage:string;requested_at:string;
};
const providers:Record<Provider,{name:string,label:string,placeholder:string,kind:"tel"|"text"|"email",description:string,requirement:string}>={
  whatsapp:{
    name:"WhatsApp Business",label:"Número de WhatsApp con código de país",
    placeholder:"+1 829 648 0491",kind:"tel",
    description:"Prepara la línea de atención que administrará tu equipo.",
    requirement:"Para activarla, la empresa debe autorizar su número mediante Meta Business y superar una prueba real de envío y recepción."
  },
  instagram:{
    name:"Instagram",label:"Usuario de Instagram",
    placeholder:"cuenta.empresa",kind:"text",
    description:"Registra el perfil del negocio para integrar sus mensajes directos.",
    requirement:"Se necesita autorizar una cuenta profesional compatible mediante Meta y verificar sus permisos de mensajería."
  },
  email:{
    name:"Correo electrónico",label:"Dirección de correo comercial",
    placeholder:"ventas@empresa.com",kind:"email",
    description:"Prepara el buzón que atenderán los vendedores.",
    requirement:"Se necesita vincular el proveedor del correo mediante OAuth u otra autorización segura y verificar recepción y envío."
  }
};
const formatDate=(value:string)=>{try{return new Intl.DateTimeFormat("es-DO",{dateStyle:"medium"}).format(new Date(value));}catch{return "—";}};

export default function CrmChannelSetup(){
  const tenant=useActiveTenant();
  const tenantId=tenant?.tenant_id;
  const role=tenant?.membership_role??"";
  const isManager=["owner","admin","manager"].includes(role);
  const [rows,setRows]=useState<RequestRow[]>([]);
  const [loading,setLoading]=useState(true);
  const [refresh,setRefresh]=useState(0);
  const [provider,setProvider]=useState<Provider>("whatsapp");
  const [name,setName]=useState("WhatsApp comercial");
  const [identifier,setIdentifier]=useState("");
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  const selected=providers[provider];

  useEffect(()=>{
    let active=true;
    setRows([]);setLoading(true);setError("");
    if(!tenantId||!isManager){setLoading(false);return;}
    (async()=>{
      try{
        const result=await supabase.rpc("tenant_channel_requests_overview",{p_tenant_id:tenantId});
        if(!active)return;
        if(result.error)throw result.error;
        setRows((result.data??[]) as RequestRow[]);
      }catch(e){if(active)setError("No se pudieron cargar los canales: "+(e instanceof Error?e.message:"Intenta actualizar."));}
      finally{if(active)setLoading(false);}
    })();
    return()=>{active=false};
  },[tenantId,isManager,refresh]);

  async function submit(e:FormEvent){
    e.preventDefault();
    if(!tenantId||!isManager||saving)return;
    setError("");setSuccess("");setSaving(true);
    try{
      const result=await supabase.rpc("tenant_register_channel_request",{
        p_tenant_id:tenantId,p_provider:provider,p_channel_name:name.trim(),
        p_identifier:identifier.trim()
      });
      if(result.error)throw result.error;
      if(typeof result.data!=="string")throw new Error("No se confirmó el registro de la solicitud.");
      setSuccess("Solicitud registrada. El canal está pendiente de autorización y NO puede enviar ni recibir mensajes todavía.");
      setIdentifier("");
      setRefresh(v=>v+1);
    }catch(e){setError("No se pudo registrar la solicitud: "+(e instanceof Error?e.message:"Intenta nuevamente."));}
    finally{setSaving(false);}
  }

  if(!tenant)return <main className="content"><div className="loading">Selecciona una empresa para preparar sus canales.</div></main>;
  if(!isManager)return <main className="content"><div className="notice" role="alert">Solo el propietario o un responsable autorizado puede solicitar conexiones. Los vendedores pueden atender las conversaciones asignadas una vez conectado el canal.</div></main>;

  return <main className="content" style={{maxWidth:1150,margin:"0 auto"}}>
    <header className="topbar">
      <div><div className="eyebrow">Configuración de la empresa</div><h1>Canales de atención</h1><p className="muted">Empresa: {tenant.tenant_name}</p></div>
      <div className="top-actions"><Link href="/crm/inbox" className="button"><ArrowLeft size={15}/> Conversaciones</Link><button type="button" className="button" onClick={()=>setRefresh(v=>v+1)}><RefreshCw size={15}/> Actualizar</button></div>
    </header>
    <div className={styles.notice}><ShieldCheck size={20} aria-hidden="true"/><p><strong>Una solicitud no equivale a una conexión.</strong> Registraremos únicamente los datos públicos del canal. No introduzcas contraseñas, tokens de Meta, códigos de verificación ni claves de correo aquí. Los mensajes reales permanecerán inactivos hasta completar la autorización del proveedor y una prueba funcional.</p></div>
    <section className={styles.columns}>
      <div className="card">
        <div className="eyebrow">Paso 1 · Preparar canal</div>
        <h2>Registrar solicitud de conexión</h2>
        <div className={styles.providerTabs} role="group" aria-label="Tipo de canal">
          <button type="button" className={provider==="whatsapp"?styles.selected:""} aria-pressed={provider==="whatsapp"} onClick={()=>{setProvider("whatsapp");setName("WhatsApp comercial");setIdentifier("");setError("");setSuccess("");}}><MessageCircle size={18}/> WhatsApp</button>
          <button type="button" className={provider==="instagram"?styles.selected:""} aria-pressed={provider==="instagram"} onClick={()=>{setProvider("instagram");setName("Instagram comercial");setIdentifier("");setError("");setSuccess("");}}><Instagram size={18}/> Instagram</button>
          <button type="button" className={provider==="email"?styles.selected:""} aria-pressed={provider==="email"} onClick={()=>{setProvider("email");setName("Correo de ventas");setIdentifier("");setError("");setSuccess("");}}><Mail size={18}/> Correo</button>
        </div>
        <p className="muted">{selected.description}</p>
        <form className="stack gap-16" onSubmit={submit}>
          <label>Nombre interno del canal<input autoComplete="off" required minLength={2} maxLength={90} value={name} onChange={e=>setName(e.target.value)}/></label>
          <label>{selected.label}<input autoComplete="off" required type={selected.kind} placeholder={selected.placeholder} value={identifier} onChange={e=>setIdentifier(e.target.value)}/></label>
          <button className="button primary" disabled={saving}>{saving?"Registrando…":"Registrar solicitud"}</button>
        </form>
        {success&&<div className="notice" role="status" style={{marginTop:12}}><CheckCircle2 size={17}/> {success}</div>}
        {error&&<div className="notice" role="alert" style={{marginTop:12}}>{error}</div>}
        <div className={styles.nextStep}><Clock3 size={19}/><div><strong>Paso 2 · Autorización y verificación</strong><p>{selected.requirement}</p><p className="muted">La conexión oficial y su prueba de extremo a extremo aún no están disponibles en este formulario.</p></div></div>
      </div>
      <section className="card" aria-label="Solicitudes de canales">
        <div className="eyebrow">Seguimiento</div>
        <h2>Canales registrados</h2>
        {loading?<div className="loading" role="status">Cargando solicitudes…</div>:rows.length===0?
        <div className="empty"><strong>Todavía no hay solicitudes.</strong><p>Registra el primer número de WhatsApp o la cuenta de Instagram o correo de esta empresa.</p></div>:
        <div className={styles.requestList}>{rows.map(r=><div className={styles.request} key={r.channel_id}>
          <div className={styles.requestHeading}><strong>{providers[r.provider]?.name??r.provider}</strong><span className={styles.pending}>Pendiente de verificación</span></div>
          <div>{r.display_name}</div>
          <div className="muted">{r.request_identifier??"Identificador de proveedor aún no verificado"}</div>
          <div className="muted">Registrado: {formatDate(r.requested_at)}</div>
          <small>{r.request_stage}</small>
          {r.record_status==="connected"&&<p className="muted">El sistema tiene un estado de conexión anterior; esta pantalla todavía no confirma que funcione el envío y la recepción.</p>}
        </div>)}</div>}
      </section>
    </section>
  </main>;
}

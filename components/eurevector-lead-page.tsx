"use client";

import { FormEvent, useEffect, useState } from "react";
import styles from "./eurevector-lead-page.module.css";
import { supabase } from "@/lib/supabase";

export default function EurevectorLeadPage(){
  const[name,setName]=useState(""); const[company,setCompany]=useState(""); const[email,setEmail]=useState(""); const[phone,setPhone]=useState(""); const[message,setMessage]=useState(""); const[consent,setConsent]=useState(false);
  const[busy,setBusy]=useState(false); const[status,setStatus]=useState<"idle"|"success"|"error">("idle"); const[error,setError]=useState(""); const[attribution,setAttribution]=useState<Record<string,string>>({});

  useEffect(()=>{
    if(typeof window==="undefined")return;
    const q=new URLSearchParams(window.location.search);
    setAttribution({
      utm_source:q.get("utm_source")??"",
      utm_medium:q.get("utm_medium")??"",
      utm_campaign:q.get("utm_campaign")??"",
      utm_content:q.get("utm_content")??"",
      utm_term:q.get("utm_term")??"",
      referrer:document.referrer??"",
      landing_url:window.location.href,
    });
  },[]);

  async function submit(e:FormEvent){
    e.preventDefault(); setBusy(true); setStatus("idle"); setError("");
    const r=await supabase.rpc("capture_public_lead",{
      p_slug:"eurevector",
      p_name:name,
      p_email:email||null,
      p_phone:phone||null,
      p_company:company||null,
      p_message:message||null,
      p_attribution:attribution,
      p_consent:consent,
    });
    setBusy(false);
    if(r.error){setStatus("error");setError(r.error.message);return}
    setStatus("success"); setName(""); setCompany(""); setEmail(""); setPhone(""); setMessage(""); setConsent(false);
  }

  return <main className={styles.page}>
    <div className={styles.wrap}>
      <header className={styles.header}><div className={styles.brand}>EURE<span>VECTOR</span></div><a className={styles.headerLink} href="#planes">Ver planes</a></header>
      <section className={styles.hero}>
        <div><span className={styles.badge}>CRM + Automatización + IA + Agencia</span><h1 className={styles.title}>Convierte más consultas en <em>ventas.</em></h1><p className={styles.lead}>Centraliza tus leads, automatiza seguimiento, organiza tu equipo comercial y conecta marketing, WhatsApp, IA y operaciones en un solo sistema adaptable a tu negocio.</p><div className={styles.features}><div className={styles.feature}>Leads y contactos en un solo CRM</div><div className={styles.feature}>Pipeline y seguimiento automático</div><div className={styles.feature}>WhatsApp, Inbox y automatizaciones</div><div className={styles.feature}>Odoo para inventario, ventas y ERP</div></div></div>
        <div className={styles.formCard}><h2>Solicita un diagnóstico</h2><p className={styles.muted}>Cuéntanos de tu negocio. El lead entra directamente a nuestro CRM para darle seguimiento.</p>{status==="success"?<div className={styles.success}>Solicitud recibida. Ya quedó registrada para seguimiento.</div>:<form className={styles.form} onSubmit={submit}><label>Nombre<input value={name} onChange={e=>setName(e.target.value)} required/></label><label>Empresa<input value={company} onChange={e=>setCompany(e.target.value)} placeholder="Nombre del negocio"/></label><label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="tu@empresa.com"/></label><label>WhatsApp / teléfono<input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+1 809..."/></label><label>¿Qué quieres mejorar?<textarea value={message} onChange={e=>setMessage(e.target.value)} placeholder="Ventas, seguimiento, publicidad, automatización, inventario..."/></label><label className={styles.consent}><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>Acepto que Eurevector me contacte sobre esta solicitud.</span></label>{status==="error"&&<div className={styles.error}>{error}</div>}<button className={styles.submit} disabled={busy||(!email&&!phone)}>{busy?"Registrando…":"Solicitar diagnóstico"}</button></form>}</div>
      </section>

      <section className={styles.section} id="planes"><div className={styles.sectionHead}><h2>CRM y servicios según el nivel que necesitas</h2><p>El software, la automatización y los servicios de agencia viven sobre la misma plataforma. Podemos empezar simple y aumentar personalización, canales e integraciones cuando el negocio lo requiera.</p></div><div className={styles.plans}>
        <article className={styles.plan}><h3>Essential</h3><div className={styles.price}>US$80 <small>/mes</small></div><p>Para organizar contactos, empresas, pipeline y seguimiento en un CRM personalizado.</p><div className={styles.list}><span>✓ CRM y contactos</span><span>✓ Pipeline comercial</span><span>✓ Calendario y reportes base</span><span>✓ Landing / captura de leads</span></div></article>
        <article className={`${styles.plan} ${styles.planFeatured}`}><h3>Growth</h3><div className={styles.price}>US$460 <small>/mes</small></div><p>Para negocios que quieren un sistema activo de captación, seguimiento y automatización.</p><div className={styles.list}><span>✓ Todo Essential</span><span>✓ WhatsApp y automatizaciones</span><span>✓ Campañas y embudos</span><span>✓ Optimización y reporting</span></div></article>
        <article className={styles.plan}><h3>Scale</h3><div className={styles.price}>US$800 <small>/mes</small></div><p>Para mayor personalización, IA, integraciones y operación administrada por Eurevector.</p><div className={styles.list}><span>✓ Todo Growth</span><span>✓ Agentes IA e integraciones</span><span>✓ Odoo / ERP</span><span>✓ White-label y soporte preferente</span></div></article>
      </div><p className={styles.note}>El presupuesto de publicidad se paga directamente a las plataformas. Implementaciones especiales, migraciones e integraciones complejas pueden requerir setup adicional.</p></section>

      <footer className={styles.footer}><span>© Eurevector · República Dominicana</span><a href="#top" onClick={()=>window.scrollTo({top:0,behavior:'smooth'})}>Volver arriba</a></footer>
    </div>
  </main>
}

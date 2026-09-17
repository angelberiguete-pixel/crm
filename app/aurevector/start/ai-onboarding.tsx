"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import styles from "./start.module.css";

type Business = {
  name: string; sector: string; country: string; city: string;
  description: string; services: string; hours: string; website: string;
};
type Draft = { business: Business; objectives: string[]; tone: string };

const emptyBusiness: Business = { name:"",sector:"",country:"República Dominicana",city:"",description:"",services:"",hours:"",website:"" };
const objectives = ["Vender servicios","Vender productos","Captar leads","Calificar prospectos","Responder preguntas","Agendar citas","Recuperar oportunidades","Seguimiento comercial","Soporte","Reactivación"];
const tones = ["Profesional y accesible","Amigable","Formal","Casual"];
const storageKey = "aurevector:onboarding:draft:v1";

function proposalFor(draft: Draft) {
  const clinic = /clinic|dental|est[eé]tica|odont/i.test(`${draft.business.sector} ${draft.business.description}`);
  return {
    vertical: clinic ? "Clínicas" : (draft.business.sector || "Servicios"),
    template: clinic ? "Sistema Cita-24" : "Configuración comercial base",
    pipeline: clinic ? ["Lead nuevo","Calificado","Cita","Confirmado","Seguimiento"] : ["Lead nuevo","Calificado","Propuesta","Negociación","Ganado"],
    capabilities: ["Inbox preparado","Pipeline comercial","Seguimiento y próxima acción","Agente IA en modo prueba"],
    automations: clinic ? ["Respuesta inicial","Confirmación y recordatorio","Recuperación de no-show","Reactivación"] : ["Asignación de lead","Seguimiento","Deal estancado","Reactivación"],
  };
}

export function AiOnboarding() {
  const [step,setStep] = useState(1);
  const [draft,setDraft] = useState<Draft>({business:emptyBusiness,objectives:[],tone:"Profesional y accesible"});
  const [hydrated,setHydrated] = useState(false);
  const [sandbox,setSandbox] = useState<string[]>([]);
  useEffect(()=>{ try { const raw=localStorage.getItem(storageKey); if(raw) setDraft(JSON.parse(raw)); } catch {} setHydrated(true); },[]);
  useEffect(()=>{ if(hydrated) localStorage.setItem(storageKey,JSON.stringify(draft)); },[draft,hydrated]);
  const proposal=useMemo(()=>proposalFor(draft),[draft]);
  const updateBusiness=(key:keyof Business,value:string)=>setDraft(d=>({...d,business:{...d.business,[key]:value}}));
  const toggle=(value:string)=>setDraft(d=>({...d,objectives:d.objectives.includes(value)?d.objectives.filter(x=>x!==value):[...d.objectives,value]}));
  const nextBusiness=(e:FormEvent)=>{e.preventDefault(); if(draft.business.name&&draft.business.sector&&draft.business.description) setStep(2)};
  if(!hydrated) return <main className={styles.shell}><div className={styles.card}>Preparando tu experiencia…</div></main>;
  return <main className={styles.shell}>
    <section className={styles.card}>
      <header className={styles.header}><span className={styles.brand}>AUREVECTOR</span><span className={styles.badge}>Vista previa · no crea un tenant todavía</span></header>
      <div className={styles.progress} aria-label={`Paso ${step} de 3`}><b>{step}/3</b><span><i style={{width:`${step/3*100}%`}} /></span></div>
      {step===1 && <form onSubmit={nextBusiness} className={styles.form}>
        <p className={styles.eyebrow}>PASO 1 · TU NEGOCIO</p><h1>Convierte conversaciones en clientes.</h1><p>Cuéntanos lo esencial. AUREVECTOR preparará una propuesta comercial para que puedas verla antes de activar tu CRM.</p>
        <label>Nombre del negocio<input required value={draft.business.name} onChange={e=>updateBusiness("name",e.target.value)} placeholder="Ej. Clínica Sonrisas" /></label>
        <div className={styles.two}><label>Sector<input required value={draft.business.sector} onChange={e=>updateBusiness("sector",e.target.value)} placeholder="Clínica, inmobiliaria, agencia…" /></label><label>País<input value={draft.business.country} onChange={e=>updateBusiness("country",e.target.value)} /></label></div>
        <label>¿Qué hace tu negocio?<textarea required value={draft.business.description} onChange={e=>updateBusiness("description",e.target.value)} placeholder="Describe clientes, problemas que resuelves y cómo vendes." /></label>
        <label>Servicios o productos<input value={draft.business.services} onChange={e=>updateBusiness("services",e.target.value)} placeholder="Separados por coma" /></label>
        <details><summary>Agregar información opcional</summary><div className={styles.optional}><input value={draft.business.city} onChange={e=>updateBusiness("city",e.target.value)} placeholder="Ciudad"/><input value={draft.business.hours} onChange={e=>updateBusiness("hours",e.target.value)} placeholder="Horario"/><input value={draft.business.website} onChange={e=>updateBusiness("website",e.target.value)} placeholder="Web o Instagram"/></div></details>
        <button className={styles.primary}>Continuar</button>
      </form>}
      {step===2 && <div className={styles.form}><p className={styles.eyebrow}>PASO 2 · OBJETIVOS</p><h1>¿Qué debe conseguir tu sistema?</h1><p>Puedes elegir varios. No limitamos tu agente a una sola tarea.</p><div className={styles.choices}>{objectives.map(o=><button type="button" className={draft.objectives.includes(o)?styles.selected:styles.choice} onClick={()=>toggle(o)} key={o}>{o}</button>)}</div><h2>Tono</h2><div className={styles.choices}>{tones.map(t=><button type="button" className={draft.tone===t?styles.selected:styles.choice} onClick={()=>setDraft(d=>({...d,tone:t}))} key={t}>{t}</button>)}</div><div className={styles.actions}><button className={styles.secondary} onClick={()=>setStep(1)}>Atrás</button><button className={styles.primary} disabled={!draft.objectives.length} onClick={()=>setStep(3)}>Generar propuesta</button></div></div>}
      {step===3 && <div className={styles.form}><p className={styles.eyebrow}>PASO 3 · VISTA PREVIA</p><h1>Tu sistema AUREVECTOR está listo para probar.</h1><p>Esta es una propuesta aislada de onboarding. Todavía no crea un tenant, no conecta WhatsApp y no ejecuta acciones externas.</p><div className={styles.summary}><div><small>Vertical</small><b>{proposal.vertical}</b></div><div><small>Template recomendado</small><b>{proposal.template}</b></div><div><small>Tono</small><b>{draft.tone}</b></div></div><div className={styles.grid}><article><h2>Pipeline propuesto</h2>{proposal.pipeline.map((x,i)=><p key={x}>{i+1}. {x}</p>)}</article><article><h2>Automatizaciones sugeridas</h2>{proposal.automations.map(x=><p key={x}>✓ {x}</p>)}</article></div><div className={styles.sandbox}><div><p className={styles.eyebrow}>SANDBOX</p><h2>Prueba la experiencia</h2><p>El sandbox inicial registra mensajes solo en esta sesión del navegador; no envía WhatsApp ni modifica el CRM.</p>{sandbox.map((m,i)=><div className={styles.message} key={i}>{m}</div>)}<form onSubmit={e=>{e.preventDefault();const fd=new FormData(e.currentTarget);const m=String(fd.get("message")||"").trim();if(m){setSandbox(s=>[...s,m]);e.currentTarget.reset();}}} className={styles.chat}><input name="message" placeholder="Ej. Recibo muchos leads pero pocos agendan"/><button>Enviar</button></form></div><aside><small>CONTEXTO ESTRUCTURADO</small><p><b>Negocio:</b> {draft.business.name}</p><p><b>Objetivos:</b> {draft.objectives.join(", ")}</p><p><b>Estado:</b> Sandbox aislado</p><p><b>WhatsApp:</b> Pendiente de conectar</p><p><b>Próxima acción:</b> Validar configuración antes de activar</p></aside></div><div className={styles.actions}><button className={styles.secondary} onClick={()=>setStep(2)}>Editar</button><button className={styles.primary} type="button" disabled>Activación y planes · siguiente fase</button></div></div>}
    </section>
  </main>;
}

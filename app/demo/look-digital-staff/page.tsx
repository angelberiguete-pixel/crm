"use client";
import {useMemo,useState} from "react";
import Link from "next/link";
import {ArrowRight,CheckCircle2,Clipboard,MessageCircle,ShieldCheck,Users,Workflow,Building2} from "lucide-react";
import {buildIllustrativeProposal,DEMO_ROLES,DEMO_SCENARIOS,makeDemoReply,type DemoRole,type DemoScenario} from "@/lib/digital-staff-commercial-demo";
import styles from "./demo.module.css";

const plans=[
 {name:"Inicio",scope:"CRM personalizado, contactos, pipeline y configuración inicial de un agente en modo supervisado.",claim:"Para validar el proceso de atención"},
 {name:"Crecimiento",scope:"CRM multiempresa, roles, flujos comerciales internos y hasta cuatro perfiles de agentes configurables.",claim:"Para organizar la operación comercial"},
 {name:"A medida",scope:"Evaluación de integración con Meta, agenda, correo, Odoo y despliegue dedicado si el contrato lo requiere.",claim:"Proyecto con alcance independiente"},
];
export default function DigitalStaffDemo(){
 const [company,setCompany]=useState("Empresa de ejemplo");
 const [scenario,setScenario]=useState<DemoScenario>("consulta");
 const [role,setRole]=useState<DemoRole>("recepcionista");
 const [plan,setPlan]=useState("Crecimiento");
 const [draft,setDraft]=useState(false);
 const [approved,setApproved]=useState(false);
 const [copied,setCopied]=useState("");
 const active=DEMO_SCENARIOS[scenario];
 const response=useMemo(()=>makeDemoReply(role,scenario,company),[company,role,scenario]);
 const proposal=useMemo(()=>buildIllustrativeProposal(company,plan,plans.find(p=>p.name===plan)?.scope??""),[company,plan]);
 const changeScenario=(v:DemoScenario)=>{setScenario(v);setRole(DEMO_SCENARIOS[v].role);setDraft(false);setApproved(false);};
 const copy=async(label:string,text:string)=>{try{await navigator.clipboard.writeText(text);setCopied(label);}catch{setCopied("Copia no disponible en este navegador.");}};
 return <main className={styles.page}>
   <div className={styles.shell}>
    <nav className={styles.nav} aria-label="Navegación de la demostración">
      <Link href="/"><span className={styles.brand}>LOOK</span> <span>DIGITAL STAFF</span></Link>
      <span className={styles.demoFlag}>SIMULACIÓN INTERACTIVA</span>
    </nav>
    <header className={styles.hero}>
      <div className={styles.eyebrow}><ShieldCheck size={15}/> Demostración comercial sin conexión ni consumo de API</div>
      <h1>Tu empresa. Tu CRM. Tus asistentes digitales.</h1>
      <p>Explora cómo se organizarían las consultas, oportunidades y revisiones humanas con Look Digital Staff. Todos los mensajes y resultados aquí son <strong>ficticios y locales a tu navegador</strong>: no existe IA real detrás de esta demostración.</p>
      <div className={styles.heroIndicators}>
        <span><Building2 size={16}/> Marca propia</span>
        <span><Users size={16}/> Datos separados por empresa</span>
        <span><Workflow size={16}/> Seguimiento supervisado</span>
      </div>
    </header>
    <div className={styles.layout}>
      <section className={styles.panel} aria-label="Configuración comercial">
        <div className={styles.panelHeader}><span>01</span><div><h2>Personaliza el escenario</h2><p>Estos cambios no se guardan ni crean un cliente.</p></div></div>
        <label className={styles.field}>Nombre comercial<input value={company} maxLength={80} onChange={e=>{setCompany(e.target.value);setDraft(false);setApproved(false);}} placeholder="Nombre de ejemplo"/></label>
        <label className={styles.field}>Tipo de consulta<select value={scenario} onChange={e=>changeScenario(e.target.value as DemoScenario)}>
          {Object.entries(DEMO_SCENARIOS).map(([key,value])=><option key={key} value={key}>{value.label}</option>)}
        </select></label>
        <label className={styles.field}>Empleado digital<select value={role} onChange={e=>{setRole(e.target.value as DemoRole);setDraft(false);setApproved(false);}}>
          {Object.entries(DEMO_ROLES).map(([key,name])=><option key={key} value={key}>{name}</option>)}
        </select></label>
        <div className={styles.callout}><ShieldCheck size={18}/> La configuración de agentes, los costos de API y los envíos reales se habilitan solo después de contratación y autorización.</div>
        <button className={styles.primary} onClick={()=>{setDraft(true);setApproved(false);}}>Simular borrador <ArrowRight size={18}/></button>
      </section>
      <section className={styles.panel} aria-label="Bandeja de conversación simulada">
        <div className={styles.panelHeader}><span>02</span><div><h2>Conversación y CRM</h2><p>Vista ilustrativa de WhatsApp, sin conexión a Meta.</p></div></div>
        <div className={styles.mockHeader}><MessageCircle size={19}/><div><strong>{company.trim()||"Mi negocio"}</strong><small>Bandeja ficticia · No se envía nada</small></div></div>
        <div className={styles.messages}>
          <div className={styles.customer}><span>Cliente ficticio</span><p>{active.customerText}</p></div>
          {draft?<div className={styles.employee}><span>{DEMO_ROLES[role]} · texto simulado</span><p>{response.message}</p></div>:<div className={styles.placeholder}>Selecciona «Simular borrador» para ver una respuesta predefinida.</div>}
        </div>
        <div className={styles.crmState}>
          <div><small>Intención ilustrativa</small><strong>{draft?response.intent:"Pendiente"}</strong></div>
          <div><small>Etapa sugerida</small><strong>{draft?response.crmStage:"Sin calificar"}</strong></div>
          <div><small>Siguiente acción</small><strong>{draft?response.nextStep:"Revisión pendiente"}</strong></div>
        </div>
        {draft&&<div className={styles.approval}>
          <div><CheckCircle2 size={18}/><span>{approved?"Aprobación simulada":"Revisión humana obligatoria"}</span></div>
          <p>{approved?"Se marcó el borrador como revisado solo en esta pantalla. No se envió ni registró nada en el CRM real.":"Ningún mensaje puede salir de esta demostración. La aprobación también se simula."}</p>
          <button className={styles.secondary} onClick={()=>setApproved(!approved)}>{approved?"Reabrir revisión":"Simular aprobación"}</button>
        </div>}
      </section>
    </div>
    <section className={styles.sales} aria-label="Propuesta comercial preliminar">
      <div className={styles.salesIntro}><div><div className={styles.eyebrow}>03 · Oferta comercial</div><h2>Del ejemplo a una propuesta profesional</h2><p>La contratación y el presupuesto final los dirige personalmente Ángel Berigüete. Ninguna opción activa suscripciones ni cobra dinero.</p></div>
      <span className={styles.legal}>Prestador propuesto: Ángel Berigüete</span></div>
      <div className={styles.planGrid}>{plans.map(p=><button key={p.name} type="button" className={plan===p.name?styles.planActive:styles.plan} aria-pressed={plan===p.name} onClick={()=>setPlan(p.name)}>
         <strong>{p.name}</strong><span>{p.claim}</span><p>{p.scope}</p>
         <small>Precio sujeto a evaluación y propuesta.</small>
      </button>)}</div>
      <div className={styles.proposal}><pre>{proposal}</pre><button className={styles.secondary} onClick={()=>void copy("propuesta",proposal)}><Clipboard size={16}/> Copiar borrador de propuesta</button></div>
      {copied&&<div role="status" className={styles.copyStatus}>{copied==="propuesta"?"Borrador copiado. No se envió a nadie.":copied}</div>}
    </section>
    <footer className={styles.footer}>Look Social Media · Dirección comercial y prestación de servicios: Ángel Berigüete. Demostración ficticia; no IA operativa ni acceso a datos de clientes.</footer>
   </div>
 </main>;
}

"use client";
import {useReducer,useState} from "react";
import {Activity,BrainCircuit,CheckCheck,ChevronRight,ClipboardCheck,LockKeyhole,Play,RotateCcw,ShieldCheck,Smartphone,Workflow} from "lucide-react";
import {initialLabState,labReduce,labStats,type LabEventType,type LabRole} from "@/lib/empresia-lab-engine";
import styles from "./page.module.css";

const events:ReadonlyArray<{id:LabEventType;label:string;detail:string}>=[
 {id:"message.inbound",label:"Mensaje por WhatsApp (ficticio)",detail:"Consulta por inversor de 3.6 kW"},
 {id:"contact.created",label:"Contacto nuevo",detail:"Ficha comercial de prueba"},
 {id:"opportunity.changed",label:"Oportunidad avanza",detail:"Cambio de etapa"},
 {id:"quotation.created",label:"Cotización registrada",detail:"Revisión de condiciones"},
 {id:"order.changed",label:"Pedido confirmado",detail:"Coordinación de operaciones"},
 {id:"delivery.changed",label:"Entrega actualizada",detail:"Seguimiento posventa"},
 {id:"payment.created",label:"Pago registrado",detail:"Validación independiente del proveedor"},
];
const statusLabels={proposed:"Pendiente",approved:"Aprobada",rejected:"Rechazada",executed:"Tarea creada",observed:"Resultado observado"};
const riskLabels={low:"Bajo",controlled:"Controlado",supervised:"Supervisado",restricted:"Restringido"};

export default function EmpresiaIntelligenceLab(){
 const [state,dispatch]=useReducer(labReduce,initialLabState);
 const [event,setEvent]=useState<LabEventType>("message.inbound");
 const [role,setRole]=useState<LabRole>("owner");
 const [priceVerified,setPriceVerified]=useState(false);
 const [showGuide,setShowGuide]=useState(true);
 const stats=labStats(state);
 return <main className={styles.shell}>
  <div className={styles.wrap}>
   <div className={styles.topline}><span className={styles.brand}><BrainCircuit size={25}/> EMPRESIA <span>INTELLIGENCE</span></span><span className={styles.isolated}><LockKeyhole size={14}/> Aislado</span></div>
   <header className={styles.hero}>
    <div>
     <p className={styles.overline}>Laboratorio móvil · versión de demostración</p>
     <h1>Prueba el cerebro comercial de Empresia</h1>
     <p>Observa cómo se genera una decisión, comprueba los permisos y ejecuta una tarea supervisada. Puedes repetir todo sin afectar ningún cliente.</p>
     <div className={styles.warning}><ShieldCheck size={19}/><div><strong>Simulación controlada, no producción.</strong> Los eventos y resultados son ficticios y existen solamente en esta pantalla. No consulta Supabase ni OpenAI, ni conecta WhatsApp, pagos o facturas.</div></div>
    </div>
    <div className={styles.heroIcon}><BrainCircuit size={66}/><span>01 / 07</span></div>
   </header>
   <section className={styles.metrics} aria-label="Resultados simulados">
     <article><small>Eventos</small><strong>{stats.events}</strong><span>Observados</span></article>
     <article><small>Pendientes</small><strong>{stats.proposed}</strong><span>Decisiones</span></article>
     <article><small>Tareas</small><strong>{stats.tasks}</strong><span>Creadas</span></article>
     <article><small>Resultados</small><strong>{stats.observed}</strong><span>Verificados</span></article>
   </section>
   <div className={styles.grid}>
    <section className={styles.panel}>
     <div className={styles.sectionHeading}><div><span className={styles.step}>01 · PERCEPCIÓN</span><h2>Generar un evento de prueba</h2></div><Activity size={21}/></div>
     <label className={styles.label} htmlFor="event-choice">Tipo de evento</label>
     <select id="event-choice" className={styles.select} value={event} onChange={e=>setEvent(e.target.value as LabEventType)}>
      {events.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}
     </select>
     <div className={styles.preview}><span>Contexto del evento</span><p>{events.find(x=>x.id===event)?.detail}</p>{event==="message.inbound"&&<blockquote>«Buenas, ¿tienen inversores de 3.6 kW y cuánto cuestan?»</blockquote>}</div>
     {event==="message.inbound"&&<label className={styles.checkrow}><input type="checkbox" checked={priceVerified} onChange={e=>setPriceVerified(e.target.checked)}/><span>Marcar el precio como verificado <small>Solo para simular cómo cambia la decisión.</small></span></label>}
     <button className={styles.primary} type="button" onClick={()=>dispatch({type:"observe",event,priceVerified})}><Play size={17}/> Procesar evento ficticio</button>
     <div className={styles.divider}/>
     <div className={styles.sectionHeading}><div><span className={styles.step}>02 · POLÍTICAS</span><h2>Probar permisos</h2></div><ShieldCheck size={21}/></div>
     <label className={styles.label} htmlFor="role-choice">Actuar como</label>
     <select id="role-choice" className={styles.select} value={role} onChange={e=>setRole(e.target.value as LabRole)}>
      <option value="owner">Propietario</option><option value="admin">Administrador</option><option value="seller">Vendedor (sin permisos de aprobación)</option>
     </select>
     <p className={styles.hint}>Los permisos se comprueban en el motor simulado. En producción también los valida la base de datos.</p>
    </section>
    <section className={styles.panel}>
      <div className={styles.sectionHeading}><div><span className={styles.step}>03 · DECISIÓN / EJECUCIÓN</span><h2>Cola de decisiones</h2></div><Workflow size={21}/></div>
      {state.decisions.length===0?<div className={styles.empty}><ClipboardCheck size={37}/><strong>Sin eventos todavía</strong><p>Selecciona un evento y pulsa «Procesar» para generar la primera recomendación.</p></div>:
       <div className={styles.decisions}>
        {state.decisions.map(d=><article className={styles.decision} key={d.id}>
          <div className={styles.decisionTitle}><strong>Decisión #{d.id}</strong><span className={styles[d.status]}>{statusLabels[d.status]}</span></div>
          <p className={styles.reason}>{d.reason}</p>
          <small>Riesgo: {riskLabels[d.risk]} · Acción: <code>{d.action}</code></small>
          {d.status==="proposed"&&<div className={styles.actions}>
            <button onClick={()=>dispatch({type:"review",id:d.id,actor:role,approve:true})}>Aprobar</button>
            <button className={styles.secondary} onClick={()=>dispatch({type:"review",id:d.id,actor:role,approve:false})}>Rechazar</button>
          </div>}
          {d.status==="approved"&&<button className={styles.primary} onClick={()=>dispatch({type:"execute",id:d.id,actor:role})}><Play size={15}/> Ejecutar tarea interna</button>}
          {d.status==="executed"&&<button className={styles.primary} onClick={()=>dispatch({type:"complete",id:d.id,actor:role})}><CheckCheck size={15}/> Marcar tarea terminada</button>}
          {d.status==="observed"&&<p className={styles.success}><CheckCheck size={16}/> Resultado comprobado en la simulación. No equivale a venta ni cobro.</p>}
        </article>)}
       </div>}
      <div className={styles.sectionHeading}><div><span className={styles.step}>04 · AUDITORÍA</span><h2>Registro de acciones</h2></div><Activity size={20}/></div>
      <ul className={styles.audit}>{state.log.length?state.log.map((v,i)=><li key={i}><ChevronRight size={13}/>{v}</li>):<li>Las acciones quedarán registradas aquí.</li>}</ul>
      <button type="button" className={styles.reset} onClick={()=>dispatch({type:"reset"})}><RotateCcw size={16}/> Reiniciar laboratorio</button>
    </section>
   </div>
   <section className={styles.bottom}>
    <button type="button" className={styles.guideToggle} onClick={()=>setShowGuide(v=>!v)} aria-expanded={showGuide}><Smartphone size={17}/> ¿Qué demuestra esta prueba? <ChevronRight className={showGuide?styles.rotated:""} size={17}/></button>
    {showGuide&&<div className={styles.guideContent}>
      <p><strong>Sí demuestra:</strong> comportamiento de las reglas de clasificación, permisos, aprobación, creación idempotente de tareas simuladas y retroalimentación de resultados.</p>
      <p><strong>No demuestra:</strong> conexión real a WhatsApp, inteligencia generativa, datos de clientes, migraciones en producción ni decisiones financieras. La prueba real requerirá una base Supabase aislada y credenciales de laboratorio.</p>
      <p><strong>Seguridad:</strong> ninguna acción de esta página sale al servidor empresarial. Recargar la pantalla reinicia los datos ficticios.</p>
    </div>}
   </section>
   <footer>EMPRESIA · Mobile-first QA · Datos 100 % ficticios · Sin operaciones externas</footer>
  </div>
 </main>;
}

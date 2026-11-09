import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BarChart3, CheckCircle2, ClipboardList, Clock3, Layers3, Mail, ShieldCheck, Target, Workflow } from "lucide-react";
import EmpresiaDemoForm from "./empresia-demo-form";
import styles from "./empresia-landing.module.css";

export const metadata: Metadata = {
  title: "Empresia | Clientes, seguimiento y automatización comercial",
  description: "Organiza tus prospectos, cotizaciones y seguimientos con Empresia. Solicita una evaluación comercial gratuita, sin compromiso.",
  openGraph: {
    title: "Empresia — Convierte consultas en oportunidades comerciales",
    description: "Un solo sistema para clientes, ventas, seguimiento y automatizaciones verificables.",
    type: "website",
  },
};

const benefits = [
  { Icon: ClipboardList, name: "Clientes en un solo lugar", detail: "Conoce quién te contactó, qué necesita y cuál es la próxima acción." },
  { Icon: Target, name: "Oportunidades visibles", detail: "Organiza tus prospectos por etapa, responsable y probabilidad de cierre." },
  { Icon: Workflow, name: "Seguimientos ordenados", detail: "Prepara tareas, recordatorios y automatizaciones según el flujo acordado." },
  { Icon: BarChart3, name: "Resultados claros", detail: "Consulta actividad y propuestas sin confundir consultas, ventas y pagos." },
];
const steps = [
  ["01", "Conocemos tu proceso", "Identificamos cómo llegan los prospectos y dónde se pierden oportunidades."],
  ["02", "Configuramos lo esencial", "Preparamos clientes, seguimiento y tablero según la operación real."],
  ["03", "Medimos y mejoramos", "Revisamos respuestas, cotizaciones, avances y trabajo ahorrado."],
];

export default function EmpresiaPublicPage() {
  return <main className={styles.page}>
    <header className={styles.header}>
      <Link href="/empresia" className={styles.brand} aria-label="Empresia, inicio"><span className={styles.brandMark}>E</span> EMPRESIA<span className={styles.brandDot}>.</span></Link>
      <nav className={styles.nav} aria-label="Navegación principal">
        <a href="#beneficios">Solución</a>
        <a href="#como-funciona">Cómo funciona</a>
        <a href="#oferta">Piloto</a>
        <a href="#evaluacion" className={styles.navAction}>Solicitar evaluación <ArrowRight size={15}/></a>
      </nav>
    </header>

    <section className={styles.hero}>
      <div className={styles.heroCopy}>
        <div className={styles.overline}><span className={styles.dot}/> CRM · AUTOMATIZACIÓN · IA SUPERVISADA</div>
        <h1>Tu negocio recibe consultas. <em>Empresia ayuda a que ninguna quede olvidada.</em></h1>
        <p className={styles.lead}>Organiza clientes, controla oportunidades y da seguimiento a las ventas desde una sola plataforma. Empieza con un sistema comercial claro y activa nuevas capacidades según tus necesidades.</p>
        <div className={styles.heroActions}>
          <a href="#evaluacion" className={styles.primary}>Solicitar evaluación gratuita <ArrowRight size={18}/></a>
          <a href="#como-funciona" className={styles.secondary}>Conocer la solución</a>
        </div>
        <div className={styles.micro}><CheckCircle2 size={16}/> Sin compromiso de compra <span>·</span> Evaluación inicial de 15 minutos <span>·</span> Atención personalizada</div>
      </div>
      <div className={styles.heroVisual} aria-label="Vista conceptual del proceso comercial">
        <div className={styles.glow}/>
        <div className={styles.mockTop}><span className={styles.mockLogo}>E</span><span>Centro comercial</span><span className={styles.mockOnline}>Flujo de ejemplo</span></div>
        <div className={styles.mockMain}>
          <div className={styles.mockKpi}><small>Consulta entrante</small><strong>Nueva oportunidad</strong><span>Registrada para seguimiento</span></div>
          <div className={styles.mockFlow}>
            <div><span className={styles.stepIcon}><Mail size={17}/></span><span><strong>Solicitud recibida</strong><small>Cliente identificado</small></span><CheckCircle2 size={17}/></div>
            <div><span className={styles.stepIcon}><Layers3 size={17}/></span><span><strong>Oportunidad creada</strong><small>Historial centralizado</small></span><CheckCircle2 size={17}/></div>
            <div><span className={styles.stepIcon}><Clock3 size={17}/></span><span><strong>Próxima acción</strong><small>Seguimiento pendiente</small></span><span className={styles.mockPending}>Por atender</span></div>
          </div>
          <p>Representación ilustrativa. No muestra operaciones ni resultados reales de clientes.</p>
        </div>
      </div>
    </section>

    <section className={styles.proofStrip}>
      <span>Para negocios que venden por consultas, cotizaciones y seguimiento</span>
      <div><span>Servicios</span><span>Comercio</span><span>Inmobiliarias</span><span>Clínicas</span><span>Automotriz</span></div>
    </section>

    <section id="beneficios" className={styles.section}>
      <div className={styles.sectionHeading}><span className={styles.eyebrow}>MENOS OPORTUNIDADES OLVIDADAS</span><h2>Un proceso comercial que puedes controlar</h2><p>Empresia no se limita a contestar mensajes: ayuda a ordenar el trabajo posterior a cada consulta.</p></div>
      <div className={styles.benefits}>{benefits.map(({ Icon, name, detail }) => <article className={styles.benefit} key={name}><div className={styles.benefitIcon}><Icon size={23}/></div><h3>{name}</h3><p>{detail}</p></article>)}</div>
    </section>

    <section className={styles.process} id="como-funciona">
      <div className={styles.sectionHeading}><span className={styles.eyebrow}>IMPLEMENTACIÓN CON CONTROL</span><h2>De la primera conversación a una operación medible</h2></div>
      <div className={styles.steps}>{steps.map(([number, title, detail]) => <div key={number} className={styles.processStep}><span>{number}</span><h3>{title}</h3><p>{detail}</p></div>)}</div>
      <div className={styles.safeNote}><ShieldCheck size={20}/><span>Las conexiones con WhatsApp, correo masivo y agentes autónomos requieren activación, permisos y pruebas adicionales. No se ofrecen como funcionalidades operativas sin verificación.</span></div>
    </section>

    <section className={styles.offer} id="oferta">
      <div><span className={styles.eyebrow}>OFERTA PILOTO SUJETA A EVALUACIÓN</span><h2>Empezar pequeño. Medir resultados. Escalar con seguridad.</h2><p>Para negocios que necesitan ordenar sus contactos y oportunidades antes de invertir en automatizaciones más avanzadas.</p></div>
      <div className={styles.offerPanel}>
        <span>Referencia para piloto comercial</span>
        <div className={styles.price}>US$99 <small>/mes</small></div>
        <p>Implementación propuesta desde US$197 según alcance. Precio orientativo, sujeto a confirmación mediante propuesta; no constituye una oferta de compra automática.</p>
        <ul><li><CheckCircle2 size={16}/> Contactos y empresas</li><li><CheckCircle2 size={16}/> Embudo comercial</li><li><CheckCircle2 size={16}/> Seguimiento y tareas</li><li><CheckCircle2 size={16}/> Revisión inicial del proceso</li></ul>
        <a className={styles.primary} href="#evaluacion">Solicitar propuesta <ArrowRight size={18}/></a>
      </div>
    </section>

    <section className={styles.contactSection} id="evaluacion">
      <div className={styles.formIntro}>
        <span className={styles.eyebrow}>TU PRÓXIMO PASO</span>
        <h2>Cuéntanos cómo vendes hoy.</h2>
        <p>Solicita una evaluación inicial gratuita. Analizaremos las consultas que recibes, cómo las registras y qué ocurre después de una cotización.</p>
        <div className={styles.contactSteps}><span><CheckCircle2 size={18}/> Describe tu negocio</span><span><CheckCircle2 size={18}/> Revisamos si Empresia encaja</span><span><CheckCircle2 size={18}/> Te contactamos para coordinar una conversación</span></div>
        <p className={styles.contactSmall}>¿Prefieres escribir directamente? <a href="mailto:angelberigueteads@gmail.com?subject=Evaluaci%C3%B3n%20Empresia">angelberigueteads@gmail.com</a></p>
      </div>
      <div className={styles.formCard}><div className={styles.formCardHead}><h3>Solicitar evaluación</h3><p>Completar este formulario no requiere crear una cuenta.</p></div><EmpresiaDemoForm /></div>
    </section>

    <footer className={styles.footer}><span><strong>EMPRESIA</strong> · Tecnología para organizar y hacer crecer tu negocio.</span><span>Desarrollado por Ángel Berigüete · República Dominicana</span><Link href="/acceso-crm">Acceso a clientes</Link></footer>
  </main>;
}

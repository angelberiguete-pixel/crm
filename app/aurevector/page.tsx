import type { Metadata } from "next";
import LeadForm from "./lead-form";
import styles from "./aurevector.module.css";

export const metadata: Metadata = {
  title: "AUREVECTOR | Revenue Systems para crecer con control",
  description: "Conecta captación, seguimiento, CRM, automatización y medición para convertir más oportunidades sin depender de procesos dispersos."
};

const leaks = [
  "Consultas que llegan por varios canales y nadie centraliza",
  "Seguimientos que dependen de recordar o insistir manualmente",
  "Cotizaciones, citas o leads que se enfrían sin próxima acción",
  "Marketing sin trazabilidad clara hasta venta o ingreso"
];

const outcomes = [
  ["Captura", "Cada oportunidad entra a un sistema único."],
  ["Seguimiento", "Cada lead tiene responsable, etapa y próxima acción."],
  ["Automatización", "Recordatorios, reactivación y tareas reducen fugas."],
  ["Medición", "Pipeline, MRR, conversión y actividad se ven en un mismo lugar."]
];

export default function AurevectorPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <a className={styles.brand} href="#inicio" aria-label="AUREVECTOR inicio">AUREVECTOR</a>
        <nav className={styles.nav} aria-label="Navegación principal">
          <a href="#sistema">Sistema</a>
          <a href="#diagnostico">Diagnóstico</a>
          <a href="/login">Acceso CRM</a>
        </nav>
      </header>

      <section className={styles.hero} id="inicio">
        <div className={styles.heroCopy}>
          <span className={styles.kicker}>Revenue Systems · CRM · Automatización · IA</span>
          <h1>Convierte marketing y ventas dispersos en un sistema de crecimiento conectado y medible.</h1>
          <p className={styles.lead}>AUREVECTOR ayuda a negocios que ya reciben oportunidades, pero pierden ingresos por respuesta tardía, seguimiento manual, leads olvidados y falta de trazabilidad.</p>
          <div className={styles.heroActions}>
            <a className={styles.primary} href="#diagnostico">Solicitar diagnóstico comercial</a>
            <a className={styles.secondary} href="#sistema">Ver cómo funciona</a>
          </div>
          <div className={styles.micro}>Sesión inicial de 20–30 minutos · Sin promesas de resultados · Enfoque en fugas y próximos pasos</div>
        </div>
        <aside className={styles.heroPanel} aria-label="Qué revisamos">
          <span className={styles.panelLabel}>Primero encontramos dónde se pierde dinero</span>
          <ul>{leaks.map((item) => <li key={item}>{item}</li>)}</ul>
        </aside>
      </section>

      <section className={styles.system} id="sistema">
        <div className={styles.sectionHeading}>
          <span className={styles.kicker}>De actividad a sistema</span>
          <h2>No vendemos piezas sueltas como solución final.</h2>
          <p>Diseñamos el recorrido completo desde que aparece una oportunidad hasta que se convierte, se recupera o se descarta con una razón medible.</p>
        </div>
        <div className={styles.grid}>
          {outcomes.map(([title, text], index) => (
            <article className={styles.card} key={title}>
              <span className={styles.cardNumber}>0{index + 1}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.offerBand}>
        <div>
          <span className={styles.kicker}>Oferta de entrada</span>
          <h2>Growth Audit · RD$29,500</h2>
        </div>
        <p>Mapeamos captación → respuesta → seguimiento → oportunidad → venta, identificamos fugas y priorizamos un roadmap de 90 días. Si no hace falta implementar más, el diagnóstico sigue siendo útil por sí solo.</p>
      </section>

      <section className={styles.diagnostic} id="diagnostico">
        <div className={styles.formIntro}>
          <span className={styles.kicker}>Diagnóstico inicial</span>
          <h2>Cuéntanos dónde se está frenando el crecimiento.</h2>
          <p>Usaremos estos datos para revisar si existe una fuga comercial que podamos ayudar a resolver. No se crea una cuenta de CRM ni se activa ningún servicio automáticamente.</p>
          <div className={styles.promise}>
            <strong>Qué ocurre después</strong>
            <span>1. Revisamos el contexto.</span>
            <span>2. Te contactamos para validar encaje.</span>
            <span>3. Si tiene sentido, definimos el siguiente paso.</span>
          </div>
        </div>
        <LeadForm />
      </section>

      <footer className={styles.footer}>
        <strong>AUREVECTOR</strong>
        <span>Revenue systems para empresas que quieren crecer con control.</span>
        <a href="/login">Acceso al CRM</a>
      </footer>
    </main>
  );
}

import LeadForm from "./lead-form";
import AurevectorPricing from "./pricing";
import styles from "./aurevector.module.css";

const outcomes = [
  ["Captura", "Web, WhatsApp y campañas alimentan un mismo sistema."],
  ["Seguimiento", "Cada lead tiene etapa, responsable y próxima acción."],
  ["Automatización", "Recordatorios, recuperación y tareas reducen fugas."],
  ["Medición", "Pipeline, actividad y conversión se revisan con datos."]
];

export default function AurevectorSalesPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <a className={styles.brand} href="#inicio" aria-label="AUREVECTOR inicio">AUREVECTOR</a>
        <nav className={styles.nav} aria-label="Navegación principal">
          <a href="#sistema">Sistema</a>
          <a href="#planes">Planes</a>
          <a href="#diagnostico">Contacto</a>
          <a href="/crm">Acceso CRM</a>
        </nav>
      </header>

      <section className={styles.hero} id="inicio">
        <div className={styles.heroCopy}>
          <span className={styles.kicker}>Agencia + CRM + Automatización + IA</span>
          <h1>No necesitas más herramientas. Necesitas un sistema que convierta.</h1>
          <p className={styles.lead}>AUREVECTOR combina CRM, seguimiento comercial, automatización y servicios de crecimiento para que cada oportunidad tenga responsable, próxima acción y trazabilidad hasta ingreso.</p>
          <div className={styles.heroActions}>
            <a className={styles.primary} href="#planes">Ver planes</a>
            <a className={styles.secondary} href="#diagnostico">Solicitar diagnóstico</a>
          </div>
          <div className={styles.micro}>CRM incluido en todos los planes · Implementación según alcance · Sin activaciones ni cargos automáticos</div>
        </div>
        <aside className={styles.heroPanel} aria-label="Qué incluye el sistema">
          <span className={styles.panelLabel}>Una sola operación para marketing y ventas</span>
          <ul>
            <li>Contactos y empresas centralizados.</li>
            <li>Pipeline y próximas acciones.</li>
            <li>Calendario y seguimiento.</li>
            <li>Reportes de actividad y conversión.</li>
            <li>Más automatización e IA según el plan.</li>
          </ul>
        </aside>
      </section>

      <section className={styles.system} id="sistema">
        <div className={styles.sectionHeading}>
          <span className={styles.kicker}>Revenue System</span>
          <h2>Del lead a la venta, sin perder el hilo.</h2>
          <p>El CRM no se vende como una herramienta aislada: es la infraestructura donde ejecutamos el servicio de agencia y medimos qué ocurre con cada oportunidad.</p>
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

      <AurevectorPricing />

      <section className={styles.offerBand}>
        <div>
          <span className={styles.kicker}>¿No sabes qué plan elegir?</span>
          <h2>Growth Audit · RD$29,500</h2>
        </div>
        <p>Auditamos captación, respuesta, seguimiento, CRM y conversión. Identificamos dónde se pierden oportunidades y definimos qué sistema necesitas antes de invertir en implementación.</p>
      </section>

      <section className={styles.diagnostic} id="diagnostico">
        <div className={styles.formIntro}>
          <span className={styles.kicker}>Siguiente paso</span>
          <h2>Hablemos de tu sistema comercial.</h2>
          <p>Puedes solicitar un plan directamente o empezar por el Growth Audit. Revisaremos encaje, alcance e implementación antes de cualquier activación o cobro.</p>
          <div className={styles.promise}>
            <strong>Qué ocurre después</strong>
            <span>1. Revisamos tu contexto y el plan de interés.</span>
            <span>2. Validamos alcance y prioridades.</span>
            <span>3. Si tiene sentido, definimos implementación y fecha de inicio.</span>
          </div>
        </div>
        <LeadForm />
      </section>

      <footer className={styles.footer}>
        <strong>AUREVECTOR</strong>
        <span>CRM + Growth + Automatización para convertir con control.</span>
        <a href="/crm">Acceso al CRM</a>
      </footer>
    </main>
  );
}

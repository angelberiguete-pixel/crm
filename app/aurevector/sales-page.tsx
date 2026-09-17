import LeadForm from "./lead-form";
import AurevectorPricing from "./pricing";
import styles from "./aurevector.module.css";

const outcomes = [
  ["Captura", "Centraliza oportunidades que llegan desde web, campañas y canales conectados."],
  ["Seguimiento", "Cada oportunidad queda con etapa, responsable y próxima acción."],
  ["Automatización", "Reduce tareas manuales y prepara seguimiento, recuperación y reactivación."],
  ["Medición", "Visualiza pipeline, actividad y conversión para decidir con datos."]
];

export default function AurevectorSalesPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <a className={styles.brand} href="#inicio" aria-label="AUREVECTOR inicio">AUREVECTOR</a>
        <nav className={styles.nav} aria-label="Navegación principal">
          <a href="#sistema">Cómo funciona</a>
          <a href="#planes">Planes</a>
          <a href="#diagnostico">Contacto</a>
          <a href="/crm">Acceso CRM</a>
        </nav>
      </header>

      <section className={styles.hero} id="inicio">
        <div className={styles.heroCopy}>
          <span className={styles.kicker}>CRM + AUTOMATIZACIÓN + IA + GROWTH</span>
          <h1>Convierte más oportunidades sin perseguir leads a mano.</h1>
          <p className={styles.lead}>AUREVECTOR organiza captación, seguimiento y ventas en un mismo sistema. Prueba cómo se configuraría para tu negocio antes de hablar con ventas.</p>
          <div className={styles.heroActions}>
            <a className={styles.primary} href="/aurevector/start">Probar AUREVECTOR</a>
            <a className={styles.secondary} href="#sistema">Ver cómo funciona</a>
          </div>
          <div className={styles.micro}>Vista previa sin pago · No conecta WhatsApp ni activa automatizaciones externas durante la prueba</div>
        </div>
        <aside className={styles.heroPanel} aria-label="Qué prepara AUREVECTOR">
          <span className={styles.panelLabel}>Tu operación comercial, conectada</span>
          <ul>
            <li>Contactos y empresas centralizados.</li>
            <li>Pipeline y próximas acciones.</li>
            <li>Inbox y seguimiento según configuración.</li>
            <li>Automatizaciones y recuperación de oportunidades.</li>
            <li>IA y servicios de crecimiento según plan y activación.</li>
          </ul>
          <a className={styles.primary} href="/aurevector/start">Crear mi vista previa</a>
        </aside>
      </section>

      <section className={styles.system} id="sistema">
        <div className={styles.sectionHeading}>
          <span className={styles.kicker}>DE CONVERSACIÓN A INGRESO</span>
          <h2>Un sistema para saber quién llegó, qué necesita y qué debe ocurrir después.</h2>
          <p>Describe tu negocio y tus objetivos. AUREVECTOR prepara una vista previa del sistema comercial recomendado para que puedas entender el flujo antes de activarlo.</p>
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
        <div className={styles.heroActions}>
          <a className={styles.primary} href="/aurevector/start">Configurar mi sistema</a>
        </div>
      </section>

      <AurevectorPricing />

      <section className={styles.offerBand}>
        <div>
          <span className={styles.kicker}>SERVICIO + TECNOLOGÍA</span>
          <h2>No te entregamos otra herramienta para que la resuelvas solo.</h2>
        </div>
        <p>Según el plan, AUREVECTOR combina plataforma, configuración, automatización y ejecución de crecimiento. Primero entendemos el proceso comercial; después activamos únicamente el alcance acordado.</p>
      </section>

      <section className={styles.diagnostic} id="diagnostico">
        <div className={styles.formIntro}>
          <span className={styles.kicker}>SIGUIENTE PASO</span>
          <h2>Prueba primero. Habla con nosotros cuando quieras activarlo.</h2>
          <p>Puedes generar una vista previa ahora mismo o enviarnos tu contexto para revisar encaje, alcance e implementación.</p>
          <div className={styles.heroActions}><a className={styles.primary} href="/aurevector/start">Probar AUREVECTOR</a></div>
          <div className={styles.promise}>
            <strong>Qué ocurre después</strong>
            <span>1. Entendemos tu negocio y objetivo.</span>
            <span>2. Validamos la configuración y el alcance.</span>
            <span>3. Solo después se activan integraciones, automatizaciones o servicios contratados.</span>
          </div>
        </div>
        <LeadForm />
      </section>

      <footer className={styles.footer}>
        <strong>AUREVECTOR</strong>
        <span>CRM + automatización + IA + growth para convertir con control.</span>
        <a href="/aurevector/start">Probar AUREVECTOR</a>
        <a href="/crm">Acceso al CRM</a>
      </footer>
    </main>
  );
}

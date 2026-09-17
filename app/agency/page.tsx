import Link from "next/link";
import styles from "./agency.module.css";

const stages = [
  ["Nuevos", "Leads entrantes pendientes de calificación"],
  ["Contactar", "Prospectos con próxima acción comercial"],
  ["Conversación", "Oportunidades con respuesta o reunión"],
  ["Propuesta", "Negocios con alcance o propuesta abierta"],
  ["Cierre", "Negociación, ganado o perdido"]
];

export default function AgencyPage() {
  return (
    <main className={styles.page}>
      <aside className={styles.sidebar}>
        <div><strong>AUREVECTOR</strong><span>Agency OS</span></div>
        <nav>
          <a href="#hoy">Inicio</a><a href="#pipeline">Adquisición</a><a href="#clientes">Clientes de agencia</a><a href="#campanas">Campañas</a><a href="#actividad">Actividad</a>
        </nav>
        <Link href="/platform-admin">Administrar plataforma CRM →</Link>
      </aside>
      <section className={styles.workspace}>
        <header className={styles.topbar}><div><span>OPERACIÓN DE AGENCIA</span><h1>Centro de adquisición AUREVECTOR</h1></div><Link href="/aurevector">Ver web pública ↗</Link></header>

        <section id="hoy" className={styles.hero}>
          <div><span className={styles.eyebrow}>HOY</span><h2>Lo que necesita atención para convertir.</h2><p>Este espacio administra la adquisición y los clientes de servicios de AUREVECTOR. Los CRM comprados por clientes se administran aparte desde Platform Admin.</p></div>
          <div className={styles.actions}><a href="#pipeline">Abrir adquisición</a><Link href="/platform-admin">Platform Admin</Link></div>
        </section>

        <section className={styles.metrics} aria-label="Resumen operativo">
          <article><span>Leads nuevos</span><strong>—</strong><small>Conectar fuente real</small></article>
          <article><span>Por contactar</span><strong>—</strong><small>Próximas acciones</small></article>
          <article><span>Propuestas</span><strong>—</strong><small>Abiertas</small></article>
          <article><span>Clientes activos</span><strong>—</strong><small>Servicios de agencia</small></article>
        </section>

        <section id="pipeline" className={styles.section}>
          <div className={styles.sectionHead}><div><span className={styles.eyebrow}>ADQUISICIÓN</span><h2>Pipeline comercial de la agencia</h2></div><span className={styles.status}>Esperando datos reales</span></div>
          <div className={styles.pipeline}>{stages.map(([name, description]) => <article key={name}><strong>{name}</strong><span>{description}</span><b>—</b></article>)}</div>
        </section>

        <section className={styles.twoColumns}>
          <article id="clientes" className={styles.panel}><span className={styles.eyebrow}>CLIENTES DE AGENCIA</span><h3>Servicios activos</h3><p>Incluye clientes de marketing, automatización, growth u otros servicios, aunque no hayan comprado AUREVECTOR CRM.</p><div className={styles.empty}>Todavía no se muestran registros hasta conectar la fuente de datos.</div></article>
          <article id="campanas" className={styles.panel}><span className={styles.eyebrow}>CAPTACIÓN</span><h3>Canales y campañas</h3><p>Web, formularios, outbound y campañas podrán alimentar este centro con fuente y UTM para medir adquisición completa.</p><div className={styles.empty}>Conexión de campañas pendiente.</div></article>
        </section>

        <section id="actividad" className={styles.section}><div className={styles.sectionHead}><div><span className={styles.eyebrow}>PRÓXIMAS ACCIONES</span><h2>Cola operativa</h2></div></div><div className={styles.empty}>Aquí aparecerán seguimientos, reuniones, propuestas y tareas cuando conectemos la capa de datos.</div></section>
      </section>
    </main>
  );
}

import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, CheckCircle2, LockKeyhole, MapPin, MessageCircle, Scale, ShieldCheck, Trees } from "lucide-react";
import { brokerSummary, money, property } from "@/data/cevicos";
import styles from "./cevicos.module.css";

export const metadata = {
  title: "812 tareas en Cevicos | Proyecto 812",
  description: "Ficha comercial digital para una propiedad de aproximadamente 812 tareas en Cevicos, Sánchez Ramírez.",
};

export default function CevicosLandingPage() {
  return (
    <main className={styles.page}>
      <header className={styles.navWrap}>
        <nav className={styles.nav}>
          <Link href="/cevicos" className={styles.brand}>
            <span className={styles.brandMark}>812</span>
            <span>Proyecto Cevicos</span>
          </Link>
          <div className={styles.navActions}>
            <Link href="#informacion" className={styles.textLink}>Información</Link>
            <Link href="/property-sales" className={styles.adminLink}>Sales Command Center</Link>
          </div>
        </nav>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroGlow} />
        <div className={styles.heroGrid}>
          <div className={styles.heroCopy}>
            <div className={styles.kicker}><MapPin size={16} /> Cevicos · Sánchez Ramírez</div>
            <h1>812 tareas para <span>pensar en grande.</span></h1>
            <p className={styles.lead}>Una propiedad de gran escala para compradores que buscan tierra, patrimonio y visión de proyecto en República Dominicana.</p>
            <div className={styles.heroActions}>
              <Link href="#contacto" className={styles.primaryButton}>Solicitar información <ArrowRight size={18} /></Link>
              <Link href="#brokers" className={styles.secondaryButton}>Soy broker / Tengo comprador</Link>
            </div>
            <div className={styles.trustLine}><ShieldCheck size={17} /> Comercialización seria · Información sujeta a verificación documental y técnica</div>
          </div>

          <div className={styles.heroCard}>
            <div className={styles.cardEyebrow}>Resumen de oportunidad</div>
            <div className={styles.bigMetric}>{property.tasks}</div>
            <div className={styles.metricLabel}>tareas aproximadamente</div>
            <div className={styles.priceRow}>
              <div><span>Precio de referencia</span><strong>{money(property.pricePerTask)}</strong><small>por tarea</small></div>
              <div><span>Valor de referencia</span><strong>{money(property.referenceValue)}</strong><small>venta total</small></div>
            </div>
            <div className={styles.cardNote}><LockKeyhole size={16} /> La ubicación exacta y documentación ampliada se facilitan a interesados calificados.</div>
          </div>
        </div>
      </section>

      <section id="informacion" className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.eyebrow}>Una oportunidad de escala</span>
          <h2>No es un solar. Es una decisión de inversión.</h2>
          <p>La magnitud del terreno permite plantear distintos escenarios de uso, siempre sujetos a evaluación técnica, acceso, normativa y documentación final.</p>
        </div>
        <div className={styles.featureGrid}>
          <article className={styles.feature}><Trees /><h3>Gran extensión</h3><p>Aproximadamente 812 tareas concentradas en una sola oportunidad comercial.</p></article>
          <article className={styles.feature}><Scale /><h3>Precio claro</h3><p>RD$80,000 por tarea como referencia inicial, con condiciones conversables para comprador serio.</p></article>
          <article className={styles.feature}><BriefcaseBusiness /><h3>Enfoque de inversión</h3><p>Presentación dirigida a inversionistas, compradores patrimoniales, productores y desarrolladores.</p></article>
        </div>
      </section>

      <section id="brokers" className={styles.darkSection}>
        <div className={styles.darkGrid}>
          <div>
            <span className={styles.eyebrowLight}>Red de comercialización</span>
            <h2>Estamos construyendo una red selecta de brokers.</h2>
            <p>La operación se está organizando con un sistema centralizado para registrar corredores, compradores, visitas y ofertas, evitando duplicidades y pérdida de seguimiento.</p>
          </div>
          <div className={styles.statsGrid}>
            <div><strong>{brokerSummary.total}</strong><span>brokers en base</span></div>
            <div><strong>{brokerSummary.priorityA}</strong><span>prioridad A</span></div>
            <div><strong>{brokerSummary.publicWhatsapp}</strong><span>WhatsApp públicos</span></div>
            <div><strong>{brokerSummary.publicPhone}</strong><span>teléfonos públicos</span></div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.eyebrow}>Proceso</span>
          <h2>Información suficiente para avanzar, sin exponer de más.</h2>
        </div>
        <div className={styles.steps}>
          {[
            ["01", "Contacto inicial", "Comprador o broker manifiesta interés y comparte su perfil de compra."],
            ["02", "Calificación", "Se valida capacidad, intención, plazo y tipo de operación buscada."],
            ["03", "Información ampliada", "Se comparte dossier, ubicación y documentación relevante de forma progresiva."],
            ["04", "Visita y oferta", "Coordinación de visita, presentación de oferta y revisión legal antes de cierre."],
          ].map(([n, title, text]) => <div key={n} className={styles.step}><span>{n}</span><h3>{title}</h3><p>{text}</p></div>)}
        </div>
      </section>

      <section id="contacto" className={styles.ctaSection}>
        <div>
          <span className={styles.eyebrow}>Siguiente paso</span>
          <h2>¿Tienes un comprador o quieres evaluar la oportunidad?</h2>
          <p>Solicita el dossier comercial. El canal directo de WhatsApp se conectará al sistema en la siguiente fase del MVP.</p>
        </div>
        <div className={styles.ctaCard}>
          <CheckCircle2 size={26} />
          <div><strong>Acceso progresivo</strong><span>Teaser → Dossier → Documentación → Visita → Oferta</span></div>
          <MessageCircle size={22} />
        </div>
      </section>

      <footer className={styles.footer}>
        <div>Proyecto 812 · Cevicos, Sánchez Ramírez</div>
        <div>Ficha preliminar · Sujeta a verificación documental, técnica y legal.</div>
      </footer>
    </main>
  );
}

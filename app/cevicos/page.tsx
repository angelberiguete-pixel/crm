import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, LockKeyhole, MapPin, MessageCircle, Scale, ShieldCheck, Trees } from "lucide-react";
import { money, property } from "@/data/cevicos";
import { cevicosContact, cevicosWhatsappUrl } from "@/data/cevicos-contact";
import LeadCapture from "@/components/cevicos/LeadCapture";
import PriceCalculator from "@/components/cevicos/PriceCalculator";
import styles from "./cevicos.module.css";

export const metadata = {
  title: "812 tareas en Cevicos | Proyecto 812",
  description: "Propiedad de aproximadamente 812 tareas en Cevicos, Sánchez Ramírez. Venta completa, atención directa a compradores calificados.",
};

export default function CevicosLandingPage() {
  const whatsappUrl = cevicosWhatsappUrl();

  return <main className={styles.page}>
    <header className={styles.navWrap}>
      <nav className={styles.nav}>
        <Link href="/cevicos" className={styles.brand}><span className={styles.brandMark}>812</span><span>Proyecto Cevicos</span></Link>
        <div className={styles.navActions}>
          <Link href="#informacion" className={styles.textLink}>Información</Link>
          <Link href="#calculator" className={styles.textLink}>Calculadora</Link>
          <a href={whatsappUrl} target="_blank" rel="noreferrer" className={styles.adminLink}>WhatsApp oficial</a>
        </div>
      </nav>
    </header>

    <section className={styles.hero}>
      <div className={styles.heroGlow}/>
      <div className={styles.heroGrid}>
        <div className={styles.heroCopy}>
          <div className={styles.kicker}><MapPin size={16}/> Cevicos · Sánchez Ramírez</div>
          <h1>812 tareas para <span>pensar en grande.</span></h1>
          <p className={styles.lead}>Una propiedad de gran escala para compradores que buscan tierra, patrimonio y visión de proyecto en República Dominicana.</p>
          <div className={styles.heroActions}>
            <Link href="#contacto" className={styles.primaryButton}>Solicitar ficha PDF <ArrowRight size={18}/></Link>
            <a href={whatsappUrl} target="_blank" rel="noreferrer" className={styles.secondaryButton}><MessageCircle size={18}/> Hablar por WhatsApp</a>
          </div>
          <div className={styles.trustLine}><ShieldCheck size={17}/> Atención directa a compradores · WhatsApp oficial: {cevicosContact.whatsappDisplay}</div>
        </div>
        <div className={styles.heroCard}>
          <div className={styles.cardEyebrow}>Oferta principal</div>
          <div className={styles.bigMetric}>{property.tasks}</div>
          <div className={styles.metricLabel}>tareas aproximadamente</div>
          <div className={styles.priceRow}>
            <div><span>Precio de referencia</span><strong>{money(property.pricePerTask)}</strong><small>por tarea</small></div>
            <div><span>Valor de referencia</span><strong>{money(property.referenceValue)}</strong><small>venta completa</small></div>
          </div>
          <div className={styles.cardNote}><LockKeyhole size={16}/> La oferta actual está enfocada en la venta completa. Ubicación exacta y documentación ampliada se facilitan a interesados calificados.</div>
        </div>
      </div>
    </section>

    <section id="informacion" className={styles.section}>
      <div className={styles.sectionHeader}>
        <span className={styles.eyebrow}>Una sola oferta, un proceso claro</span>
        <h2>812 tareas en Cevicos · RD$80,000 por tarea.</h2>
        <p>Condiciones conversables para comprador calificado. No se está promoviendo subdivisión ni venta parcial mientras no exista confirmación legal y técnica que lo permita.</p>
      </div>
      <div className={styles.featureGrid}>
        <article className={styles.feature}><Trees/><h3>Gran extensión</h3><p>Aproximadamente 812 tareas concentradas en una sola oportunidad comercial.</p></article>
        <article className={styles.feature}><Scale/><h3>Precio claro</h3><p>RD$80,000 por tarea como referencia inicial, con condiciones conversables para comprador calificado.</p></article>
        <article className={styles.feature}><BriefcaseBusiness/><h3>Enfoque de inversión</h3><p>Puede resultar de interés para inversionistas, compradores patrimoniales, productores o desarrolladores, sujeto a evaluación de uso.</p></article>
      </div>
    </section>

    <PriceCalculator/>

    <section id="proceso" className={styles.darkSection}>
      <div className={styles.darkGrid}>
        <div>
          <span className={styles.eyebrowLight}>Proceso simplificado</span>
          <h2>Una ruta directa desde el interés hasta el cierre.</h2>
          <p>Anuncio o referencia → solicitud de información → calificación → ficha PDF → visita → oferta → revisión legal → cierre.</p>
        </div>
        <div className={styles.statsGrid}>
          <div><strong>1</strong><span>propiedad</span></div>
          <div><strong>1</strong><span>precio oficial</span></div>
          <div><strong>1</strong><span>WhatsApp oficial</span></div>
          <div><strong>0</strong><span>pagos en la web</span></div>
        </div>
      </div>
    </section>

    <section id="contacto" className={styles.ctaSection}>
      <div>
        <span className={styles.eyebrow}>Siguiente paso</span>
        <h2>Solicita la ficha comercial.</h2>
        <p>Completa tus datos y criterios de calificación. Tu solicitud quedará registrada en nuestro CRM y pasarás a una página de confirmación con acceso inmediato al PDF.</p>
        <a href={whatsappUrl} target="_blank" rel="noreferrer" className={styles.secondaryButton} style={{display:"inline-flex",marginTop:14}}><MessageCircle size={18}/> WhatsApp oficial · {cevicosContact.whatsappDisplay}</a>
        <div className={styles.trustLine} style={{marginTop:16}}><ShieldCheck size={17}/> Este es el único WhatsApp público autorizado para coordinar esta venta. No se aceptan pagos a terceros ni depósitos desde esta web.</div>
      </div>
      <LeadCapture/>
    </section>

    <footer className={styles.footer}>
      <div>Proyecto 812 · Cevicos, Sánchez Ramírez</div>
      <div>WhatsApp oficial: {cevicosContact.whatsappDisplay} · Venta completa · Atención directa · Ficha preliminar sujeta a verificación documental, técnica y legal.</div>
    </footer>
  </main>;
}

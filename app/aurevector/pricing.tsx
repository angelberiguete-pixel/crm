import base from "./aurevector.module.css";
import styles from "./pricing.module.css";

const plans = [
  {
    key: "essential",
    name: "AUREVECTOR Essential",
    price: "US$80",
    setup: "US$250–500",
    description: "Para negocios que necesitan ordenar su proceso comercial y operar con un CRM visible y simple.",
    features: ["CRM personalizado básico", "Empresas, contactos y pipeline", "Calendario y seguimiento", "Reportes básicos", "Revisión mensual", "Soporte"]
  },
  {
    key: "growth",
    name: "AUREVECTOR Growth",
    price: "US$460",
    setup: "US$750–1,500",
    description: "Para empresas que quieren que CRM, captación y seguimiento trabajen como un solo sistema.",
    featured: true,
    features: ["CRM con personalización avanzada", "Inbox, productos y cotizaciones", "Automatizaciones de seguimiento y recuperación", "WhatsApp Automation", "Gestión de Meta Ads*", "Activos de campaña / embudo", "Reporting y soporte prioritario"]
  },
  {
    key: "scale",
    name: "AUREVECTOR Scale",
    price: "US$800",
    setup: "desde US$1,500",
    description: "Para empresas que requieren mayor personalización, automatización, IA e integración con su operación.",
    features: ["CRM avanzado con todos los módulos", "Automatizaciones avanzadas", "IA / agentes", "Meta Ads + Google Ads*", "Web / landing dentro del alcance", "Integración Odoo / ERP cuando aplique", "Desarrollo personalizado acotado", "Reporting ejecutivo y soporte preferente"]
  }
];

export default function AurevectorPricing() {
  return (
    <section className={styles.pricingSection} id="planes">
      <div className={base.sectionHeading}>
        <span className={base.kicker}>Planes AUREVECTOR</span>
        <h2>El CRM está incluido. Tú eliges cuánto quieres que operemos contigo.</h2>
        <p>Los tres planes usan la misma plataforma CRM; cambian el nivel de personalización, automatización y ejecución de agencia.</p>
      </div>
      <div className={styles.plansGrid}>
        {plans.map((plan) => (
          <article className={`${styles.planCard} ${plan.featured ? styles.planFeatured : ""}`} key={plan.key}>
            {plan.featured && <span className={styles.planBadge}>Recomendado para crecimiento</span>}
            <h3>{plan.name}</h3>
            <div className={styles.planPrice}>{plan.price} <span>/ mes</span></div>
            <div className={styles.planSetup}>Setup: {plan.setup}</div>
            <p>{plan.description}</p>
            <ul>{plan.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
            <a className={plan.featured ? base.primary : styles.planButton} href="#diagnostico">Solicitar {plan.name.replace("AUREVECTOR ", "")}</a>
          </article>
        ))}
      </div>
      <p className={styles.pricingNote}>*El presupuesto publicitario y costos de terceros no están incluidos salvo que una propuesta indique lo contrario. Los setups dependen del alcance de implementación.</p>
    </section>
  );
}

import base from "./aurevector.module.css";
import styles from "./pricing.module.css";
import PricingCTA from "./pricing-cta";

const plans=[
 {key:"essential" as const,name:"Essential",price:"80",setup:"US$250–500",summary:"Ordena tu proceso comercial con un CRM claro para tu equipo.",forWhom:"Para comenzar con control",features:["Empresas y contactos","Pipeline comercial y responsables","Calendario y seguimiento","Reportes básicos","Revisión mensual y soporte"]},
 {key:"growth" as const,name:"Growth",price:"460",setup:"US$750–1,500",summary:"Conecta cotizaciones, atención y seguimiento en una operación más organizada.",forWhom:"Para hacer crecer el proceso",featured:true,features:["Todo lo incluido en Essential","Bandeja, productos y cotizaciones","Automatizaciones según activación","Preparación de conexión WhatsApp","Estrategia Meta Ads*","Reportes y soporte prioritario"]},
 {key:"scale" as const,name:"Scale",price:"800",setup:"Desde US$1,500",summary:"Diseñado para operaciones que necesitan mayor adaptación y supervisión.",forWhom:"Para operaciones más complejas",features:["Todo lo incluido en Growth","Flujos y automatizaciones avanzadas","Agentes de IA con control humano","Marketing e integración a medida*","Conexión ERP según alcance","Reporting ejecutivo y soporte preferente"]}
];

export default function AurevectorPricing(){
 return <section className={styles.pricingSection} id="planes">
  <div className={base.sectionHeading}>
   <span className={base.kicker}>PRECIOS CLAROS · DÓLARES ESTADOUNIDENSES</span>
   <h2>Elige el nivel de acompañamiento que tu negocio necesita.</h2>
   <p>Todos los planes parten del mismo CRM. Lo que cambia es la personalización, la automatización y el trabajo de implementación. Sin funciones externas activadas por sorpresa.</p>
  </div>
  <div className={styles.plansGrid}>
   {plans.map(plan=><article className={`${styles.planCard} ${plan.featured?styles.planFeatured:""}`} key={plan.key}>
    {plan.featured&&<div className={styles.ribbon}>Más elegido para crecer · Recomendado</div>}
    <p className={styles.planCategory}>{plan.forWhom}</p>
    <h3>Empresia {plan.name}</h3>
    <div className={styles.planPrice}><small>US$</small>{plan.price}<span>/ mes</span></div>
    <p className={styles.planDescription}>{plan.summary}</p>
    <div className={styles.setup}>Implementación inicial: <strong>{plan.setup}</strong></div>
    <h4>Qué incluye</h4>
    <ul>{plan.features.map(feature=><li key={feature}>{feature}</li>)}</ul>
    <PricingCTA plan={plan.key}/>
   </article>)}
  </div>
  <p className={styles.pricingNote}>*Publicidad, mensajes de Meta, WhatsApp, uso de APIs, herramientas y servicios de terceros se facturan aparte cuando corresponda. Las funciones que requieren permisos o integraciones se ofrecen tras validación técnica y aceptación del alcance. La implementación inicial es independiente de la mensualidad; se cotiza y autoriza antes de cobrar.</p>
 </section>;
}

import Image from "next/image";
import LeadForm from "./lead-form";
import AurevectorPricing from "./pricing";
import styles from "./aurevector.module.css";

const steps = [
 {number:"01",title:"Captura",text:"Organiza consultas y nuevos prospectos procedentes de tus formularios y canales configurados."},
 {number:"02",title:"Organiza",text:"Cada oportunidad tiene responsable, etapa y contexto para no perder el siguiente paso."},
 {number:"03",title:"Cotiza",text:"Prepara propuestas y cotizaciones con revisión humana antes de compartirlas."},
 {number:"04",title:"Da seguimiento",text:"Consulta pendientes, recupera conversaciones y mide el avance de tu proceso comercial."}
];
const capabilities=[
 {icon:"◈",title:"CRM que se entiende",text:"Contactos, empresas, oportunidades y tareas en un solo espacio de trabajo."},
 {icon:"◎",title:"Conversaciones conectadas",text:"Bandeja comercial y asignación por vendedor cuando los canales están configurados."},
 {icon:"▤",title:"Cotizaciones con control",text:"Productos, propuestas y aprobaciones dentro del mismo circuito comercial."},
 {icon:"✳",title:"Automatización e IA supervisada",text:"Flujos configurables y asistencia inteligente con revisión y permisos antes de acciones externas."}
];
const faqs=[
 ["¿Empresia es un CRM o también un ERP?","Empresia reúne CRM y gestión comercial con automatizaciones. Las funciones ERP y las conexiones contables se habilitan según el módulo y el alcance validado; no se presentan como integraciones activas por defecto."],
 ["¿Puedo probar la plataforma sin pagar?","Sí. La vista previa construye una propuesta ilustrativa en tu navegador. No crea una cuenta empresarial, ni conecta WhatsApp, ni activa mensajes o cobros."],
 ["¿Los planes incluyen WhatsApp e Instagram?","Las conexiones de Meta y WhatsApp requieren autorizaciones, verificación técnica y, según el caso, costes externos. Se confirman durante la implementación antes de prometer funciones automáticas."],
 ["¿Cuánto cuesta empezar?","Cada plan muestra su precio mensual. La configuración inicial se cotiza por separado según el alcance y se aprueba antes de cobrar. Las tarifas de anuncios, mensajería o IA externa no están incluidas salvo acuerdo expreso."],
 ["¿Cómo funcionan los pagos con PayPal?","Cuando un plan esté publicado y habilitado, te dirigimos al checkout seguro de Empresia para autorizar en PayPal una suscripción mensual. No se te suscribe sin tu aprobación; podrás consultar tus compras y cancelar renovaciones desde tu cuenta."],
 ["¿Mi información se mezcla con la de otras empresas?","La plataforma está diseñada con espacios separados por empresa y controles de acceso. La conexión de cada canal, los permisos de usuario y los datos reales se verifican en el onboarding."]
];

function DemoIllustration(){
 return <div className={styles.demoWindow} aria-label="Representación ilustrativa del circuito comercial Empresia">
  <div className={styles.demoTopbar}><span className={styles.demoDots} aria-hidden="true"><i/><i/><i/></span><span>EMPRESIA / VISTA DE FLUJO</span><span className={styles.demoLive}>Ejemplo visual</span></div>
  <div className={styles.demoBody}>
   <div className={styles.demoRail}><Image src="/empresia-icon.svg" width={28} height={28} alt="" unoptimized/><span className={styles.demoRailActive}>◧</span><span>▤</span><span>◎</span><span>◫</span></div>
   <div className={styles.demoContent}>
    <div className={styles.demoTitleRow}><div><span className={styles.demoCaption}>Resumen comercial</span><strong>Del primer contacto al seguimiento</strong></div><span className={styles.demoFilter}>Vista de equipo</span></div>
    <div className={styles.demoJourney}>
     <div><small>01 / CAPTURA</small><strong>Nueva consulta</strong><span>Interés registrado</span></div>
     <div><small>02 / ORGANIZA</small><strong>Oportunidad</strong><span>Responsable asignado</span></div>
     <div><small>03 / COTIZA</small><strong>Propuesta</strong><span>Revisión pendiente</span></div>
     <div><small>04 / AVANZA</small><strong>Seguimiento</strong><span>Próxima acción visible</span></div>
    </div>
    <div className={styles.demoBottom}>
     <div className={styles.demoInbox}><div className={styles.demoCaption}>BANDEJA DE TRABAJO</div><div className={styles.demoMessage}><b>Consulta recibida</b><p>Hola, quisiera información sobre el servicio.</p></div><div className={styles.demoReply}><b>Siguiente acción sugerida</b><p>Responder, calificar y preparar cotización.</p></div></div>
     <div className={styles.demoChecklist}><div className={styles.demoCaption}>CONTROL HUMANO</div><div><span>✓</span> Contacto organizado</div><div><span>✓</span> Etapa y responsable</div><div><span>○</span> Revisar propuesta</div><div><span>○</span> Confirmar seguimiento</div></div>
    </div>
   </div>
  </div>
  <div className={styles.demoFoot}>Representación ilustrativa, no datos de clientes ni canales conectados en tiempo real.</div>
 </div>;
}

export default function AurevectorSalesPage(){
 return <main className={styles.page} id="inicio">
   <header className={styles.header}>
    <a className={styles.brand} href="/empresia" aria-label="Empresia, página principal"><Image src="/empresia-logo.svg" alt="Empresia" width={190} height={48} className={styles.brandLogo} priority unoptimized/></a>
    <nav className={styles.nav} aria-label="Navegación principal">
     <a href="#sistema">La solución</a><a href="#funciones">Funciones</a><a href="#planes">Precios</a><a href="#preguntas">Preguntas</a><a href="/acceso-crm" className={styles.loginLink}>Acceso CRM</a>
     <a href="/empresia/start" className={styles.navCTA}>Ver mi vista previa <span aria-hidden="true">↗</span></a>
    </nav>
    <details className={styles.mobileMenu}><summary aria-label="Abrir menú">Menú <span>☰</span></summary><nav aria-label="Menú móvil"><a href="#sistema">La solución</a><a href="#funciones">Funciones</a><a href="#planes">Precios</a><a href="#preguntas">Preguntas</a><a href="/empresia/start">Vista previa gratis</a><a href="/acceso-crm">Acceso CRM</a></nav></details>
   </header>

   <section className={styles.hero}>
    <div className={styles.heroCopy}>
     <span className={styles.kicker}><span className={styles.kickerDot}/> EMPRESIA · PLATAFORMA COMERCIAL</span>
     <h1>De cada conversación, <em>a la próxima venta.</em></h1>
     <p className={styles.lead}>Clientes, conversaciones, oportunidades y cotizaciones en un solo lugar. Organiza tu operación comercial y mantén el control del seguimiento, con automatización e IA según tu configuración.</p>
     <div className={styles.heroActions}><a className={styles.primary} href="/empresia/start">Explorar mi sistema <span aria-hidden="true">↗</span></a><a className={styles.secondary} href="#sistema">Descubrir cómo funciona <span aria-hidden="true">↓</span></a></div>
     <div className={styles.micro}><span>✓ Vista previa gratuita</span><span>✓ Sin tarjeta para explorar</span><span>✓ Implementación acompañada</span></div>
    </div>
    <div className={styles.heroVisual}><DemoIllustration/></div>
   </section>

   <section className={styles.problemBand}><div className={styles.wide}>
    <p>CUANDO TU NEGOCIO CRECE, LAS CONVERSACIONES NO PUEDEN QUEDARSE ATRÁS.</p>
    <div><strong>Menos información dispersa.</strong><strong>Más seguimiento visible.</strong><strong>Decisiones con contexto.</strong></div>
   </div></section>

   <section className={styles.system} id="sistema">
    <div className={styles.sectionHeading}><span className={styles.kicker}>UN PROCESO, NO CUATRO APLICACIONES</span><h2>Haz que cada paso de tu venta tenga un lugar.</h2><p>Desde la primera consulta hasta la propuesta y el seguimiento. Empresia organiza el circuito comercial para que tu equipo sepa qué hacer después.</p></div>
    <div className={styles.steps}>{steps.map(step=><article className={styles.step} key={step.number}><span className={styles.stepNumber}>{step.number}</span><h3>{step.title}</h3><p>{step.text}</p></article>)}</div>
    <div className={styles.sectionAction}><a href="/empresia/start" className={styles.primary}>Diseñar mi flujo comercial <span aria-hidden="true">↗</span></a><span>Sin compromisos ni envíos automáticos al explorar.</span></div>
   </section>

   <section className={styles.featuresSection} id="funciones"><div className={styles.wide}>
    <div className={styles.sectionHeading}><span className={styles.kicker}>EL TRABAJO REAL, EN UN MISMO LUGAR</span><h2>Todo conectado al cliente. Nada perdido entre pantallas.</h2><p>Partimos de funciones comerciales reutilizables. Las conexiones externas y los módulos avanzados se habilitan únicamente después de configurarlos y validarlos.</p></div>
    <div className={styles.featureGrid}>{capabilities.map(c=><article className={styles.featureCard} key={c.title}><span className={styles.featureIcon} aria-hidden="true">{c.icon}</span><h3>{c.title}</h3><p>{c.text}</p></article>)}</div>
    <div className={styles.integrationBar}><div><strong>Una plataforma. Distintos canales, según su activación.</strong><p>WhatsApp · Instagram · Facebook · correo · pagos PayPal · integración ERP progresiva</p></div><span>Conexiones sujetas a permisos y configuración</span></div>
   </div></section>

   <section className={styles.sectors}><div className={styles.wide}>
    <div><span className={styles.kicker}>PENSADO PARA NEGOCIOS QUE ATIENDEN PERSONAS</span><h2>El mismo orden, adaptado a tu forma de vender.</h2></div>
    <div className={styles.sectorGrid}><div><strong>Clínicas y citas</strong><span>Solicitudes, agenda y seguimiento.</span></div><div><strong>Servicios profesionales</strong><span>Oportunidades y propuestas.</span></div><div><strong>Comercio y distribución</strong><span>Productos, cotizaciones y clientes.</span></div><div><strong>Inmobiliarias y agencias</strong><span>Leads, responsables y negociaciones.</span></div></div>
   </div></section>

   <AurevectorPricing/>

   <section className={styles.offerBand}><div className={styles.wide}><div><span className={styles.kicker}>SOFTWARE + ACOMPAÑAMIENTO</span><h2>Una herramienta potente funciona mejor con un proceso claro.</h2></div><p>No vendemos automatización a ciegas. Primero identificamos lo que tu empresa necesita. Luego configuramos tu espacio, acordamos la implementación y verificamos las integraciones antes de activarlas.</p></div></section>

   <section className={styles.faq} id="preguntas"><div className={styles.wide}><div className={styles.sectionHeading}><span className={styles.kicker}>RESPUESTAS SIN LETRA PEQUEÑA</span><h2>Lo importante, antes de empezar.</h2></div><div className={styles.faqList}>{faqs.map(([q,a])=><details key={q}><summary>{q}<span aria-hidden="true">+</span></summary><p>{a}</p></details>)}</div></div></section>

   <section className={styles.diagnostic} id="diagnostico">
    <div className={styles.formIntro}><span className={styles.kicker}>CONOZCAMOS TU NEGOCIO</span><h2>Deja de perder el hilo con tus clientes.</h2><p>Cuéntanos qué proceso quieres mejorar y revisaremos qué configuración de Empresia tiene sentido para tu empresa.</p>
     <div className={styles.heroActions}><a className={styles.primary} href="/empresia/start">Ver mi propuesta gratuita ↗</a></div>
     <div className={styles.promise}><strong>El siguiente paso es sencillo</strong><span><b>01</b> Describe tu operación.</span><span><b>02</b> Revisamos alcance y plan.</span><span><b>03</b> Solo activamos lo acordado.</span></div>
    </div>
    <LeadForm/>
   </section>
   <footer className={styles.footer}><div className={styles.footerBrand}><Image src="/empresia-logo.svg" width={150} height={44} alt="Empresia" unoptimized/><p>CRM, ARM e integración progresiva con ERP, pensados para trabajar con claridad.</p></div><div><strong>Explorar</strong><a href="#funciones">Funciones</a><a href="#planes">Planes</a><a href="/empresia/start">Vista previa</a></div><div><strong>Tu cuenta</strong><a href="/acceso-crm">Acceso CRM</a><a href="/empresia/tienda">Ofertas disponibles</a><a href="/empresia/mis-compras">Mis compras</a></div><span className={styles.footerLegal}>© 2026 Empresia · Soluciones empresariales de Ángel Berigüete</span></footer>
 </main>;
}

"use client";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ArrowUpRight, Check, CheckCircle2, ChevronDown, Clock3, CreditCard, HeartHandshake, Mail, Menu, MessageCircle, PlayCircle, Search, ShieldCheck, Sparkles, Star, WandSparkles, X } from "lucide-react";
import { DEMO_PRODUCTS, LABELS } from "../lib/catalog";

const categories=[["todos","Todos"],["servicio","Servicios"],["digital","Plantillas"],["curso","Cursos"],["membresia","Planes"],["fisico","Regalos"]];
const SUPPORT_EMAIL="angelberigueteads@gmail.com";
const WHATSAPP=(process.env.NEXT_PUBLIC_WHATSAPP_NUMBER||"").replace(/\D/g,"");
const artFallback={digital:"excel",curso:"web",membresia:"contenido",fisico:"catalogo",servicio:"catalogo"};
const popular=["catalogo","reels","web","paypal","contenido","automatizacion"];
const questions=[
 {q:"¿Necesito crear una cuenta?",a:"No. Puedes solicitar o comprar como invitado con tu nombre y un correo de contacto. No te pediremos contraseña."},
 {q:"¿Los precios están en dólares?",a:"Sí. Los precios publicados están en USD y corresponden a los alcances indicados. Los impuestos o cargos externos, si aplican, se informan por separado."},
 {q:"¿Cómo recibo lo que compro?",a:"Los servicios personalizados se coordinan al correo que indiques. Los recursos digitales pagados se habilitan de forma protegida cuando el sistema de cobro y entrega esté activado."},
 {q:"¿Cuánto tarda cada entrega?",a:"Depende del servicio, la complejidad y los materiales proporcionados. Confirmamos el plazo antes de comenzar un encargo."},
 {q:"¿Se garantizan más ventas?",a:"No hay resultados comerciales garantizados. Nuestro trabajo busca mejorar la imagen, claridad y procesos de tu negocio."},
 {q:"¿Ya puedo pagar con PayPal?",a:"El botón de cobro se activa únicamente cuando la integración y las pruebas estén completadas. Mientras tanto, puedes solicitar tu servicio por correo."}
];
function money(cents,currency="USD"){return new Intl.NumberFormat("en-US",{style:"currency",currency,maximumFractionDigits:0}).format((Number(cents)||0)/100);}
function checkoutReady(ready,p){return Boolean(ready&&p?.published&&p?.category!=="membresia"&&p?.category!=="fisico");}
function artFor(p){const key=p.art||({catalogo:"catalogo",web:"web",reels:"reels",paypal:"pagos",video:"reels",contenido:"contenido",automatizacion:"automatizacion",excel:"excel",competencia:"radar"}[p.id])||artFallback[p.category]||"catalogo";return "/art/"+key+".svg";}
function emailHref(p,name,email){let subject=p?"Consulta por "+p.name:"Consulta comercial Ángel Commerce";let body=p?"Hola, me interesa "+p.name+" ("+money(p.price_cents,p.currency)+").\nNombre: "+name+"\nCorreo: "+email+"\nQuisiera conocer disponibilidad y pasos para contratar.":"Hola, quiero conocer los servicios de Ángel Berigüete.";return "mailto:"+SUPPORT_EMAIL+"?subject="+encodeURIComponent(subject)+"&body="+encodeURIComponent(body);}

export default function Home(){
 const [products,setProducts]=useState(DEMO_PRODUCTS);
 const [ready,setReady]=useState(false);
 const [active,setActive]=useState("todos");
 const [search,setSearch]=useState("");
 const [mobile,setMobile]=useState(false);
 const [selected,setSelected]=useState(null);
 const [name,setName]=useState("");
 const [email,setEmail]=useState("");
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState("");
 const [receipt,setReceipt]=useState(null);
 const [downloads,setDownloads]=useState([]);

 useEffect(()=>{
  let live=true;
  fetch("/api/products",{cache:"no-store"}).then(r=>r.json()).then(data=>{
   if(!live)return;
   if(Array.isArray(data.products)&&data.products.length)setProducts(data.products);
   setReady(Boolean(data.ready&&data.mode==="connected"));
  }).catch(()=>{});
  const params=new URLSearchParams(window.location.search);
  const token=params.get("token");
  if(params.get("checkout")==="return"&&token){
   window.history.replaceState(null,"",window.location.pathname);
   setBusy(true);
   fetch("/api/checkout/capture",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({paypal_order_id:token})})
    .then(async r=>{let json=await r.json();if(!r.ok)throw Error(json.error||"No se pudo confirmar el pago.");setReceipt({paypal_order_id:token,status:json.status});if(json.status==="paid"){const lib=await fetch("/api/guest-library?paypal_order_id="+encodeURIComponent(token),{credentials:"same-origin",cache:"no-store"});if(lib.ok){const data=await lib.json();setDownloads(data.items||[]);}}})
    .catch(e=>setNotice(e.message))
    .finally(()=>setBusy(false));
  }else if(params.get("checkout")==="cancel"){
   window.history.replaceState(null,"",window.location.pathname);
   setNotice("Pago cancelado. Puedes volver a elegir un servicio.");
  }
  return()=>{live=false;};
 },[]);
 const displayed=useMemo(()=>products.filter(p=>(active==="todos"||p.category===active)&&((p.name||"")+" "+(p.description||"")).toLowerCase().includes(search.toLowerCase())),[products,active,search]);
 const featured=useMemo(()=>popular.map(k=>products.find(p=>p.id===k||p.slug===({"catalogo":"catalogo-comercial","reels":"edicion-reels","web":"landing-page","paypal":"configuracion-paypal","contenido":"contenido-mensual","automatizacion":"automatizacion-formularios"}[k]))).filter(Boolean),[products]);
 function goToCatalog(){setMobile(false);document.getElementById("servicios")?.scrollIntoView({behavior:"smooth"});}
 function whatsapp(p){if(!WHATSAPP){setNotice("WhatsApp estará disponible cuando se configure el número comercial. Puedes escribirnos por correo desde el formulario.");return;}
  const msg="Hola, me interesan los servicios digitales de Ángel Berigüete"+(p?": "+p.name:"")+". ¿Podemos conversar?";
  window.open("https://wa.me/"+WHATSAPP+"?text="+encodeURIComponent(msg),"_blank","noopener,noreferrer");
 }
 async function buy(e){
  e.preventDefault();
  if(!selected)return;
  if(!checkoutReady(ready,selected)){window.location.href=emailHref(selected,name.trim(),email.trim());setSelected(null);return;}
  setBusy(true);setNotice("");
  try{
   const response=await fetch("/api/checkout",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({product_id:selected.id,buyer_name:name.trim(),buyer_email:email.trim()})});
   const result=await response.json();
   if(!response.ok||!result.approve_url)throw Error(result.error||"No se pudo iniciar el pago.");
   window.location.assign(result.approve_url);
  }catch(error){setNotice(error.message);setBusy(false);}
 }
 return <div className="site">
  <header className="header"><div className="container nav">
   <a className="brand" href="#inicio" aria-label="Ángel Berigüete - ir al inicio"><span className="brand-mark">a<span>.</span></span><span className="brand-copy"><strong>ÁNGEL BERIGÜETE</strong><small>ESTUDIO DIGITAL</small></span></a>
   <nav className={"nav-links "+(mobile?"is-open":"")} aria-label="Menú principal">
    <a href="#servicios" onClick={()=>setMobile(false)}>Servicios</a><a href="#transformacion" onClick={()=>setMobile(false)}>Tu transformación</a><a href="#proceso" onClick={()=>setMobile(false)}>Cómo funciona</a><a href="#preguntas" onClick={()=>setMobile(false)}>Preguntas</a>
   </nav>
   <div className="nav-actions"><a href="#servicios" className="nav-cta">Ver soluciones <ArrowUpRight size={16}/></a><button className="nav-toggle" aria-label={mobile?"Cerrar menú":"Abrir menú"} aria-expanded={mobile} onClick={()=>setMobile(v=>!v)}>{mobile?<X size={23}/>:<Menu size={23}/>}</button></div>
  </div></header>
  <main>
   <section className="hero" id="inicio"><div className="container hero-grid">
    <div className="hero-copy"><div className="eyebrow"><span className="eyebrow-spark">✳</span> IDEAS REALES · PRECIOS LATAM</div>
     <h1>Impulsa tu negocio con soluciones digitales <em>que sí venden<span>.</span></em></h1>
     <p className="hero-intro">Diseño, catálogos, páginas web, automatizaciones, contenido y recursos para ayudarte a <strong>verte mejor, comunicar tu valor y trabajar más rápido.</strong></p>
     <div className="hero-ctas"><button type="button" className="btn btn-dark" onClick={goToCatalog}>Ver servicios <ArrowUpRight size={19}/></button><button className="btn btn-light" type="button" onClick={goToCatalog}>Pagar con PayPal <CreditCard size={18}/></button></div>
     <div className="hero-whats"><button type="button" className="text-cta" onClick={()=>whatsapp(null)}><MessageCircle size={18}/> Hablar por WhatsApp <ArrowUpRight size={16}/></button><span>Compra sin registrarte</span></div>
     <div className="hero-avatars"><span className="hero-mini">AB</span><span className="hero-mini soft">✦</span><div><strong>Soluciones con atención personalizada</strong><small>Para emprendedores y pequeñas empresas</small></div></div>
    </div>
    <div className="hero-visual"><div className="hero-visual-frame"><img src="/art/hero.svg" width="1100" height="900" alt="Ilustración de un negocio digital con computadora, catálogo y pagos" fetchPriority="high"/></div><div className="float-chip chip-one"><span className="chip-icon">✦</span><div><b>Tu negocio, mejor presentado</b><small>Imagen que transmite confianza</small></div></div><div className="float-chip chip-two"><span className="chip-check"><Check size={18}/></span><div><b>Desde US$15</b><small>Para presupuestos LATAM</small></div></div></div>
   </div></section>
   <div className="ticker"><div className="container ticker-inner"><span>DISEÑO QUE CONECTA</span><i>✳</i><span>CREATIVIDAD CON PROPÓSITO</span><i>✳</i><span>TECNOLOGÍA SIN COMPLICACIONES</span><i>✳</i><span>PRECIOS PARA LATAM</span></div></div>
   <section className="benefits container" aria-label="Nuestros beneficios"><div className="benefit"><span className="benefit-icon"><HeartHandshake size={23}/></span><div><strong>Hecho para emprendedores</strong><p>Servicios claros para negocios de todos los tamaños.</p></div></div><div className="benefit"><span className="benefit-icon"><Sparkles size={23}/></span><div><strong>Precios que se adaptan</strong><p>Empieza con soluciones desde US$15.</p></div></div><div className="benefit"><span className="benefit-icon"><ShieldCheck size={23}/></span><div><strong>Sin registro de compradores</strong><p>Solicita con tu nombre y correo, sin contraseñas.</p></div></div><div className="benefit"><span className="benefit-icon"><Clock3 size={23}/></span><div><strong>Atención personalizada</strong><p>Definimos alcance y plazo antes de comenzar.</p></div></div></section>
   <section className="featured-section"><div className="container"><div className="section-label"><span>01 — EMPIEZA AQUÍ</span><span className="label-line"/></div><div className="section-heading"><div><h2>Tu próxima gran idea <span>empieza aquí.</span></h2><p>Servicios destacados para mostrar el mejor lado de tu marca y conectar con más oportunidades.</p></div><button className="link-arrow" onClick={goToCatalog}>Explorar el catálogo <ArrowUpRight size={19}/></button></div>
    <div className="featured-grid">{featured.slice(0,3).map((p,i)=><article className="featured-card" key={p.id}><div className="featured-cover"><img loading="lazy" src={artFor(p)} alt={"Ilustración de "+p.name}/><span className="feature-number">0{i+1}</span></div><div className="featured-copy"><span className="product-kicker">{LABELS[p.category]||"Servicio"} · SOLUCIÓN DESTACADA</span><h3>{p.name}</h3><p>{p.tagline||p.description}</p><div className="featured-bottom"><div><small>Desde</small><strong>{money(p.price_cents,p.currency)}</strong></div><button aria-label={"Me interesa "+p.name} onClick={()=>setSelected(p)} className="round-arrow"><ArrowUpRight size={23}/></button></div></div></article>)}</div>
   </div></section>
   <section className="catalog-section container" id="servicios"><div className="section-label"><span>02 — TODOS LOS SERVICIOS</span><span className="label-line"/></div><div className="section-heading"><div><h2>Servicios creados para <span>hacerte avanzar.</span></h2><p>Elige lo que necesitas hoy. Cada servicio incluye un alcance definido para que sepas qué estás contratando.</p></div><div className="results-count">{displayed.length} opciones</div></div>
    <div className="catalog-controls"><div className="filter-tabs">{categories.map(([id,label])=><button type="button" key={id} aria-pressed={active===id} className={active===id?"active":""} onClick={()=>setActive(id)}>{label}</button>)}</div><label className="catalog-search"><Search size={17}/><input aria-label="Buscar servicios" placeholder="¿Qué necesitas?" value={search} onChange={e=>setSearch(e.target.value)}/></label></div>
    <div className="catalog-grid">{displayed.map(p=><article className="offer-card" key={p.id}><div className="offer-visual"><img src={artFor(p)} loading="lazy" alt={"Vista creativa de "+p.name}/><span className="offer-label">{LABELS[p.category]||"Servicio"}</span></div><div className="offer-body"><h3>{p.name}</h3><p>{p.description}</p><div className="offer-detail"><CheckCircle2 size={15}/> {p.delivery||p.delivery_note||"Alcance por confirmar"}</div><div className="offer-bottom"><div className="offer-price"><small>{p.category==="membresia"?"Precio mensual":"Precio de lanzamiento"}</small><strong>{money(p.price_cents,p.currency)}{p.category==="membresia"?<span>/mes</span>:null}</strong></div><button className="offer-cta" type="button" onClick={()=>setSelected(p)}>Lo quiero <ArrowUpRight size={16}/></button></div></div></article>)}{displayed.length===0&&<div className="nothing">No encontramos ese servicio. Prueba otra palabra o categoría.</div>}</div>
    <p className="price-disclaimer">Precios base en dólares estadounidenses para los alcances indicados. Algunas ofertas son ejemplos de lanzamiento; la disponibilidad, condiciones e impuestos se confirman antes de contratar.</p>
   </section>
   <section className="transform" id="transformacion"><div className="container transform-grid"><div className="transform-title"><div className="section-label on-dark"><span>03 — TU NEGOCIO, MEJOR PRESENTADO</span></div><h2>No necesitas hacerlo todo.<br/><span>Necesitas hacerlo mejor.</span></h2><p>Cuando tu catálogo, contenido y presencia online cuentan la misma historia, tus clientes entienden más rápido qué ofreces y cómo contactarte.</p><a className="btn btn-lime" href="#servicios">Encontrar mi solución <ArrowUpRight size={18}/></a></div><div className="before-after"><div className="comparison before"><span className="comparison-badge">ANTES</span><h3>Todo disperso</h3><div className="chaos-lines"><span/><span/><span/><span/></div><ul><li>Productos difíciles de mostrar</li><li>Imagen poco consistente</li><li>Consultas sin un camino claro</li></ul></div><div className="comparison after"><span className="comparison-badge">DESPUÉS</span><h3>Una marca más clara</h3><div className="order-preview"><span className="preview-logo">a.</span><span className="preview-bars"><i/><i/></span><span className="preview-button"><ArrowUpRight size={18}/></span></div><ul><li>Catálogo organizado</li><li>Contenido coherente</li><li>Llamadas a la acción visibles</li></ul></div></div></div></section>
   <section className="process container" id="proceso"><div className="section-label"><span>04 — ASÍ DE SENCILLO</span><span className="label-line"/></div><div className="section-heading"><div><h2>De tu idea a <span>algo concreto.</span></h2><p>Un proceso directo, sin formularios interminables ni cuentas obligatorias.</p></div></div><div className="process-grid">{[{n:"01",title:"Elige tu servicio",text:"Encuentra una solución que encaje con tu necesidad."},{n:"02",title:"Cuéntanos lo esencial",text:"Comparte tu nombre, correo y los datos de tu solicitud."},{n:"03",title:"Coordina y paga",text:"Confirmamos el alcance y el medio de pago disponible."},{n:"04",title:"Recibe tu entrega",text:"Te comunicamos el plazo y acordamos la entrega."}].map((step,i)=><div className="process-step" key={step.n}><span className="step-number">{step.n}</span><h3>{step.title}</h3><p>{step.text}</p>{i<3?<ArrowRight className="process-arrow" size={19}/>:null}</div>)}</div></section>
   <section className="trust-section"><div className="container trust-grid"><div className="trust-visual"><img src="/art/contenido.svg" loading="lazy" alt="Calendario visual y contenido digital organizado"/></div><div className="trust-copy"><span className="overline">SIN PROMESAS VACÍAS</span><h2>Que tu inversión se convierta en <em>trabajo bien hecho.</em></h2><p>Conoce exactamente qué incluye tu servicio, quién te atiende y cómo avanzará tu pedido. El objetivo es entregar soluciones útiles y una experiencia clara.</p><div className="trust-points"><span><Check size={17}/> Alcances definidos</span><span><Check size={17}/> Comunicación directa</span><span><Check size={17}/> Sin registro obligatorio</span></div><button className="btn btn-dark" type="button" onClick={goToCatalog}>Ver mis opciones <ArrowUpRight size={17}/></button></div></div></section>
   <section className="faq container" id="preguntas"><div className="section-label"><span>05 — PREGUNTAS FRECUENTES</span><span className="label-line"/></div><div className="faq-grid"><div><h2>¿Tienes dudas?<br/><span>Aquí empezamos.</span></h2><p>Queremos que entiendas cómo funciona el servicio antes de dar el siguiente paso.</p></div><div className="faq-list">{questions.map((item,i)=><details key={i}><summary>{item.q}<ChevronDown size={18}/></summary><p>{item.a}</p></details>)}</div></div></section>
   <section className="end-cta"><div className="container end-cta-inner"><span className="eyebrow dark">TU SIGUIENTE PASO EMPIEZA HOY</span><h2>Tu negocio merece verse tan bien como lo que ofreces.</h2><p>Empieza con una solución práctica y asequible para tu próximo objetivo.</p><div className="end-actions"><button className="btn btn-dark" onClick={goToCatalog}>Quiero empezar hoy <ArrowUpRight size={19}/></button><a className="btn btn-outline" href={emailHref(null,"","")}>Cuéntame tu idea <Mail size={18}/></a></div></div></section>
  </main>
  <footer className="footer"><div className="container footer-grid"><div><a className="brand footer-brand" href="#inicio"><span className="brand-mark">a<span>.</span></span><span className="brand-copy"><strong>ÁNGEL BERIGÜETE</strong><small>ESTUDIO DIGITAL</small></span></a><p>Diseño, contenido, tecnología y soluciones digitales para Latinoamérica.</p></div><div><strong>Explora</strong><a href="#servicios">Servicios</a><a href="#transformacion">Nuestra propuesta</a><a href="#preguntas">Preguntas frecuentes</a></div><div><strong>Hablemos</strong><a href={emailHref(null,"","")}>{SUPPORT_EMAIL}</a><button className="footer-whatsapp" type="button" onClick={()=>whatsapp(null)}><MessageCircle size={16}/> WhatsApp</button></div></div><div className="container legal"><span>© 2026 Ángel Berigüete · Todos los derechos reservados.</span><span>Ofertas sujetas a disponibilidad. No se garantizan resultados comerciales.</span></div></footer>
  {selected&&<div className="modal-backdrop" onClick={()=>!busy&&setSelected(null)}><div className="purchase-dialog" role="dialog" aria-modal="true" aria-label={"Solicitar "+selected.name} onClick={e=>e.stopPropagation()}><button type="button" aria-label="Cerrar" className="close" onClick={()=>setSelected(null)}><X size={20}/></button><span className="overline">TU SIGUIENTE PASO</span><h2>{selected.name}</h2><p>{selected.description}</p><div className="modal-price"><span>{selected.category==="membresia"?"Desde, al mes":"Desde"}</span><strong>{money(selected.price_cents,selected.currency)}</strong></div><form onSubmit={buy}><label>Tu nombre completo<input value={name} onChange={e=>setName(e.target.value)} required minLength={3} maxLength={120} placeholder="¿Cómo te llamas?"/></label><label>Tu correo electrónico<input value={email} onChange={e=>setEmail(e.target.value)} type="email" required maxLength={254} placeholder="Donde recibirás la información"/></label><div className="privacy-note"><ShieldCheck size={17}/><span>Sin registro ni contraseña. Usaremos tus datos solo para gestionar esta solicitud.</span></div><button type="submit" disabled={busy} className="btn btn-dark modal-submit">{busy?"Procesando...":checkoutReady(ready,selected)?"Pagar con PayPal":"Solicitar este servicio"} <ArrowUpRight size={17}/></button><small className="modal-hint">{checkoutReady(ready,selected)?"PayPal procesará el pago de forma segura.":"El pago online se está habilitando; esta solicitud abre tu correo para coordinar."}</small></form></div></div>}
  {receipt&&<div className="modal-backdrop"><div className="purchase-dialog" role="dialog" aria-modal="true" aria-label="Resultado del pago"><span className="overline">ACTUALIZACIÓN DE TU PEDIDO</span><h2>{receipt.status==="paid"?"Pago confirmado":"Pendiente de confirmación"}</h2><p>Conserva tu comprobante de PayPal. No necesitas crear ninguna cuenta para consultar este pedido.</p><small>Referencia: {receipt.paypal_order_id}</small>{downloads.map((item,i)=><div key={i} className="download-list"><strong>{item.name}</strong>{item.download_url&&<a href={item.download_url} target="_blank" rel="noreferrer">Abrir recurso <ArrowUpRight size={16}/></a>}{(item.lessons||[]).map(l=><a key={l.id} href={l.url||"#"} target="_blank" rel="noreferrer">{l.title}</a>)}</div>)}<button className="btn btn-dark modal-submit" onClick={()=>setReceipt(null)}>Volver al catálogo</button></div></div>}
  {notice&&<div className="toast" role="status"><span>{notice}</span><button type="button" onClick={()=>setNotice("")} aria-label="Cerrar aviso"><X size={17}/></button></div>}
  {busy&&<div className="working" role="status"><span className="spinner"/> Procesando...</div>}
 </div>;
}

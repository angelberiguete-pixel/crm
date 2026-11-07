"use client";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ArrowUpRight, BadgeCheck, Check, ChevronDown, CreditCard, Download, Globe2, HeartHandshake, Mail, Menu, MessageCircle, Search, ShieldCheck, ShoppingBag, Sparkles, WandSparkles, X } from "lucide-react";
import { DEMO_PRODUCTS, LABELS } from "../lib/catalog";

const SUPPORT_EMAIL="angelberigueteads@gmail.com";
const WHATSAPP=(process.env.NEXT_PUBLIC_WHATSAPP_NUMBER||"").replace(/\D/g,"");
const CATEGORIES=[["todos","Todo"],["servicio","Servicios"],["digital","Descargables"],["curso","Cursos"],["membresia","Planes"]];
const HERO_PRODUCTS=["cv-pro","plantilla-presupuesto","web"];
const FALLBACK_ART={servicio:"catalogo",digital:"excel",curso:"web",membresia:"contenido",fisico:"catalogo"};
const SLUG_ART={"cv-profesional":"cv","impulso-laboral":"cv","limpieza-excel":"excel","catalogo-comercial":"catalogo","investigacion-competencia":"radar","configuracion-paypal":"pagos","video-publicitario":"reels","anuncios-estacionales":"contenido","edicion-reels":"reels","landing-page":"web","catalogo-ecommerce":"catalogo","automatizacion-formularios":"automatizacion","contenido-mensual":"contenido","plantilla-presupuesto":"excel","kit-whatsapp":"pagos","ideas-contenido":"contenido","curso-ventas":"web"};
const FAQ=[
 {q:"¿Puedo comprar desde cualquier país?",a:"Nuestra oferta es digital y está pensada para Latinoamérica. Los pagos, impuestos y métodos disponibles dependen de cada país y de la disponibilidad de PayPal."},
 {q:"¿El currículum cuesta US$4.90?",a:"Sí, ese es el precio de referencia del CV Express de una página con un ajuste. El acompañamiento para postulaciones es otro servicio, con mayor alcance y sin garantía de entrevistas ni contratación."},
 {q:"¿Debo crear una cuenta?",a:"No. Puedes consultar como invitado. Cuando el pago y la entrega digital estén habilitados, solo solicitaremos los datos necesarios para gestionar el pedido."},
 {q:"¿Los recursos digitales se descargan al instante?",a:"Solo los productos publicados con sus archivos completos tendrán acceso digital tras verificar el pago. Los que aparecen en preparación todavía no pueden comprarse."},
 {q:"¿Cómo pago?",a:"Estamos preparando la integración segura con PayPal. Hasta finalizar las pruebas, los botones del catálogo sirven para solicitar información, no para procesar un cobro."},
 {q:"¿En qué moneda están los precios?",a:"Los importes de referencia se muestran en dólares estadounidenses (USD). Tu método de pago puede aplicar conversión de moneda u otros cargos."}
];
function money(cents,currency="USD"){
 const amount=(Number(cents)||0)/100;
 const fractions=Number(cents)%100===0?0:2;
 return new Intl.NumberFormat("en-US",{style:"currency",currency,minimumFractionDigits:fractions,maximumFractionDigits:2}).format(amount);
}
function artFor(p){return "/art/"+(p.art||SLUG_ART[p.slug]||FALLBACK_ART[p.category]||"catalogo")+".svg";}
function checkoutReady(ready,p){return Boolean(ready&&p?.published&&p?.category!=="membresia"&&p?.category!=="fisico");}
function isPrepared(p){return !p.published&&(p.category==="digital"||p.category==="curso");}
function emailHref(p,name="",email=""){
 const subject=p?"Consulta: "+p.name:"Consulta sobre Ángel Berigüete Commerce";
 const body=p?"Hola, me interesa "+p.name+" ("+money(p.price_cents,p.currency)+").\nNombre: "+name+"\nCorreo: "+email+"\n¿Podemos confirmar disponibilidad, alcance y entrega?":"Hola, quisiera conocer sus soluciones digitales.";
 return "mailto:"+SUPPORT_EMAIL+"?subject="+encodeURIComponent(subject)+"&body="+encodeURIComponent(body);
}
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
    .then(async r=>{
     const json=await r.json();
     if(!r.ok)throw Error(json.error||"No se pudo confirmar el pago.");
     setReceipt({paypal_order_id:token,status:json.status});
     if(json.status==="paid"){
      const lib=await fetch("/api/guest-library?paypal_order_id="+encodeURIComponent(token),{credentials:"same-origin",cache:"no-store"});
      if(lib.ok){const data=await lib.json();setDownloads(data.items||[]);}
     }
    }).catch(e=>setNotice(e.message)).finally(()=>setBusy(false));
  }else if(params.get("checkout")==="cancel"){
   window.history.replaceState(null,"",window.location.pathname);
   setNotice("Pago cancelado. Puedes volver a explorar el catálogo.");
  }
  return()=>{live=false;};
 },[]);

 const displayed=useMemo(()=>products.filter(p=>(active==="todos"||p.category===active)&&((p.name||"")+" "+(p.description||"")).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())),[products,active,search]);
 const featured=useMemo(()=>HERO_PRODUCTS.map(k=>products.find(p=>p.id===k||p.slug===({"cv-pro":"cv-profesional","plantilla-presupuesto":"plantilla-presupuesto","web":"landing-page"}[k]))).filter(Boolean),[products]);
 const stats=useMemo(()=>({digital:products.filter(p=>p.category==="digital").length,services:products.filter(p=>p.category==="servicio").length}),[products]);
 const goToCatalog=()=>{setMobile(false);document.getElementById("catalogo")?.scrollIntoView({behavior:"smooth"});};
 function whatsapp(p){
  if(!WHATSAPP){setNotice("Nuestro WhatsApp todavía no está configurado. Puedes escribirnos por correo.");return;}
  const msg="Hola, quiero conocer Ángel Berigüete Commerce"+(p?" y el servicio "+p.name:"")+".";
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
 const buyLabel=(p)=>checkoutReady(ready,p)?"Comprar ahora":isPrepared(p)?"Consultar lanzamiento":"Me interesa";

 return <div className="site" id="inicio">
  <div className="announce"><div className="container announce-inner"><span><Sparkles size={14}/> Precios pensados para Latinoamérica</span><a href="#catalogo">Descubre recursos desde US$2.90 <ArrowRight size={14}/></a></div></div>
  <header className="header"><div className="container nav">
   <a className="brand" href="#inicio" aria-label="Ángel Berigüete Commerce, ir al inicio"><span className="brand-mark">ab<span>✦</span></span><span className="brand-copy"><strong>Ángel Berigüete</strong><small>COMMERCE</small></span></a>
   <nav className={"nav-links "+(mobile?"is-open":"")} aria-label="Navegación principal">
    <a href="#catalogo" onClick={()=>setMobile(false)}>Explorar</a><a href="#colecciones" onClick={()=>setMobile(false)}>Colecciones</a><a href="#como-funciona" onClick={()=>setMobile(false)}>Cómo funciona</a><a href="#preguntas" onClick={()=>setMobile(false)}>Ayuda</a>
   </nav>
   <div className="nav-actions"><span className="currency-chip"><Globe2 size={15}/> LATAM · USD</span><button className="nav-cta" type="button" onClick={goToCatalog}>Ver catálogo <ArrowUpRight size={16}/></button><button type="button" className="nav-toggle" aria-label={mobile?"Cerrar menú":"Abrir menú"} aria-expanded={mobile} onClick={()=>setMobile(v=>!v)}>{mobile?<X size={22}/>:<Menu size={22}/>}</button></div>
  </div></header>
  <main>
   <section className="hero"><div className="container hero-grid">
    <div className="hero-copy">
     <span className="eyebrow"><span className="eyebrow-dot"/> TU NUEVO ESPACIO DIGITAL</span>
     <h1>Ideas grandes. <em>Precios pequeños.</em> Posibilidades reales.</h1>
     <p className="hero-intro">Recursos digitales, servicios creativos y herramientas prácticas para estudiar, emprender, trabajar y vender mejor. Hecho para quienes quieren avanzar sin gastar de más.</p>
     <div className="hero-ctas"><button type="button" className="btn btn-dark" onClick={goToCatalog}>Explorar catálogo <ArrowUpRight size={18}/></button><a className="btn btn-soft" href="#como-funciona">Así funciona <ArrowRight size={17}/></a></div>
     <div className="hero-perks"><span><Check size={14}/> Precios en USD</span><span><Check size={14}/> Sin registro ni contraseña</span></div>
     <div className="hero-micro"><span className="micro-symbol">✳</span><div><strong>CV Express desde US$4.90</strong><small>Y recursos digitales a precios accesibles.</small></div></div>
    </div>
    <div className="hero-visual" aria-label="Vista ilustrada de la colección digital">
     <div className="hero-orbit orbit-one"/><div className="hero-orbit orbit-two"/>
     <div className="hero-visual-frame"><img src="/art/hero-commerce.svg" width="920" height="870" alt="Composición ilustrada de una tienda digital con catálogo, currículum y recursos" fetchPriority="high"/></div>
     <div className="float-chip chip-one"><span className="chip-emoji">✦</span><div><strong>Diseño que inspira</strong><small>Recursos útiles, sin complicaciones</small></div></div>
     <div className="float-chip chip-two"><span className="chip-heart">♥</span><div><strong>US$4.90</strong><small>CV Express</small></div></div>
    </div>
   </div></section>

   <section className="promise-strip"><div className="container promise-grid">
    <div><span className="promise-icon purple"><ShoppingBag size={22}/></span><span><strong>Servicios a tu medida</strong><small>Desde tareas rápidas hasta proyectos completos</small></span></div>
    <div><span className="promise-icon peach"><Download size={22}/></span><span><strong>Recursos digitales</strong><small>Plantillas y guías fáciles de usar</small></span></div>
    <div><span className="promise-icon mint"><Globe2 size={22}/></span><span><strong>Pensado para LATAM</strong><small>Ofertas claras y precios en dólares</small></span></div>
   </div></section>

   <section className="collections section-space" id="colecciones"><div className="container">
    <div className="section-top"><div><span className="overline">ENCUENTRA TU PRÓXIMO PASO</span><h2>Un pequeño impulso <em>puede cambiarlo todo.</em></h2></div><p>Ideas prácticas para distintos momentos de tu vida y tu negocio. Sin precios complicados ni promesas vacías.</p></div>
    <div className="collection-grid">
     <button className="collection-card collection-career" onClick={()=>{setActive("servicio");setSearch("CV");goToCatalog();}} type="button"><span className="collection-index">01 / PARA TU CARRERA</span><div className="collection-icon">✷</div><h3>Preséntate mejor.</h3><p>Currículums, cartas y orientación para tus postulaciones.</p><span className="collection-more">CV desde US$4.90 <ArrowUpRight size={17}/></span></button>
     <button className="collection-card collection-ideas" onClick={()=>{setActive("digital");setSearch("");goToCatalog();}} type="button"><span className="collection-index">02 / RECURSOS DESCARGABLES</span><div className="collection-icon">✦</div><h3>Hazlo más fácil.</h3><p>Plantillas, ideas y kits para organizar tus tareas.</p><span className="collection-more">Recursos desde US$2.90 <ArrowUpRight size={17}/></span></button>
     <button className="collection-card collection-business" onClick={()=>{setActive("servicio");setSearch("");goToCatalog();}} type="button"><span className="collection-index">03 / TU NEGOCIO</span><div className="collection-icon">↗</div><h3>Dale vida a tu marca.</h3><p>Diseño, contenido, páginas web y automatizaciones.</p><span className="collection-more">Explorar servicios <ArrowUpRight size={17}/></span></button>
    </div>
   </div></section>

   <section className="featured-section"><div className="container">
    <div className="section-top featured-top"><div><span className="overline">NUESTRA SELECCIÓN</span><h2>Buenos comienzos, <em>mejores precios.</em></h2></div><button type="button" className="text-link" onClick={goToCatalog}>Ver todo el catálogo <ArrowUpRight size={18}/></button></div>
    <div className="featured-grid">{featured.map((p,i)=><article className={"featured-card feature-"+i} key={p.id}>
     <div className="featured-cover"><img loading="lazy" src={artFor(p)} alt={"Ilustración de "+p.name}/><span className="featured-tag">{i===0?"Para tu carrera":i===1?"Recurso digital":"Para tu negocio"}</span></div>
     <div className="featured-body"><div><span className="featured-type">{LABELS[p.category]||"Oferta digital"}</span><h3>{p.name}</h3><p>{p.tagline||p.description}</p></div><div className="featured-bottom"><span className="featured-price">{money(p.price_cents,p.currency)}</span><button aria-label={"Consultar "+p.name} className="circle-action" type="button" onClick={()=>setSelected(p)}><ArrowUpRight size={20}/></button></div></div>
    </article>)}</div>
   </div></section>

   <section className="catalog-section section-space" id="catalogo"><div className="container">
    <div className="section-top catalog-top"><div><span className="overline">ELIGE A TU RITMO</span><h2>Todo el catálogo. <em>A un clic.</em></h2><p>Precios orientativos de lanzamiento en USD. Consulta la disponibilidad de cada entrega antes de contratar.</p></div><span className="catalog-counter">{displayed.length} opciones</span></div>
    <div className="catalog-controls"><div className="filter-tabs" role="group" aria-label="Filtrar productos">{CATEGORIES.map(([id,label])=><button key={id} type="button" aria-pressed={active===id} className={active===id?"active":""} onClick={()=>setActive(id)}>{label}</button>)}</div><label className="catalog-search"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar algo específico..." aria-label="Buscar productos y servicios"/></label></div>
    <div className="catalog-grid">{displayed.map((p,i)=><article className="offer-card" key={p.id}>
     <div className={"offer-art art-"+(i%4)}><img src={artFor(p)} alt={"Presentación visual de "+p.name} loading="lazy"/><span className="offer-kind">{LABELS[p.category]||"Digital"}</span></div>
     <div className="offer-body"><div className="offer-heading"><h3>{p.name}</h3><span className="offer-price">{money(p.price_cents,p.currency)}</span></div><p>{p.description}</p><div className="offer-delivery"><BadgeCheck size={15}/>{p.delivery||p.delivery_note||"Consulta el alcance"}</div><div className="offer-foot"><span className={isPrepared(p)?"state-tag preparing":"state-tag"}>{isPrepared(p)?"En preparación":p.published&&ready?"Compra habilitada":"Por solicitud"}</span><button className="offer-button" type="button" onClick={()=>setSelected(p)}>{buyLabel(p)} <ArrowUpRight size={16}/></button></div></div>
    </article>)}{displayed.length===0&&<div className="empty-result">No hay coincidencias. Prueba otra búsqueda o elige otra categoría.</div>}</div>
    <p className="catalog-note"><ShieldCheck size={15}/> Los productos marcados «En preparación» no se venden todavía. Solo los pagos habilitados y verificados activarán el acceso digital. Precios e impuestos pueden variar según las condiciones finales del pedido.</p>
   </div></section>

   <section className="how-section" id="como-funciona"><div className="container how-grid">
    <div className="how-copy"><span className="overline light">CLARO, SIMPLE, SIN VUELTAS</span><h2>Tu siguiente paso <em>no tiene que ser difícil.</em></h2><p>Una experiencia sencilla para descubrir opciones digitales a tu medida, estés donde estés.</p><div className="how-steps">
     <div><span>01</span><div><strong>Explora</strong><p>Encuentra el producto o servicio que resuelve tu necesidad.</p></div></div>
     <div><span>02</span><div><strong>Elige y consulta</strong><p>Conoce el precio, lo que incluye y su disponibilidad.</p></div></div>
     <div><span>03</span><div><strong>Recibe tu entrega</strong><p>Coordinamos los servicios y activaremos descargas seguras al habilitar los pagos.</p></div></div>
    </div></div>
    <div className="how-visual"><div className="how-visual-ring"/><div className="how-card"><span className="how-card-icon"><WandSparkles size={30}/></span><span className="mini-label">COMMERCE / DIGITAL GOODS</span><h3>Menos barreras.<br/>Más posibilidades.</h3><div className="how-mini-offer"><img src="/art/cv.svg" alt="" loading="lazy"/><div><strong>CV Express</strong><small>Desde US$4.90</small></div><span><Check size={16}/></span></div><div className="how-mini-offer"><img src="/art/excel.svg" alt="" loading="lazy"/><div><strong>Plantillas útiles</strong><small>Desde US$2.90</small></div><span><Check size={16}/></span></div><div className="how-bottom"><span>✦</span> Diseñado para dar el próximo paso</div></div></div>
   </div></section>

   <section className="faq-section section-space" id="preguntas"><div className="container faq-grid"><div className="faq-copy"><span className="overline">TE LO EXPLICAMOS</span><h2>Preguntas reales. <em>Respuestas claras.</em></h2><p>Queremos que sepas exactamente qué estás solicitando antes de avanzar.</p><a href={emailHref(null)} className="contact-link"><Mail size={17}/> {SUPPORT_EMAIL} <ArrowUpRight size={16}/></a></div><div className="faq-items">{FAQ.map(({q,a},i)=><details key={i}><summary>{q}<ChevronDown size={18}/></summary><p>{a}</p></details>)}</div></div></section>

   <section className="end-section"><div className="container end-inner"><div className="end-star">✳</div><span className="overline">UNA IDEA ES SUFICIENTE PARA EMPEZAR</span><h2>Lo que viene para ti <em>empieza aquí.</em></h2><p>Un currículum, un recurso, una página o una nueva forma de trabajar. Todo comienza con un paso pequeño.</p><div className="end-actions"><button className="btn btn-dark" type="button" onClick={goToCatalog}>Encontrar mi próximo paso <ArrowUpRight size={18}/></button><a className="btn btn-outline" href={emailHref(null)}>Hablar de mi idea <Mail size={16}/></a></div></div></section>
  </main>
  <footer className="footer"><div className="container footer-grid"><div><a href="#inicio" className="brand footer-brand"><span className="brand-mark">ab<span>✦</span></span><span className="brand-copy"><strong>Ángel Berigüete</strong><small>COMMERCE</small></span></a><p>Soluciones digitales y recursos prácticos para personas y negocios en Latinoamérica. Commerce es una marca comercial independiente.</p></div><div className="footer-links"><strong>Descubre</strong><a href="#catalogo">Catálogo</a><a href="#colecciones">Colecciones</a><a href="#como-funciona">Cómo funciona</a><a href="#preguntas">Ayuda</a></div><div className="footer-links"><strong>Contacto</strong><a href={emailHref(null)}>{SUPPORT_EMAIL}</a><button type="button" onClick={()=>whatsapp(null)}><MessageCircle size={16}/> WhatsApp</button><span>Precios de referencia en USD</span></div></div><div className="container footer-bottom"><span>© 2026 Ángel Berigüete Commerce.</span><span>Compras y disponibilidad sujetas a confirmación. No se garantizan resultados laborales ni comerciales.</span></div></footer>

  {selected&&<div className="modal-backdrop" onClick={()=>!busy&&setSelected(null)}><div className="purchase-dialog" role="dialog" aria-modal="true" aria-label={"Consultar "+selected.name} onClick={e=>e.stopPropagation()}><button className="close-modal" type="button" aria-label="Cerrar" onClick={()=>!busy&&setSelected(null)}><X size={19}/></button><span className="overline">ESTÁS A UN PASO</span><h2>{selected.name}</h2><p>{selected.description}</p><div className="modal-price"><span>Precio de referencia</span><strong>{money(selected.price_cents,selected.currency)}</strong></div><form onSubmit={buy}><label>Tu nombre completo<input value={name} onChange={e=>setName(e.target.value)} minLength={3} maxLength={120} placeholder="Tu nombre" required/></label><label>Correo electrónico<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="tu@email.com" maxLength={254} required/></label><div className="privacy-note"><ShieldCheck size={17}/><span>Sin registro ni contraseña. Usaremos tus datos únicamente para gestionar la solicitud o compra.</span></div><button type="submit" className="btn btn-dark modal-submit" disabled={busy}>{busy?"Procesando...":checkoutReady(ready,selected)?"Continuar a PayPal":"Consultar disponibilidad"} <ArrowUpRight size={17}/></button><small className="modal-hint">{checkoutReady(ready,selected)?"Completarás el pago de forma segura en PayPal.":"Este botón abre tu correo para solicitar el servicio. No se realizará ningún cobro."}</small></form></div></div>}
  {receipt&&<div className="modal-backdrop"><div className="purchase-dialog" role="dialog" aria-modal="true" aria-label="Estado del pago"><span className="overline">ESTADO DEL PEDIDO</span><h2>{receipt.status==="paid"?"Pago confirmado":"Pendiente de confirmación"}</h2><p>Conserva tu recibo de PayPal. No necesitas crear una cuenta para consultar tu pedido.</p><small>Referencia: {receipt.paypal_order_id}</small>{downloads.map((item,i)=><div className="download-list" key={i}><strong>{item.name}</strong>{item.download_url&&<a href={item.download_url} target="_blank" rel="noreferrer">Abrir recurso <ArrowUpRight size={15}/></a>}{(item.lessons||[]).map(l=><a key={l.id} href={l.url||"#"} target="_blank" rel="noreferrer">{l.title}</a>)}</div>)}<button className="btn btn-dark modal-submit" type="button" onClick={()=>setReceipt(null)}>Volver a la tienda</button></div></div>}
  {notice&&<div className="toast" role="status"><span>{notice}</span><button type="button" onClick={()=>setNotice("")} aria-label="Cerrar"><X size={18}/></button></div>}
  {busy&&<div className="working" role="status"><span className="spinner"/> Procesando...</div>}
 </div>;
}

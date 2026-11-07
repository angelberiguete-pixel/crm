"use client";
import {useState} from "react";
const offers=[{id:"consultoria-ia",name:"Consultoría de inteligencia artificial",usd:"150",eur:"140",description:"Sesión de diagnóstico y recomendaciones."},{id:"diagnostico-digital",name:"Diagnóstico digital empresarial",usd:"75",eur:"70",description:"Evaluación inicial de procesos y oportunidades."}];
export default function PaymentsPage(){
 const [currency,setCurrency]=useState<"USD"|"EUR">("USD");
 return <main style={{fontFamily:"Arial,sans-serif",background:"#0b1020",color:"#f5f7ff",minHeight:"100vh",padding:"48px 18px"}}>
  <div style={{maxWidth:900,margin:"auto"}}>
   <p style={{color:"#8da6ff",letterSpacing:2,fontSize:12}}>ÁNGEL BERIGÜETE · PAGOS</p>
   <h1 style={{fontSize:"clamp(30px,5vw,52px)",marginBottom:8}}>Centro de cobros</h1>
   <p style={{color:"#adb9d3",lineHeight:1.6}}>Servicios tecnológicos, consultoría y soluciones empresariales. Esta página es una vista previa; los cobros aún no están habilitados.</p>
   <div style={{margin:"26px 0",display:"flex",gap:10}}>{(["USD","EUR"] as const).map(c=><button key={c} onClick={()=>setCurrency(c)} style={{padding:"10px 20px",background:currency===c?"#526bff":"#202a44",color:"white",border:0,borderRadius:9,cursor:"pointer"}}>{c}</button>)}</div>
   <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:18}}>
    {offers.map(o=><article key={o.id} style={{padding:26,background:"#171f34",border:"1px solid #34415f",borderRadius:16}}>
      <h2 style={{fontSize:22}}>{o.name}</h2><p style={{color:"#b4c0d7"}}>{o.description}</p>
      <p style={{fontSize:34,fontWeight:700}}>{currency==="USD"?"$":"€"}{currency==="USD"?o.usd:o.eur}</p>
      <button disabled style={{width:"100%",padding:14,border:0,borderRadius:10,background:"#63708a",color:"white",cursor:"not-allowed"}}>Pago en preparación</button>
    </article>)}
   </section>
   <p style={{marginTop:32,color:"#97a7c3",fontSize:13}}>Los importes son provisionales. No introduzcas datos de tarjeta en esta vista previa. Los pagos solo se habilitarán después de validar credenciales, seguridad, persistencia y webhooks.</p>
  </div>
 </main>
}

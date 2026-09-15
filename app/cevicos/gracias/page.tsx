"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Download, ArrowLeft, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function GraciasPage(){
  const params=useSearchParams();
  const leadId=params.get("lead");

  async function markDownload(){
    if(!leadId) return;
    await supabase.rpc("record_land_ficha_download",{p_lead_id:leadId});
  }

  return <main style={shell}>
    <section style={card}>
      <div style={icon}><CheckCircle2 size={34}/></div>
      <div style={eyebrow}>PROYECTO 812 · CEVICOS</div>
      <h1 style={{fontSize:"clamp(32px,6vw,52px)",margin:"10px 0 8px",letterSpacing:"-.04em"}}>Solicitud recibida.</h1>
      <p style={lead}>Tu información quedó registrada en nuestro CRM comercial. Ya puedes abrir la ficha de la propiedad y nuestro equipo podrá continuar el seguimiento desde una sola plataforma.</p>

      <div style={summary}>
        <div><span>Extensión informada</span><strong>812 tareas aprox.</strong></div>
        <div><span>Referencia</span><strong>RD$80,000 / tarea</strong></div>
        <div><span>Valor de referencia</span><strong>RD$64.96 MM</strong></div>
      </div>

      <div style={delivery}>
        <h2 style={{marginTop:0}}>Tu ficha comercial</h2>
        <p style={{color:"#60736c",lineHeight:1.65}}>La ficha se entrega en PDF. Contiene el resumen comercial de la oportunidad, extensión y precio de referencia. No incluye documentos personales, expediente judicial ni información sensible; esos documentos se revisan más adelante con interesados calificados.</p>
        <a href="/Ficha_812_Tareas_Cevicos.pdf" target="_blank" rel="noreferrer" onClick={()=>void markDownload()} style={primary}><Download size={18}/> Abrir / descargar ficha PDF</a>
      </div>

      <div style={notice}><ShieldCheck size={18}/><div><strong>Próximo paso</strong><br/><span>Si solicitaste información con correo electrónico, también podremos enviarte la ficha por email cuando el canal de correo automático esté habilitado. Para visitas, ubicación exacta o documentación ampliada, el equipo validará primero el interés y la identidad del comprador.</span></div></div>

      <Link href="/cevicos" style={back}><ArrowLeft size={16}/> Volver a la propiedad</Link>
      <p style={legal}>Información preliminar sujeta a verificación documental, catastral, registral, técnica y legal antes de cualquier cierre.</p>
    </section>
  </main>;
}

const shell:React.CSSProperties={minHeight:"100vh",background:"#f5f2e9",padding:"40px 18px",color:"#173329",display:"grid",placeItems:"center"};
const card:React.CSSProperties={width:"100%",maxWidth:820,background:"white",border:"1px solid #e2ddcf",borderRadius:24,padding:"clamp(22px,5vw,42px)",boxShadow:"0 18px 60px rgba(23,51,41,.10)"};
const icon:React.CSSProperties={width:66,height:66,borderRadius:20,display:"grid",placeItems:"center",background:"#e8f3ec",color:"#216b49"};
const eyebrow:React.CSSProperties={marginTop:20,fontSize:12,fontWeight:900,letterSpacing:1.5,color:"#9a7935"};
const lead:React.CSSProperties={fontSize:17,lineHeight:1.7,color:"#60736c",maxWidth:680};
const summary:React.CSSProperties={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:10,margin:"24px 0"};
const delivery:React.CSSProperties={border:"1px solid #e2ddcf",borderRadius:18,padding:20,background:"#fbfaf7"};
const primary:React.CSSProperties={display:"inline-flex",alignItems:"center",gap:8,textDecoration:"none",background:"#173329",color:"#fff",padding:"13px 16px",borderRadius:12,fontWeight:900};
const notice:React.CSSProperties={display:"flex",gap:10,marginTop:18,padding:16,borderRadius:14,background:"#eef4ef",color:"#38574c",lineHeight:1.55};
const back:React.CSSProperties={display:"inline-flex",gap:7,alignItems:"center",marginTop:22,color:"#173329",fontWeight:800,textDecoration:"none"};
const legal:React.CSSProperties={marginTop:20,fontSize:12,lineHeight:1.55,color:"#71827b"};

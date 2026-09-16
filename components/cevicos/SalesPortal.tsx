"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ExternalLink, FileText, LogOut, RefreshCw, Search, ShieldCheck, UserRoundCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";

const ADMIN_EMAIL = "angeljavierberiguetelazala@gmail.com";

type Lead = {
  id:string;
  buyer_name:string;
  buyer_phone:string;
  buyer_email:string|null;
  buyer_company:string|null;
  desired_use:string|null;
  budget:string|null;
  notes:string|null;
  stage:string;
  priority:string;
  delivery_status:string;
  ficha_downloaded_at:string|null;
  email_sent_at:string|null;
  next_action_at:string|null;
  last_contacted_at:string|null;
  created_at:string;
};

const stages=["new","qualified","contacted","visit","offer","negotiation","closed_won","closed_lost"];
const priorities=["low","normal","high","hot"];

export default function SalesPortal(){
  const router=useRouter();
  const [leads,setLeads]=useState<Lead[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [query,setQuery]=useState("");
  const [stageFilter,setStageFilter]=useState("");
  const [priorityFilter,setPriorityFilter]=useState("");
  const [tab,setTab]=useState<"dashboard"|"buyers">("dashboard");

  async function load(){
    setLoading(true); setError("");
    const {data:{session}}=await supabase.auth.getSession();
    if(!session){router.replace("/property-sales/login?admin=1");return;}
    if((session.user.email||"").toLowerCase()!==ADMIN_EMAIL){
      setError("Este portal está reservado al Administrador Total del Proyecto 812.");
      setLoading(false);
      return;
    }

    await supabase.rpc("ensure_land_admin_profile");
    const result=await supabase.from("land_sales_leads").select("*").order("created_at",{ascending:false});
    if(result.error){setError(result.error.message);setLoading(false);return;}
    setLeads((result.data||[]) as Lead[]);
    setLoading(false);
  }

  useEffect(()=>{void load();},[]);

  const filtered=useMemo(()=>leads.filter(l=>{
    const hay=(l.buyer_name+" "+l.buyer_phone+" "+(l.buyer_email||"")+" "+(l.buyer_company||"")).toLowerCase();
    return (!query||hay.includes(query.toLowerCase()))&&(!stageFilter||l.stage===stageFilter)&&(!priorityFilter||l.priority===priorityFilter);
  }),[leads,query,stageFilter,priorityFilter]);

  async function updateLead(id:string,stage:string,priority:string,nextAction:string,note:string){
    setError("");setNotice("");
    const {error:updateError}=await supabase.from("land_sales_leads").update({
      stage,priority,next_action_at:nextAction?new Date(nextAction).toISOString():null,last_contacted_at:new Date().toISOString()
    }).eq("id",id);
    if(updateError){setError(updateError.message);return;}
    if(note.trim()){
      const noteResult=await supabase.from("land_sales_interactions").insert({lead_id:id,channel:"note",body:note.trim()});
      if(noteResult.error){setError(noteResult.error.message);return;}
    }
    setNotice("Comprador actualizado.");
    await load();
  }

  async function signOut(){await supabase.auth.signOut();router.replace("/property-sales/login?admin=1");}

  if(loading)return <main style={shell}><section style={card}><RefreshCw size={18}/> Cargando control de venta…</section></main>;

  const qualified=leads.filter(l=>["qualified","contacted","visit","offer","negotiation","closed_won"].includes(l.stage)).length;
  const offers=leads.filter(l=>["offer","negotiation"].includes(l.stage)).length;
  const downloads=leads.filter(l=>!!l.ficha_downloaded_at).length;

  return <main style={shell}>
    <section style={{...card,maxWidth:1280,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:18,alignItems:"flex-start",flexWrap:"wrap"}}>
        <div>
          <div style={eyebrow}>ADMINISTRADOR TOTAL · ÚNICO VENDEDOR</div>
          <h1 style={{margin:"8px 0",fontSize:"clamp(30px,5vw,44px)"}}>Proyecto 812 · Control de Venta</h1>
          <p style={muted}>Una propiedad, un precio oficial, un WhatsApp, un CRM y una sola coordinación comercial.</p>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <Link href="/cevicos" style={button}><ExternalLink size={15}/> Ver propiedad</Link>
          <Link href="/crm" style={button}><ExternalLink size={15}/> CRM general</Link>
          <button style={button} onClick={()=>void load()}><RefreshCw size={15}/> Actualizar</button>
          <button style={button} onClick={signOut}><LogOut size={15}/> Salir</button>
        </div>
      </div>

      <div style={securityBox}><ShieldCheck size={18}/><div><strong>Modelo directo activado.</strong><br/><span>No se admiten brokers ni vendedores externos. Todos los compradores se administran directamente desde esta cuenta.</span></div></div>

      {error&&<div style={errorBox}>{error}</div>}
      {notice&&<div style={noticeBox}>{notice}</div>}

      <div style={kpiGrid}>
        <Kpi label="Compradores registrados" value={leads.length}/>
        <Kpi label="Compradores calificados" value={qualified}/>
        <Kpi label="Ficha PDF abierta" value={downloads}/>
        <Kpi label="Oferta / negociación" value={offers}/>
      </div>

      <nav style={tabs}>
        <button onClick={()=>setTab("dashboard")} style={{...tabButton,...(tab==="dashboard"?activeTab:{})}}>Dashboard</button>
        <button onClick={()=>setTab("buyers")} style={{...tabButton,...(tab==="buyers"?activeTab:{})}}>Compradores</button>
      </nav>

      {tab==="dashboard"&&<section style={{marginTop:22,display:"grid",gap:16}}>
        <div style={subCard}>
          <h2 style={{marginTop:0}}>Operación centralizada</h2>
          <p style={muted}>El Proyecto 812 ya está registrado en el CRM general como una oportunidad por RD$64,960,000. Los nuevos interesados que completen el formulario público aparecen aquí para calificación, visita, oferta y cierre.</p>
        </div>
        <div style={subCard}>
          <h2 style={{marginTop:0}}>Flujo</h2>
          <p style={muted}>Página pública → formulario → ficha PDF → WhatsApp oficial → calificación → visita → oferta → revisión legal → cierre.</p>
        </div>
      </section>}

      {tab==="buyers"&&<section style={{marginTop:22}}>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
          <div style={{position:"relative",flex:"1 1 280px"}}><Search size={16} style={{position:"absolute",left:10,top:12,color:"#7a8a84"}}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar comprador, correo o teléfono" style={{...input,paddingLeft:32}}/></div>
          <select value={stageFilter} onChange={e=>setStageFilter(e.target.value)} style={input}><option value="">Todas las etapas</option>{stages.map(x=><option key={x} value={x}>{x}</option>)}</select>
          <select value={priorityFilter} onChange={e=>setPriorityFilter(e.target.value)} style={input}><option value="">Toda prioridad</option>{priorities.map(x=><option key={x} value={x}>{x}</option>)}</select>
        </div>
        <div style={{overflowX:"auto"}}>
          <table style={table}><thead><tr><th>Comprador</th><th>Interés</th><th>Etapa</th><th>Prioridad</th><th>Entrega</th><th>Seguimiento</th></tr></thead>
          <tbody>{filtered.map(l=><LeadRow key={l.id} lead={l} onSave={updateLead}/>)}</tbody></table>
        </div>
        {!filtered.length&&<div style={empty}>Todavía no hay compradores con esos filtros.</div>}
      </section>}
    </section>
  </main>;
}

function Kpi({label,value}:{label:string;value:string|number}){return <div style={kpi}><div style={{fontSize:28,fontWeight:900}}>{value}</div><div style={muted}>{label}</div></div>}

function LeadRow({lead,onSave}:{lead:Lead;onSave:(id:string,stage:string,priority:string,nextAction:string,note:string)=>Promise<void>}){
  const [stage,setStage]=useState(lead.stage);
  const [priority,setPriority]=useState(lead.priority);
  const [nextAction,setNextAction]=useState(lead.next_action_at?new Date(lead.next_action_at).toISOString().slice(0,16):"");
  const [note,setNote]=useState("");
  return <tr>
    <td><strong>{lead.buyer_name}</strong><br/><small>{lead.buyer_phone}{lead.buyer_email?` · ${lead.buyer_email}`:""}</small>{lead.buyer_company&&<><br/><small>{lead.buyer_company}</small></>}</td>
    <td><small>{lead.desired_use||"—"}</small><br/><strong>{lead.budget||"Presupuesto no indicado"}</strong></td>
    <td><select value={stage} onChange={e=>setStage(e.target.value)} style={input}>{stages.map(x=><option key={x} value={x}>{x}</option>)}</select></td>
    <td><select value={priority} onChange={e=>setPriority(e.target.value)} style={input}>{priorities.map(x=><option key={x} value={x}>{x}</option>)}</select></td>
    <td><small>{lead.ficha_downloaded_at?"PDF abierto":"PDF pendiente"}<br/>{lead.email_sent_at?"Correo enviado":"Correo pendiente"}</small></td>
    <td><div style={{display:"grid",gap:6,minWidth:230}}><input type="datetime-local" value={nextAction} onChange={e=>setNextAction(e.target.value)} style={input}/><input value={note} onChange={e=>setNote(e.target.value)} placeholder="Nota interna" style={input}/><button style={primaryButton} onClick={()=>void onSave(lead.id,stage,priority,nextAction,note)}>Guardar</button></div></td>
  </tr>
}

const shell:React.CSSProperties={minHeight:"100vh",background:"#f5f2e9",padding:"28px 16px",color:"#173329"};
const card:React.CSSProperties={background:"#fff",border:"1px solid #e3ddcf",borderRadius:22,padding:"clamp(18px,4vw,34px)",boxShadow:"0 18px 60px rgba(23,51,41,.08)"};
const eyebrow:React.CSSProperties={fontSize:12,fontWeight:900,letterSpacing:1.5,color:"#9a7935"};
const muted:React.CSSProperties={color:"#62756e",lineHeight:1.6};
const securityBox:React.CSSProperties={display:"flex",gap:10,marginTop:22,padding:16,borderRadius:14,background:"#edf5ef",color:"#36594a",lineHeight:1.55};
const errorBox:React.CSSProperties={marginTop:16,padding:14,borderRadius:12,background:"#fff0f0",color:"#8b2222"};
const noticeBox:React.CSSProperties={marginTop:16,padding:14,borderRadius:12,background:"#eef4ef",color:"#36594a"};
const kpiGrid:React.CSSProperties={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12,marginTop:22};
const kpi:React.CSSProperties={padding:18,border:"1px solid #e3ddcf",borderRadius:16,background:"#fbfaf7"};
const tabs:React.CSSProperties={display:"flex",gap:8,marginTop:24,borderBottom:"1px solid #e3ddcf",paddingBottom:8};
const tabButton:React.CSSProperties={border:0,background:"transparent",padding:"10px 14px",borderRadius:10,fontWeight:800,cursor:"pointer",color:"#60736c"};
const activeTab:React.CSSProperties={background:"#173329",color:"#fff"};
const subCard:React.CSSProperties={padding:20,border:"1px solid #e3ddcf",borderRadius:16,background:"#fbfaf7"};
const button:React.CSSProperties={display:"inline-flex",alignItems:"center",gap:7,padding:"10px 12px",border:"1px solid #d7d0c0",borderRadius:10,background:"#fff",color:"#173329",fontWeight:800,textDecoration:"none",cursor:"pointer"};
const primaryButton:React.CSSProperties={border:0,borderRadius:10,padding:"10px 12px",background:"#173329",color:"#fff",fontWeight:900,cursor:"pointer"};
const input:React.CSSProperties={boxSizing:"border-box",border:"1px solid #d8d5cc",borderRadius:10,padding:"9px 10px",font:"inherit",background:"#fff",minWidth:150};
const table:React.CSSProperties={width:"100%",borderCollapse:"collapse",fontSize:14};
const empty:React.CSSProperties={padding:20,textAlign:"center",color:"#71827b"};

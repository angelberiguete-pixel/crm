"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Copy, ExternalLink, LogOut, RefreshCw, ShieldCheck, Users, BadgeDollarSign, MousePointerClick, UserRoundCheck, FileText, KeyRound, Save, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Profile = { id:string; auth_user_id:string; role:"admin"|"seller"; status:string; full_name:string; company:string|null; phone:string|null; referral_code:string; commission_rate:number; created_at:string };
type Lead = { id:string; seller_id:string|null; referral_code:string|null; buyer_name:string; buyer_phone:string; buyer_email:string|null; buyer_company:string|null; desired_use:string|null; budget:string|null; notes:string|null; stage:string; priority:string; delivery_status:string; ficha_downloaded_at:string|null; email_sent_at:string|null; next_action_at:string|null; last_contacted_at:string|null; commission_rate_snapshot:number; created_at:string };
type Commission = { id:string; seller_id:string; lead_id:string; commission_rate:number; sale_price:number; commission_amount:number; status:string; paid_at:string|null };
const stages=["new","qualified","contacted","visit","offer","negotiation","closed_won","closed_lost"];
const priorities=["low","normal","high","hot"];

export default function SalesPortal() {
  const router = useRouter();
  const [profile,setProfile]=useState<Profile|null>(null);
  const [sellers,setSellers]=useState<Profile[]>([]);
  const [leads,setLeads]=useState<Lead[]>([]);
  const [commissions,setCommissions]=useState<Commission[]>([]);
  const [clicks,setClicks]=useState(0);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [query,setQuery]=useState("");
  const [stageFilter,setStageFilter]=useState("");
  const [priorityFilter,setPriorityFilter]=useState("");
  const [tab,setTab]=useState<"dashboard"|"buyers"|"brokers"|"commissions">("dashboard");

  async function load() {
    setLoading(true); setError(""); setNotice("");
    const { data:{ session } } = await supabase.auth.getSession();
    if (!session) { router.replace("/property-sales/login"); return; }

    await supabase.rpc("ensure_land_admin_profile");
    const ownResult = await supabase.from("land_sales_profiles").select("*").eq("auth_user_id", session.user.id).maybeSingle();
    const own=ownResult.data as Profile|null;
    if (!own) { setError("Tu cuenta está autenticada pero todavía no tiene perfil comercial. Contacta al administrador."); setLoading(false); return; }
    setProfile(own);

    if (own.role === "admin") {
      const [sp, lp, cp, xp] = await Promise.all([
        supabase.from("land_sales_profiles").select("*").eq("role","seller").order("created_at",{ascending:false}),
        supabase.from("land_sales_leads").select("*").order("created_at",{ascending:false}),
        supabase.from("land_sales_commissions").select("*").order("created_at",{ascending:false}),
        supabase.from("land_sales_clicks").select("id",{count:"exact",head:true}),
      ]);
      setSellers((sp.data || []) as Profile[]); setLeads((lp.data || []) as Lead[]); setCommissions((cp.data || []) as Commission[]); setClicks(xp.count || 0);
    } else {
      const [lp, cp, xp] = await Promise.all([
        supabase.from("land_sales_leads").select("*").eq("seller_id", own.id).order("created_at",{ascending:false}),
        supabase.from("land_sales_commissions").select("*").eq("seller_id", own.id).order("created_at",{ascending:false}),
        supabase.from("land_sales_clicks").select("id",{count:"exact",head:true}).eq("seller_id", own.id),
      ]);
      setLeads((lp.data || []) as Lead[]); setCommissions((cp.data || []) as Commission[]); setClicks(xp.count || 0);
    }
    setLoading(false);
  }

  useEffect(()=>{ void load(); },[]);

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const referralLink = profile ? `${origin}/cevicos?ref=${profile.referral_code}` : "";
  const payable = useMemo(()=>commissions.filter(c=>c.status!=="cancelled").reduce((a,c)=>a+Number(c.commission_amount||0),0),[commissions]);
  const filteredLeads=useMemo(()=>leads.filter(l=>{
    const hay=(l.buyer_name+" "+l.buyer_phone+" "+(l.buyer_email||"")+" "+(l.buyer_company||"")).toLowerCase();
    return (!query||hay.includes(query.toLowerCase()))&&(!stageFilter||l.stage===stageFilter)&&(!priorityFilter||l.priority===priorityFilter);
  }),[leads,query,stageFilter,priorityFilter]);

  async function updateSeller(id:string,status:string,rate:number) {
    setError(""); setNotice("");
    const { error } = await supabase.from("land_sales_profiles").update({status,commission_rate:rate,approved_at:status==="active"?new Date().toISOString():null}).eq("id",id);
    if (error) setError(error.message); else {setNotice("Broker actualizado."); await load();}
  }

  async function updateLead(id:string,stage:string,priority:string,nextAction:string,note:string) {
    setError(""); setNotice("");
    const {error}=await supabase.from("land_sales_leads").update({
      stage,priority,next_action_at:nextAction?new Date(nextAction).toISOString():null,last_contacted_at:new Date().toISOString()
    }).eq("id",id);
    if(error){setError(error.message);return;}
    if(note.trim()){
      const noteResult=await supabase.from("land_sales_interactions").insert({lead_id:id,channel:"note",body:note.trim()});
      if(noteResult.error){setError(noteResult.error.message);return;}
    }
    setNotice("Comprador actualizado."); await load();
  }

  async function resetSellerPassword(authUserId:string,password:string){
    setError(""); setNotice("");
    if(password.length<8){setError("La contraseña temporal debe tener al menos 8 caracteres.");return;}
    const {data,error}=await supabase.functions.invoke("land-sales-admin-user",{body:{action:"set_temp_password",auth_user_id:authUserId,password}});
    if(error||data?.error){setError(data?.message||error?.message||"No fue posible restablecer el acceso.");return;}
    setNotice("Acceso del broker restablecido. Comparte la contraseña temporal de forma privada.");
  }

  async function upsertCommission(leadId:string,salePrice:number,status:string){
    setError(""); setNotice("");
    const {error}=await supabase.rpc("admin_upsert_land_commission",{p_lead_id:leadId,p_sale_price:salePrice,p_status:status});
    if(error){setError(error.message);return;}
    setNotice("Comisión actualizada."); await load();
  }

  async function signOut(){ await supabase.auth.signOut(); router.replace("/property-sales/login"); }
  async function copy(text:string){ await navigator.clipboard.writeText(text); setNotice("Enlace copiado."); }

  if (loading) return <main style={shell}><div style={card}><RefreshCw/> Cargando Sales Command Center…</div></main>;
  if (error && !profile) return <main style={shell}><div style={card}><b>No se pudo abrir el portal</b><p>{error}</p><button onClick={signOut}>Cerrar sesión</button></div></main>;
  if (!profile) return null;

  const isAdmin = profile.role === "admin";
  const offers=leads.filter(l=>["offer","negotiation"].includes(l.stage)).length;
  return <main style={shell}>
    <section style={{...card,maxWidth:1280,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:20,alignItems:"flex-start",flexWrap:"wrap"}}>
        <div><div style={{fontSize:12,fontWeight:900,letterSpacing:1.5,color:"#9a7935"}}>{isAdmin?"ADMINISTRADOR TOTAL":"PORTAL DE BROKER"}</div><h1 style={{margin:"8px 0",fontSize:36}}>{isAdmin?"Proyecto 812 · Sales Command Center":profile.full_name}</h1><div style={{color:"#60736c"}}>{isAdmin?"Control de compradores, brokers, seguimiento, atribución y comisiones.":`Estado: ${profile.status} · Comisión asignada: ${profile.commission_rate}%`}</div></div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}><Link href="/cevicos" style={{...button,textDecoration:"none"}}><ExternalLink size={15}/> Ver propiedad</Link><button style={button} onClick={()=>void load()}><RefreshCw size={15}/> Actualizar</button><button style={button} onClick={signOut}><LogOut size={15}/> Salir</button></div>
      </div>

      {error && <div style={errorBox}>{error}</div>}
      {notice && <div style={noticeBox}>{notice}</div>}

      {!isAdmin && <SellerWelcome profile={profile} referralLink={referralLink} onCopy={copy}/>} 

      <div style={kpiGrid}>
        <Kpi icon={<MousePointerClick/>} label="Clicks registrados" value={clicks}/>
        <Kpi icon={<UserRoundCheck/>} label="Compradores" value={leads.length}/>
        <Kpi icon={<BadgeDollarSign/>} label="Comisiones registradas" value={`RD$${payable.toLocaleString("en-US")}`}/>
        {isAdmin && <Kpi icon={<Users/>} label="Brokers" value={sellers.length}/>} 
      </div>

      {isAdmin ? <>
        <nav style={tabs}>
          {(["dashboard","buyers","brokers","commissions"] as const).map(t=><button key={t} onClick={()=>setTab(t)} style={{...tabButton,...(tab===t?activeTab:{})}}>{t==="dashboard"?"Dashboard":t==="buyers"?"Compradores":t==="brokers"?"Brokers":"Comisiones"}</button>)}
        </nav>

        {tab==="dashboard"&&<section style={{marginTop:22}}><div style={kpiGrid}><Kpi icon={<Users/>} label="Brokers pendientes" value={sellers.filter(s=>s.status==="pending").length}/><Kpi icon={<FileText/>} label="Fichas descargadas" value={leads.filter(l=>!!l.ficha_downloaded_at).length}/><Kpi icon={<UserRoundCheck/>} label="Leads calientes" value={leads.filter(l=>l.priority==="hot").length}/><Kpi icon={<BadgeDollarSign/>} label="Ofertas / negociación" value={offers}/></div><div style={{...subCard,marginTop:16}}><h2>Flujo cubierto</h2><p style={muted}>Los formularios públicos crean compradores en este CRM. Aquí puedes clasificarlos, programar la próxima acción y registrar notas. Los brokers se aprueban desde su módulo, reciben enlace único y conservan una tasa de comisión congelada cuando captan un comprador. La ficha comercial está disponible en PDF desde la página de confirmación.</p></div></section>}

        {tab==="buyers"&&<section style={{marginTop:22}}><div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}><div style={{position:"relative",flex:"1 1 260px"}}><Search size={16} style={{position:"absolute",left:10,top:11,color:"#7a8a84"}}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar comprador, correo o teléfono" style={{...input,paddingLeft:32}}/></div><select value={stageFilter} onChange={e=>setStageFilter(e.target.value)} style={input}><option value="">Todas las etapas</option>{stages.map(x=><option key={x}>{x}</option>)}</select><select value={priorityFilter} onChange={e=>setPriorityFilter(e.target.value)} style={input}><option value="">Toda prioridad</option>{priorities.map(x=><option key={x}>{x}</option>)}</select></div><div style={{overflowX:"auto"}}><table style={table}><thead><tr><th>Comprador</th><th>Broker</th><th>Interés</th><th>Etapa</th><th>Prioridad</th><th>Entrega</th><th>Seguimiento</th></tr></thead><tbody>{filteredLeads.map(l=><LeadRow key={l.id} lead={l} broker={sellers.find(s=>s.id===l.seller_id)} onSave={updateLead}/>)}</tbody></table></div>{!filteredLeads.length&&<div style={empty}>No hay compradores con esos filtros.</div>}</section>}

        {tab==="brokers"&&<section style={{marginTop:22}}><h2>Brokers y vendedores</h2><p style={muted}>Aprueba la cuenta, asigna comisión, copia su enlace exclusivo y, si tiene problemas de acceso, crea una contraseña temporal sin perder sus leads.</p><div style={{overflowX:"auto"}}><table style={table}><thead><tr><th>Broker</th><th>Estado</th><th>Comisión %</th><th>Enlace</th><th>Soporte de acceso</th><th>Acción</th></tr></thead><tbody>{sellers.map(s=><SellerRow key={s.id} seller={s} origin={origin} onSave={updateSeller} onResetPassword={resetSellerPassword} onCopy={copy}/>)}</tbody></table></div>{!sellers.length&&<div style={empty}>Todavía no hay brokers registrados.</div>}</section>}

        {tab==="commissions"&&<section style={{marginTop:22}}><h2>Control de comisiones</h2><p style={muted}>La tasa protegida proviene del momento en que el comprador quedó atribuido. El monto se calcula sobre el precio de cierre que registres.</p><div style={{overflowX:"auto"}}><table style={table}><thead><tr><th>Comprador</th><th>Broker</th><th>% protegido</th><th>Precio de cierre</th><th>Comisión</th><th>Estado</th><th>Acción</th></tr></thead><tbody>{leads.filter(l=>l.seller_id).map(l=><CommissionRow key={l.id} lead={l} broker={sellers.find(s=>s.id===l.seller_id)} commission={commissions.find(c=>c.lead_id===l.id)} onSave={upsertCommission}/>)}</tbody></table></div></section>}
      </> : <SellerLeads leads={leads}/>} 
    </section>
  </main>;
}

function SellerWelcome({profile,referralLink,onCopy}:{profile:Profile;referralLink:string;onCopy:(t:string)=>Promise<void>}){
  const active=profile.status==="active";
  return <div style={{marginTop:24,padding:18,borderRadius:16,background:active?"#edf5ef":"#fff7df",border:"1px solid #e2ddcf"}}>{active?<><div style={{display:"flex",alignItems:"center",gap:8,fontWeight:900}}><ShieldCheck size={18}/> Tu enlace comercial está activo</div><div style={{display:"flex",gap:8,marginTop:12,flexWrap:"wrap"}}><code style={{padding:12,background:"#fff",borderRadius:10,flex:1,minWidth:260}}>{referralLink}</code><button style={button} onClick={()=>void onCopy(referralLink)}><Copy size={15}/> Copiar</button><a href={referralLink} target="_blank" rel="noreferrer" style={{...button,textDecoration:"none"}}><ExternalLink size={15}/> Abrir</a></div><small style={{display:"block",marginTop:10,color:"#60736c"}}>Usa siempre este enlace. Cada comprador captado por él guarda tu código y la tasa de comisión vigente en el momento del registro.</small></>:<><b>Cuenta {profile.status}.</b><div style={{marginTop:6,color:"#60736c"}}>Puedes entrar a tu portal y descargar el kit comercial. La atribución mediante tu enlace comienza cuando el administrador te active y asigne la comisión.</div></>}</div>;
}

function LeadRow({lead,broker,onSave}:{lead:Lead;broker?:Profile;onSave:(id:string,stage:string,priority:string,nextAction:string,note:string)=>Promise<void>}){
  const [stage,setStage]=useState(lead.stage); const [priority,setPriority]=useState(lead.priority||"normal"); const [nextAction,setNextAction]=useState(toLocalInput(lead.next_action_at)); const [note,setNote]=useState("");
  return <tr><td><b>{lead.buyer_name}</b><br/>{lead.buyer_phone}<br/><small>{lead.buyer_email||""}</small><br/><small>{new Date(lead.created_at).toLocaleString()}</small></td><td>{broker?.full_name||"Directo"}<br/><small>{lead.referral_code||"Sin código"}</small></td><td>{lead.desired_use||"—"}<br/><small>{lead.budget||"Sin presupuesto"}</small></td><td><select value={stage} onChange={e=>setStage(e.target.value)}>{stages.map(x=><option key={x}>{x}</option>)}</select></td><td><select value={priority} onChange={e=>setPriority(e.target.value)}>{priorities.map(x=><option key={x}>{x}</option>)}</select></td><td><span style={pill}>{lead.delivery_status||"not_sent"}</span><br/><small>{lead.ficha_downloaded_at?"PDF abierto/descargado":"PDF no marcado"}</small></td><td><input type="datetime-local" value={nextAction} onChange={e=>setNextAction(e.target.value)} style={smallInput}/><textarea rows={2} value={note} onChange={e=>setNote(e.target.value)} placeholder="Nueva nota…" style={{...smallInput,marginTop:6}}/><button style={{...miniButton,marginTop:6}} onClick={()=>void onSave(lead.id,stage,priority,nextAction,note)}><Save size={13}/> Guardar</button></td></tr>;
}

function SellerRow({seller,origin,onSave,onResetPassword,onCopy}:{seller:Profile;origin:string;onSave:(id:string,status:string,rate:number)=>Promise<void>;onResetPassword:(uid:string,pw:string)=>Promise<void>;onCopy:(t:string)=>Promise<void>}){
  const [status,setStatus]=useState(seller.status); const [rate,setRate]=useState(Number(seller.commission_rate||0)); const [password,setPassword]=useState("");
  const link=`${origin}/cevicos?ref=${seller.referral_code}`;
  return <tr><td><b>{seller.full_name}</b><br/><small>{seller.company||""}</small><br/><small>{seller.phone||""}</small></td><td><select value={status} onChange={e=>setStatus(e.target.value)}>{["pending","active","suspended","rejected"].map(x=><option key={x}>{x}</option>)}</select></td><td><input type="number" min="0" max="100" step="0.25" value={rate} onChange={e=>setRate(Number(e.target.value))} style={{width:80}}/></td><td><button style={miniButton} onClick={()=>void onCopy(link)}><Copy size={13}/> {seller.referral_code}</button></td><td><input type="password" minLength={8} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Clave temporal" style={smallInput}/><button style={{...miniButton,marginTop:6}} onClick={()=>{void onResetPassword(seller.auth_user_id,password);setPassword("");}}><KeyRound size={13}/> Reiniciar acceso</button></td><td><button style={miniButton} onClick={()=>void onSave(seller.id,status,rate)}><Save size={13}/> Guardar</button></td></tr>;
}

function CommissionRow({lead,broker,commission,onSave}:{lead:Lead;broker?:Profile;commission?:Commission;onSave:(leadId:string,salePrice:number,status:string)=>Promise<void>}){
  const [price,setPrice]=useState(Number(commission?.sale_price||0)); const [status,setStatus]=useState(commission?.status||"pending");
  return <tr><td><b>{lead.buyer_name}</b></td><td>{broker?.full_name||"—"}</td><td>{Number(lead.commission_rate_snapshot||0).toFixed(2)}%</td><td><input type="number" min="0" step="1000" value={price} onChange={e=>setPrice(Number(e.target.value))} style={{width:130}}/></td><td>{commission?`RD$${Number(commission.commission_amount||0).toLocaleString("en-US")}`:"—"}</td><td><select value={status} onChange={e=>setStatus(e.target.value)}>{["pending","approved","payable","paid","disputed","cancelled"].map(x=><option key={x}>{x}</option>)}</select></td><td><button style={miniButton} onClick={()=>void onSave(lead.id,price,status)}><Save size={13}/> Guardar</button></td></tr>;
}

function SellerLeads({leads}:{leads:Lead[]}){return <><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12,marginTop:24}}><div style={subCard}><h3>Kit comercial</h3><a href="/Ficha_812_Tareas_Cevicos.pdf" target="_blank" rel="noreferrer">Abrir ficha PDF</a><p style={muted}>Comparte solo material aprobado. La documentación legal sensible no se publica ni se envía automáticamente.</p></div><div style={subCard}><h3>Asistencia</h3><p style={muted}>Si tienes problemas de acceso, usa recuperación de contraseña. Si persiste, el administrador puede darte una contraseña temporal desde su módulo de brokers.</p></div></div><section style={{marginTop:30}}><h2>Mis compradores registrados</h2><div style={{overflowX:"auto"}}><table style={table}><thead><tr><th>Comprador</th><th>Contacto</th><th>Comisión protegida</th><th>Etapa</th><th>Fecha</th></tr></thead><tbody>{leads.map(l=><tr key={l.id}><td><b>{l.buyer_name}</b></td><td>{l.buyer_phone}<br/><small>{l.buyer_email||""}</small></td><td>{Number(l.commission_rate_snapshot||0).toFixed(2)}%</td><td>{l.stage}</td><td>{new Date(l.created_at).toLocaleDateString()}</td></tr>)}</tbody></table></div></section></>}

function Kpi({icon,label,value}:{icon:React.ReactNode;label:string;value:string|number}){return <article style={{padding:18,border:"1px solid #e2ddcf",borderRadius:16,background:"#fbfaf7"}}><div style={{color:"#9a7935"}}>{icon}</div><div style={{marginTop:12,color:"#60736c",fontSize:13}}>{label}</div><strong style={{display:"block",fontSize:28,marginTop:4}}>{value}</strong></article>}
function toLocalInput(value:string|null){if(!value)return "";const d=new Date(value);const local=new Date(d.getTime()-d.getTimezoneOffset()*60000);return local.toISOString().slice(0,16)}
const shell:React.CSSProperties={minHeight:"100vh",background:"#f5f2e9",padding:"32px 18px",color:"#173329"};
const card:React.CSSProperties={background:"white",border:"1px solid #e2ddcf",borderRadius:22,padding:24,boxShadow:"0 14px 44px rgba(23,51,41,.08)"};
const subCard:React.CSSProperties={padding:18,border:"1px solid #e2ddcf",borderRadius:16,background:"#fbfaf7"};
const button:React.CSSProperties={display:"inline-flex",alignItems:"center",gap:7,padding:"10px 12px",borderRadius:10,border:"1px solid #d8d3c5",background:"#fff",color:"#173329",fontWeight:800,cursor:"pointer"};
const miniButton:React.CSSProperties={...button,padding:"7px 9px",fontSize:12};
const kpiGrid:React.CSSProperties={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:12,marginTop:24};
const tabs:React.CSSProperties={display:"flex",gap:8,flexWrap:"wrap",marginTop:26,paddingBottom:14,borderBottom:"1px solid #e6e0d2"};
const tabButton:React.CSSProperties={border:"1px solid #ddd6c6",borderRadius:10,padding:"9px 12px",background:"#fff",color:"#173329",fontWeight:850,cursor:"pointer"};
const activeTab:React.CSSProperties={background:"#173329",color:"#fff",borderColor:"#173329"};
const table:React.CSSProperties={width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:980};
const input:React.CSSProperties={border:"1px solid #d8d3c5",borderRadius:10,padding:"10px 11px",background:"#fff",color:"#173329"};
const smallInput:React.CSSProperties={...input,padding:"7px 8px",fontSize:12,width:"100%"};
const pill:React.CSSProperties={display:"inline-block",padding:"4px 7px",borderRadius:999,background:"#edf2ef",fontSize:11,fontWeight:800};
const errorBox:React.CSSProperties={marginTop:16,padding:12,borderRadius:12,background:"#fff0f0",color:"#8a2626"};
const noticeBox:React.CSSProperties={marginTop:16,padding:12,borderRadius:12,background:"#edf5ef",color:"#216246"};
const muted:React.CSSProperties={color:"#60736c",lineHeight:1.6,fontSize:13};
const empty:React.CSSProperties={padding:20,color:"#60736c",textAlign:"center"};

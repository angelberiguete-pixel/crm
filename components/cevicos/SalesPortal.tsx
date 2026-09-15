"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, ExternalLink, LogOut, RefreshCw, ShieldCheck, Users, BadgeDollarSign, MousePointerClick, UserRoundCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Profile = { id:string; auth_user_id:string; role:"admin"|"seller"; status:string; full_name:string; company:string|null; phone:string|null; referral_code:string; commission_rate:number; created_at:string };
type Lead = { id:string; seller_id:string|null; referral_code:string|null; buyer_name:string; buyer_phone:string; buyer_email:string|null; stage:string; commission_rate_snapshot:number; created_at:string };
type Commission = { id:string; seller_id:string; lead_id:string; commission_rate:number; sale_price:number; commission_amount:number; status:string; paid_at:string|null };

export default function SalesPortal() {
  const router = useRouter();
  const [profile,setProfile]=useState<Profile|null>(null);
  const [sellers,setSellers]=useState<Profile[]>([]);
  const [leads,setLeads]=useState<Lead[]>([]);
  const [commissions,setCommissions]=useState<Commission[]>([]);
  const [clicks,setClicks]=useState(0);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");

  async function load() {
    setLoading(true); setError("");
    const { data:{ session } } = await supabase.auth.getSession();
    if (!session) { router.replace("/property-sales/login"); return; }

    await supabase.rpc("ensure_land_admin_profile");
    let { data: own } = await supabase.from("land_sales_profiles").select("*").eq("auth_user_id", session.user.id).maybeSingle();

    if (!own) {
      const raw = localStorage.getItem("land_sales_pending_profile");
      if (raw) {
        const pending = JSON.parse(raw);
        const result = await supabase.rpc("register_land_seller", { p_full_name: pending.fullName, p_company: pending.company || null, p_phone: pending.phone || null, p_accept_terms: true });
        if (!result.error) localStorage.removeItem("land_sales_pending_profile");
        const retry = await supabase.from("land_sales_profiles").select("*").eq("auth_user_id", session.user.id).maybeSingle();
        own = retry.data;
      }
    }

    if (!own) { setError("Tu cuenta está autenticada pero todavía no tiene perfil de vendedor. Cierra sesión y usa Crear cuenta de vendedor."); setLoading(false); return; }
    setProfile(own as Profile);

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

  async function updateSeller(id:string,status:string,rate:number) {
    setError("");
    const { error } = await supabase.from("land_sales_profiles").update({status,commission_rate:rate,approved_at:status==="active"?new Date().toISOString():null}).eq("id",id);
    if (error) setError(error.message); else await load();
  }

  async function updateLeadStage(id:string,stage:string) {
    const { error } = await supabase.from("land_sales_leads").update({stage}).eq("id",id);
    if (error) setError(error.message); else await load();
  }

  async function signOut(){ await supabase.auth.signOut(); router.replace("/property-sales/login"); }
  async function copy(text:string){ await navigator.clipboard.writeText(text); }

  if (loading) return <main style={shell}><div style={card}><RefreshCw/> Cargando Sales Command Center…</div></main>;
  if (error && !profile) return <main style={shell}><div style={card}><b>No se pudo abrir el portal</b><p>{error}</p><button onClick={signOut}>Cerrar sesión</button></div></main>;
  if (!profile) return null;

  const isAdmin = profile.role === "admin";
  return <main style={shell}>
    <section style={{...card,maxWidth:1180,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:20,alignItems:"flex-start",flexWrap:"wrap"}}>
        <div><div style={{fontSize:12,fontWeight:900,letterSpacing:1.5,color:"#9a7935"}}>{isAdmin?"ADMINISTRADOR":"PORTAL DE VENDEDOR"}</div><h1 style={{margin:"8px 0",fontSize:36}}>{isAdmin?"Proyecto 812 · Sales Command Center":profile.full_name}</h1><div style={{color:"#60736c"}}>{isAdmin?"Control total de vendedores, leads, atribución y comisiones.":`Estado: ${profile.status} · Comisión asignada: ${profile.commission_rate}%`}</div></div>
        <div style={{display:"flex",gap:8}}><button style={button} onClick={()=>load()}><RefreshCw size={15}/> Actualizar</button><button style={button} onClick={signOut}><LogOut size={15}/> Salir</button></div>
      </div>

      {error && <div style={{marginTop:16,padding:12,borderRadius:12,background:"#fff0f0",color:"#8a2626"}}>{error}</div>}

      {!isAdmin && <div style={{marginTop:24,padding:18,borderRadius:16,background:profile.status==="active"?"#edf5ef":"#fff7df",border:"1px solid #e2ddcf"}}>
        {profile.status === "active" ? <><div style={{display:"flex",alignItems:"center",gap:8,fontWeight:900}}><ShieldCheck size={18}/> Tu enlace personal está activo</div><div style={{display:"flex",gap:8,marginTop:12,flexWrap:"wrap"}}><code style={{padding:12,background:"#fff",borderRadius:10,flex:1,minWidth:260}}>{referralLink}</code><button style={button} onClick={()=>copy(referralLink)}><Copy size={15}/> Copiar</button><a href={referralLink} target="_blank" style={{...button,textDecoration:"none"}}><ExternalLink size={15}/> Abrir</a></div><small style={{display:"block",marginTop:10,color:"#60736c"}}>Cada lead enviado desde este enlace queda vinculado a tu código y guarda una copia de tu tasa de comisión vigente al momento del registro.</small></> : <><b>Tu cuenta está pendiente de aprobación.</b><div style={{marginTop:6,color:"#60736c"}}>El administrador debe activarte y asignar la tasa de comisión antes de que tu enlace empiece a atribuir compradores.</div></>}
      </div>}

      <div style={kpiGrid}>
        <Kpi icon={<MousePointerClick/>} label="Clicks registrados" value={clicks}/>
        <Kpi icon={<UserRoundCheck/>} label="Leads" value={leads.length}/>
        <Kpi icon={<BadgeDollarSign/>} label="Comisiones registradas" value={`RD$${payable.toLocaleString("en-US")}`}/>
        {isAdmin && <Kpi icon={<Users/>} label="Vendedores" value={sellers.length}/>} 
      </div>

      {isAdmin && <section style={{marginTop:30}}><h2>Vendedores y corredores</h2><div style={{overflowX:"auto"}}><table style={table}><thead><tr><th>Vendedor</th><th>Estado</th><th>Comisión %</th><th>Link</th><th>Acciones</th></tr></thead><tbody>{sellers.map(s=><SellerRow key={s.id} seller={s} origin={origin} onSave={updateSeller}/>)}</tbody></table></div></section>}

      <section style={{marginTop:30}}><h2>{isAdmin?"Leads y compradores":"Mis compradores registrados"}</h2><div style={{overflowX:"auto"}}><table style={table}><thead><tr><th>Comprador</th><th>Contacto</th><th>Código</th><th>Comisión asegurada</th><th>Etapa</th></tr></thead><tbody>{leads.map(l=><tr key={l.id}><td><b>{l.buyer_name}</b><br/><small>{new Date(l.created_at).toLocaleDateString()}</small></td><td>{l.buyer_phone}<br/><small>{l.buyer_email||""}</small></td><td>{l.referral_code||"Directo"}</td><td>{Number(l.commission_rate_snapshot||0).toFixed(2)}%</td><td>{isAdmin?<select value={l.stage} onChange={e=>updateLeadStage(l.id,e.target.value)}>{["new","qualified","contacted","visit","offer","negotiation","closed_won","closed_lost"].map(x=><option key={x}>{x}</option>)}</select>:l.stage}</td></tr>)}</tbody></table></div></section>
    </section>
  </main>;
}

function SellerRow({seller,origin,onSave}:{seller:Profile;origin:string;onSave:(id:string,status:string,rate:number)=>Promise<void>}){
  const [status,setStatus]=useState(seller.status); const [rate,setRate]=useState(Number(seller.commission_rate||0));
  const link=`${origin}/cevicos?ref=${seller.referral_code}`;
  return <tr><td><b>{seller.full_name}</b><br/><small>{seller.company||seller.phone||""}</small></td><td><select value={status} onChange={e=>setStatus(e.target.value)}>{["pending","active","suspended","rejected"].map(x=><option key={x}>{x}</option>)}</select></td><td><input type="number" min="0" max="100" step="0.25" value={rate} onChange={e=>setRate(Number(e.target.value))} style={{width:80}}/></td><td><button style={miniButton} onClick={()=>navigator.clipboard.writeText(link)}><Copy size={13}/> {seller.referral_code}</button></td><td><button style={miniButton} onClick={()=>onSave(seller.id,status,rate)}>Guardar</button></td></tr>;
}
function Kpi({icon,label,value}:{icon:React.ReactNode;label:string;value:string|number}){return <article style={{padding:18,border:"1px solid #e2ddcf",borderRadius:16,background:"#fbfaf7"}}><div style={{color:"#9a7935"}}>{icon}</div><div style={{marginTop:12,color:"#60736c",fontSize:13}}>{label}</div><strong style={{display:"block",fontSize:28,marginTop:4}}>{value}</strong></article>}
const shell:React.CSSProperties={minHeight:"100vh",background:"#f5f2e9",padding:"32px 18px",color:"#173329"};
const card:React.CSSProperties={background:"white",border:"1px solid #e2ddcf",borderRadius:22,padding:24,boxShadow:"0 14px 44px rgba(23,51,41,.08)"};
const button:React.CSSProperties={display:"inline-flex",alignItems:"center",gap:7,padding:"10px 12px",borderRadius:10,border:"1px solid #d8d3c5",background:"#fff",color:"#173329",fontWeight:800,cursor:"pointer"};
const miniButton:React.CSSProperties={...button,padding:"7px 9px",fontSize:12};
const kpiGrid:React.CSSProperties={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:12,marginTop:24};
const table:React.CSSProperties={width:"100%",borderCollapse:"collapse",fontSize:14};

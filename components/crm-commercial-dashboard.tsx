"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Building2, CalendarDays, FileText, Gauge, Inbox, RefreshCw, Target, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useActiveTenant } from "@/components/tenant-context";
import CrmWorkspace from "@/components/crm-workspace";
import styles from "@/components/crm-commercial.module.css";

type Counts = { companies:number; contacts:number; opportunities:number; conversations:number; quotations:number; events:number };
type Deal = { id:string; title:string; status:string; next_action:string|null; next_action_at:string|null };
type Revenue = { current_mrr:number|null; open_pipeline_mrr:number|null; weighted_pipeline_mrr:number|null };
const blank:Counts={companies:0,contacts:0,opportunities:0,conversations:0,quotations:0,events:0};
const nav=[["","Inicio",Gauge],["companies","Empresas",Building2],["contacts","Contactos",Users],["revenue","Oportunidades",Target],["inbox","Conversaciones",Inbox],["quotations","Cotizaciones",FileText],["calendar","Calendario",CalendarDays]] as const;
const money=(value:number)=>new Intl.NumberFormat("es-DO",{style:"currency",currency:"DOP",maximumFractionDigits:0}).format(value||0);
function Metric({label,value,sub}:{label:string;value:string;sub:string}){
  return <div className="metric"><div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className="metric-sub">{sub}</div></div>;
}
export default function CrmCommercialDashboard(){
  const tenant=useActiveTenant(),tenantId=tenant?.tenant_id??null;
  const [counts,setCounts]=useState<Counts>({...blank});
  const [deals,setDeals]=useState<Deal[]>([]);
  const [revenue,setRevenue]=useState<Revenue|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [reload,setReload]=useState(0);
  useEffect(()=>{
    if(!tenantId){setLoading(false);return;}
    let alive=true;
    setLoading(true);setCounts({...blank});setDeals([]);setRevenue(null);setError("");
    (async()=>{
      try{
        const [companies,contacts,opportunities,conversations,quotations,events,openDeals,dashboard]=await Promise.all([
          supabase.from("companies").select("id",{count:"exact",head:true}).eq("tenant_id",tenantId),
          supabase.from("contacts").select("id",{count:"exact",head:true}).eq("tenant_id",tenantId),
          supabase.from("opportunities").select("id",{count:"exact",head:true}).eq("tenant_id",tenantId),
          supabase.from("conversations").select("id",{count:"exact",head:true}).eq("tenant_id",tenantId),
          supabase.from("quotations").select("id",{count:"exact",head:true}).eq("tenant_id",tenantId),
          supabase.from("calendar_events").select("id",{count:"exact",head:true}).eq("tenant_id",tenantId),
          supabase.from("opportunities").select("id,title,status,next_action,next_action_at").eq("tenant_id",tenantId).eq("status","open").order("next_action_at",{ascending:true,nullsFirst:false}).limit(8),
          supabase.from("revenue_command_center_dashboard").select("current_mrr,open_pipeline_mrr,weighted_pipeline_mrr").eq("tenant_id",tenantId).maybeSingle()
        ]);
        if(!alive)return;
        const err=[companies,contacts,opportunities,conversations,quotations,events,openDeals,dashboard].find(x=>x.error)?.error;
        if(err){setError("No se pudieron cargar algunos indicadores: "+err.message);return;}
        setCounts({companies:companies.count??0,contacts:contacts.count??0,opportunities:opportunities.count??0,conversations:conversations.count??0,quotations:quotations.count??0,events:events.count??0});
        setDeals((openDeals.data??[]) as Deal[]);
        setRevenue((dashboard.data as Revenue|null)??null);
      }catch{if(alive)setError("No se pudo cargar el panel. Verifica tu conexión.");}
      finally{if(alive)setLoading(false);}
    })();
    return()=>{alive=false;};
  },[tenantId,reload]);
  // Keep the existing first-access flow for users without a tenant.
  if(!tenantId)return <CrmWorkspace slug={[]} />;
  const due=deals.filter(d=>d.next_action_at&&new Date(d.next_action_at).getTime()<Date.now());
  return <div className="shell">
    <aside className="sidebar"><div className="brand"><strong>Look Social Media CRM</strong><span>{tenant?.tenant_name}</span></div>
      <nav className="nav" aria-label="Módulos del CRM">{nav.map(([key,label,Icon])=><Link key={key} href={"/crm"+(key?"/"+key:"")} className={key===""?"active":""}><Icon size={17}/>{label}</Link>)}</nav>
    </aside>
    <main className="content">
      <header className="topbar"><div><div className="eyebrow">Panel principal · LOOK SOCIAL MEDIA CRM</div><h1>Resumen de {tenant?.tenant_name}</h1></div>
        <div className="top-actions"><button className="button" type="button" onClick={()=>setReload(n=>n+1)}><RefreshCw size={16}/> Actualizar</button></div>
      </header>
      {error&&<div className="notice" role="alert">{error}</div>}
      <section className="dashboard-intro"><div className="eyebrow" style={{color:"#b6ddff"}}>Tu empresa en un solo lugar</div>
        <h2>Organiza clientes y convierte oportunidades en ventas.</h2>
        <p className="muted">Los indicadores corresponden únicamente a los registros de esta empresa.</p>
        <div className="dashboard-actions">
          <Link className="button primary" href="/crm/companies?new=1"><Building2 size={16}/> Nueva empresa</Link>
          <Link className="button" href="/crm/contacts?new=1"><Users size={16}/> Nuevo contacto</Link>
          <Link className="button" href="/crm/revenue"><Target size={16}/> Ver oportunidades</Link>
          <Link className="button" href="/crm/inbox"><Inbox size={16}/> Conversaciones</Link>
        </div>
      </section>
      {loading?<div role="status" className="loading">Cargando indicadores…</div>:<>
        <section className="grid dashboard-kpis section-gap" aria-label="Indicadores de esta empresa">
          <Metric label="Empresas" value={String(counts.companies)} sub="Registros de clientes"/>
          <Metric label="Contactos" value={String(counts.contacts)} sub="Personas registradas"/>
          <Metric label="Oportunidades" value={String(counts.opportunities)} sub="Todas las etapas"/>
          <Metric label="Cotizaciones" value={String(counts.quotations)} sub="Documentos registrados"/>
          <Metric label="Proceso abierto" value={money(Number(revenue?.open_pipeline_mrr??0))} sub="Valor registrado en el CRM"/>
          <Metric label="Ingresos recurrentes" value={money(Number(revenue?.current_mrr??0))} sub="MRR registrado"/>
          <Metric label="Conversaciones" value={String(counts.conversations)} sub="Mensajes de esta empresa"/>
          <Metric label="Eventos" value={String(counts.events)} sub="Calendario de la empresa"/>
        </section>
        <section className="grid two-col section-gap">
          <div className="card"><div className="eyebrow">Seguimiento comercial</div><h2>Próximas acciones</h2>
            {due.length>0&&<p className={styles.sectionIntro}>{due.length} acciones vencidas entre las primeras oportunidades consultadas.</p>}
            {deals.length===0?<div className="empty"><strong>Sin oportunidades abiertas</strong><div>Crea tu primera oportunidad desde el tablero de ventas.</div></div>:
            <div className={styles.companyList}>{deals.map(d=><div className="priority-item" key={d.id}><div><strong>{d.title}</strong>
                <p className={styles.sectionIntro}>{d.next_action??"Sin seguimiento programado"}</p>
                {d.next_action_at&&<small>{new Intl.DateTimeFormat("es-DO",{dateStyle:"medium",timeStyle:"short"}).format(new Date(d.next_action_at))}</small>}
              </div><Link className="button small" href="/crm/revenue">Gestionar</Link></div>)}</div>}
            <div className="section-gap"><Link href="/crm/revenue" className="button primary">Abrir tablero de ventas</Link></div>
          </div>
          <div className="card"><div className="eyebrow">Accesos rápidos</div><h2>Continúa trabajando</h2>
            <div className="stack gap-12">
              <Link className="button" href="/crm/companies">Gestionar empresas</Link>
              <Link className="button" href="/crm/contacts">Gestionar contactos</Link>
              <Link className="button" href="/crm/quotations">Abrir cotizaciones</Link>
              <Link className="button" href="/crm/calendar">Abrir calendario</Link>
            </div>
          </div>
        </section>
      </>}
    </main>
    <nav className="mobile-nav" aria-label="Navegación principal">{nav.slice(0,5).map(([key,label,Icon])=><Link key={key} href={"/crm"+(key?"/"+key:"")} aria-current={key===""?"page":undefined} className={key===""?"active":""}><Icon size={19}/><span>{label}</span></Link>)}</nav>
  </div>;
}

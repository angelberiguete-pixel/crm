"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Building2, CalendarDays, FileText, Gauge, Inbox, Bot, RefreshCw, Target, Users, BarChart3 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useActiveTenant } from "@/components/tenant-context";
import CrmWorkspace from "@/components/crm-workspace";
import BrandLogo from "@/components/brand-logo";
import PlatformCompaniesShortcut from "@/components/platform-companies-shortcut";
import EnergyServiceDashboard from "@/components/energy-service-dashboard";
import {useTenantBrand} from "@/components/tenant-brand-provider";
import styles from "@/components/crm-commercial.module.css";
import { CrmSidebar, CrmBottomNav } from "@/components/crm-app-navigation";

type Counts = { companies:number|null; contacts:number|null; opportunities:number|null; conversations:number|null; quotations:number|null; events:number|null };
type Deal = { id:string; title:string; status:string; next_action:string|null; next_action_at:string|null };
type Revenue = { current_mrr:number|null; open_pipeline_mrr:number|null; weighted_pipeline_mrr:number|null };
const blank:Counts={companies:null,contacts:null,opportunities:null,conversations:null,quotations:null,events:null};
const countText=(n:number|null)=>n===null?"—":String(n);
const nav=[["","Inicio",Gauge],["companies","Empresas",Building2],["contacts","Contactos",Users],["revenue","Oportunidades",Target],["inbox","Conversaciones",Inbox],["quotations","Cotizaciones",FileText],["calendar","Calendario",CalendarDays],["marketing","Marketing",BarChart3]] as const;
const money=(value:number)=>new Intl.NumberFormat("es-DO",{style:"currency",currency:"DOP",maximumFractionDigits:0}).format(value||0);
function Metric({label,value,sub}:{label:string;value:string;sub:string}){
  return <div className="metric"><div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className="metric-sub">{sub}</div></div>;
}
export default function CrmCommercialDashboard(){
  const tenant=useActiveTenant();
  if(tenant?.tenant_slug==="family-power")return <EnergyServiceDashboard/>;
  return <GeneralCommercialDashboard/>;
}
function GeneralCommercialDashboard(){
  const tenant=useActiveTenant(),tenantId=tenant?.tenant_id??null;
  const tenantBrand=useTenantBrand();
  const roleLabel=tenant?.membership_role==="owner"?"Propietario":tenant?.membership_role==="admin"?"Administrador":tenant?.membership_role==="manager"?"Gerente":tenant?.membership_role==="agent"?"Vendedor":"Equipo";
  const canManage=["owner","admin","manager"].includes(tenant?.membership_role??"");
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
        const requests=[companies,contacts,opportunities,conversations,quotations,events,openDeals,dashboard];
        const failures=requests.filter(r=>r.error);
        if(failures.length)setError("Algunos indicadores no pudieron cargarse. Los no disponibles se muestran con «—». Puedes pulsar Actualizar para intentarlo de nuevo.");
        setCounts({
          companies:companies.error?null:companies.count??0,
          contacts:contacts.error?null:contacts.count??0,
          opportunities:opportunities.error?null:opportunities.count??0,
          conversations:conversations.error?null:conversations.count??0,
          quotations:quotations.error?null:quotations.count??0,
          events:events.error?null:events.count??0
        });
        setDeals(openDeals.error?[]:(openDeals.data??[]) as Deal[]);
        setRevenue(dashboard.error?null:(dashboard.data as Revenue|null)??null);
      }catch{if(alive)setError("No se pudo cargar el panel. Verifica tu conexión.");}
      finally{if(alive)setLoading(false);}
    })();
    return()=>{alive=false;};
  },[tenantId,reload]);
  // Keep the existing first-access flow for users without a tenant.
  if(!tenantId)return <CrmWorkspace slug={[]} />;
  const due=deals.filter(d=>d.next_action_at&&new Date(d.next_action_at).getTime()<Date.now());
  return <div className="shell">
    <CrmSidebar activeSection="" />
    <main className="content">
      <header className="topbar"><div><div className="eyebrow">Panel principal · CRM personalizado</div><h1>Portal de {tenantBrand?.name??tenant?.tenant_name}</h1><p className="muted">Acceso: {roleLabel}</p></div>
        <div className="top-actions"><button className="button" type="button" onClick={()=>setReload(n=>n+1)}><RefreshCw size={16}/> Actualizar</button></div>
      </header>
      {error&&<div className="notice" role="alert">{error}</div>}
      <section className="dashboard-intro"><div className="eyebrow" style={{color:"#b6ddff"}}>Tu empresa en un solo lugar</div>
        <h2>{canManage?"Esto necesita tu atención hoy":"Continúa con tus clientes y seguimientos"}</h2>
        <p className="muted">{canManage?"Consulta los pendientes de tu equipo y toma la siguiente decisión.":"Revisa mensajes, contactos y oportunidades sin salir de tu espacio."}</p>
        <div className="dashboard-actions">
          {canManage?<Link className="button primary" href="/crm/contacts?new=1"><Users size={16}/> Nuevo cliente</Link>:<Link className="button primary" href="/crm/inbox"><Inbox size={16}/> Abrir mensajes</Link>}
          <Link className="button" href="/crm/contacts?new=1"><Users size={16}/> Nuevo contacto</Link>
          <Link className="button" href="/crm/revenue"><Target size={16}/> Ver oportunidades</Link>
          <Link className="button" href="/crm/inbox"><Inbox size={16}/> {canManage?"Conversaciones":"Mis conversaciones"}</Link>
        </div>
      </section>
      <section className="card crm-today-card section-gap" aria-label="Pendientes de hoy">
        <div className="eyebrow">Siguiente paso</div>
        <h2>{loading?"Consultando tus pendientes…":due.length>0?`${due.length} seguimiento${due.length===1?"":"s"} vencido${due.length===1?"":"s"}`:"Revisa tu trabajo pendiente"}</h2>
        <p className="muted">{loading?"Comprobando la información de tu empresa.":due.length>0?"Hay oportunidades que necesitan una próxima acción.":"Abre tus conversaciones o revisa el proceso comercial para continuar."}</p>
        <div className="dashboard-actions"><Link href="/crm/revenue" className="button primary"><Target size={16}/> Ver seguimientos</Link><Link href="/crm/inbox" className="button"><Inbox size={16}/> Ver mensajes</Link></div>
      </section>
      {loading?<div role="status" className="loading">Cargando indicadores…</div>:<>
        <section className="grid dashboard-kpis section-gap" aria-label="Indicadores de esta empresa">
          <Metric label={canManage?"Oportunidades":"Mis oportunidades"} value={countText(counts.opportunities)} sub="Oportunidades visibles"/>
          <Metric label="Conversaciones" value={countText(counts.conversations)} sub="Conversaciones del equipo"/>
          <Metric label="Seguimientos vencidos" value={String(due.length)} sub="Entre los próximos 8 registros"/>
          <Metric label="Cotizaciones" value={countText(counts.quotations)} sub="Documentos registrados"/>
          {canManage&&<Metric label="Contactos" value={countText(counts.contacts)} sub="Personas registradas"/>}
          {canManage&&<Metric label="Proceso abierto" value={revenue?money(Number(revenue.open_pipeline_mrr??0)):"—"} sub="Valor de oportunidades"/>}
        </section>
        {canManage&&counts.companies===0&&counts.contacts===0&&counts.opportunities===0&&<section className="card section-gap" aria-label="Primeros pasos comerciales">
          <div className="eyebrow">Primeros pasos · {tenant?.tenant_name}</div>
          <h2>Comienza a trabajar con clientes reales</h2>
          <p className="muted">Todavía no existen empresas, contactos ni oportunidades en este espacio. Completa el primer recorrido comercial sin añadir datos ficticios.</p>
          <div className="dashboard-actions">
            <Link className="button primary" href="/crm/companies?new=1">1. Registrar empresa</Link>
            <Link className="button" href="/crm/contacts?new=1">2. Registrar contacto</Link>
            <Link className="button" href="/crm/revenue">3. Crear oportunidad</Link>
            <Link className="button" href="/crm/quotations">4. Preparar cotización</Link>
          </div>
        </section>}
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
              {canManage&&<Link className="button" href="/crm/companies">Gestionar empresas</Link>}
              <Link className="button" href="/crm/contacts">Gestionar contactos</Link>
              {canManage&&<Link className="button" href="/crm/employees"><Bot size={16}/> Empleados digitales IA</Link>}
              {canManage&&<Link className="button" href="/crm/integrations">Integraciones de la empresa</Link>}
              {canManage&&<Link className="button" href="/crm/marketing"><BarChart3 size={16}/> Marketing y conversiones</Link>}
              <Link className="button" href="/crm/quotations">Abrir cotizaciones</Link>
              <Link className="button" href="/crm/calendar">Abrir calendario</Link>
            </div>
          </div>
        </section>
      </>}
    </main>
    <CrmBottomNav activeSection="" />
  </div>;
}

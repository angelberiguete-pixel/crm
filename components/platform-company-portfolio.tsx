"use client";
import Image from "next/image";
import Link from "next/link";
import {useCallback,useEffect,useState} from "react";
import {ArrowRight,Building2,RefreshCw,ShieldCheck} from "lucide-react";
import {supabase} from "@/lib/supabase";
import {notifyTenantContextChanged} from "@/lib/tenant-context-events";
import {safeTenantAsset,safeHex} from "@/lib/tenant-brand";
import {isCommercialClientTenant} from "@/lib/visible-client-tenants";
import styles from "./platform-company-portfolio.module.css";
type Tenant={tenant_id:string;tenant_name:string;tenant_slug:string;member_count:number;plan_code:string|null};
type Brand={brand_name:string|null;logo_url:string|null;logo_on_dark_url:string|null;primary_color:string|null};
type Money={currency:string;count:number;total?:number;accepted_total?:number;sent_count?:number;accepted_count?:number;open_amount?:number;won_amount?:number};
type Seller={user_id:string;role:string;assigned_conversations:number;conversations_replied_to:number;reply_messages:number;opportunities_assigned:number;opportunities_won:number;quotations_authored:number;quotations_by_currency:Money[]};
type Analytics={
 tenant_id:string;calculated_at:string;branding:Brand|null;
 counts:{contacts:number;crm_companies:number;conversations:number;assigned_conversations:number;unassigned_conversations:number;inbound_messages:number;human_reply_messages:number;quotations:number;opportunities:number;orders:number};
 quotations_by_currency:Money[];opportunities_by_currency:Money[];sellers:Seller[];
 channel_status:Array<{provider:string;name:string;status:string}>;
 invoices:{state:string;reason:string};meta_pixel:{state:string;reason:string};
};
type Member={user_id:string;email:string|null;membership_role:string;role_name:string|null};
const n=(v:number)=>new Intl.NumberFormat("es-DO").format(v);
const money=(v:number|undefined,c:string)=>{
 try{return new Intl.NumberFormat("es-DO",{style:"currency",currency:c,maximumFractionDigits:0}).format(Number(v||0));}
 catch{return c+" "+Number(v||0).toLocaleString("es-DO");}
};
function Logo({tenant,brand}:{tenant:Tenant;brand:Brand|null}){
 const fallback=tenant.tenant_slug==="family-power"?"/client-brands/family-power/logo-negativo-sin-fondo.svg":tenant.tenant_slug==="eurevector"?"/look-social-media-logo.svg":null;
 const src=safeTenantAsset(brand?.logo_on_dark_url)||safeTenantAsset(brand?.logo_url)||fallback;
 return <div className={styles.logo}>{src?<Image src={src} alt={"Logo de "+tenant.tenant_name} width={240} height={120} unoptimized/>:<strong>{tenant.tenant_name.slice(0,2).toUpperCase()}</strong>}</div>;
}
export default function PlatformCompanyPortfolio(){
 const [tenants,setTenants]=useState<Tenant[]>([]);
 const [selected,setSelected]=useState<string|null>(null);
 const [analytics,setAnalytics]=useState<Analytics|null>(null);
 const [members,setMembers]=useState<Member[]>([]);
 const [loading,setLoading]=useState(true);
 const [detailsLoading,setDetailsLoading]=useState(false);
 const [authorized,setAuthorized]=useState(false);
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 const [revision,setRevision]=useState(0);
 const load=useCallback(async()=>{
  setLoading(true);setError("");
  const u=await supabase.auth.getUser();
  if(!u.data.user){window.location.assign("/login");return;}
  const access=await supabase.rpc("platform_current_access");
  if(access.error||!(access.data as {is_platform_admin?:boolean}|null)?.is_platform_admin){setAuthorized(false);setLoading(false);return;}
  setAuthorized(true);
  const r=await supabase.rpc("platform_admin_tenants");
  if(r.error){setError(r.error.message);setLoading(false);return;}
  const rows=((r.data??[]) as Tenant[]).filter(t=>isCommercialClientTenant(t.tenant_slug));
  setTenants(rows);
  setSelected(id=>id&&rows.some(t=>t.tenant_id===id)?id:rows[0]?.tenant_id??null);
  setLoading(false);
 },[]);
 useEffect(()=>{void load()},[load]);
 useEffect(()=>{
  let active=true;
  if(!selected||!authorized)return;
  setAnalytics(null);setMembers([]);setDetailsLoading(true);
  void Promise.all([
    supabase.rpc("platform_admin_tenant_analytics",{p_tenant_id:selected}),
    supabase.rpc("platform_admin_members",{p_tenant_id:selected})
  ]).then(([a,m])=>{
    if(!active)return;
    if(a.error||m.error){setError((a.error??m.error)?.message||"Fallo consultando las estadísticas");return;}
    const obj=a.data as Analytics|null;
    if(obj?.tenant_id!==selected){setError("La consulta no corresponde a la empresa seleccionada.");return;}
    setAnalytics(obj);setMembers((m.data??[]) as Member[]);
  }).catch(()=>{if(active)setError("No se pudieron comprobar las estadísticas.");})
  .finally(()=>{if(active)setDetailsLoading(false);});
  return()=>{active=false;};
 },[selected,authorized,revision]);
 const tenant=tenants.find(t=>t.tenant_id===selected);
 const names=new Map(members.map(m=>[m.user_id,m.email||m.role_name||"Usuario autorizado"]));
 async function enter(){
  if(!tenant||busy)return;
  setBusy(true);setError("");
  const r=await supabase.rpc("platform_join_tenant_as_admin",{p_tenant_id:tenant.tenant_id});
  if(r.error){setError(r.error.message);setBusy(false);return;}
  const lock=await supabase.rpc("crm_lock_client_portal",{p_tenant_id:chosen.tenant_id});
  if(lock.error){setError("No se pudo aislar la sesión del cliente. "+lock.error.message);setBusy(false);return;}
  notifyTenantContextChanged();
  window.location.assign("/crm");
 }
 if(loading)return <main className={styles.page}>Cargando empresas…</main>;
 if(!authorized)return <main className={styles.page}><h1>Acceso de propietario requerido</h1><p>Esta sección está reservada a la administración global.</p><Link href="/crm">Volver al CRM</Link></main>;
 return <main className={styles.page}>
  <header className={styles.top}>
   <div><p className={styles.eyebrow}><ShieldCheck size={16}/> Control de plataforma</p><h1>Mis empresas</h1><p>Todos los espacios comerciales que administras, sin mezclar sus datos.</p></div>
   <div className={styles.actions}><Link href="/crm">Volver al CRM</Link><Link href="/platform-admin">Configuración</Link><button onClick={()=>{void load();setRevision(v=>v+1);}} type="button"><RefreshCw size={15}/> Actualizar</button></div>
  </header>
  {error&&<div className={styles.warning} role="alert">{error}</div>}
  <h2>Empresas registradas <small>({n(tenants.length)})</small></h2>
  <div className={styles.cards}>{tenants.map(t=>{
    const b=t.tenant_id===selected?analytics?.branding||null:null;
    return <button type="button" key={t.tenant_id} className={[styles.tile,t.tenant_id===selected?styles.active:""].join(" ")}
      style={{borderTopColor:safeHex(b?.primary_color,"#6489d6")}} aria-pressed={t.tenant_id===selected}
      onClick={()=>{setError("");setSelected(t.tenant_id);}}>
      <Logo tenant={t} brand={b}/><strong>{b?.brand_name||t.tenant_name}</strong>
      <small>{t.tenant_slug==="eurevector"?"Operación propia":"Empresa cliente"} · {n(t.member_count||0)} usuarios registrados</small>
      <span>Ver panel <ArrowRight size={16}/></span>
    </button>;
  })}</div>
  {tenant&&<section className={styles.panel}>
    <header className={styles.detailHead}><div><p className={styles.eyebrow}>Estadísticas registradas · {tenant.tenant_name}</p><h2>Panel de administración</h2><p>No se confunden oportunidades proyectadas con ventas, facturas o cobros.</p></div>
     <button className={styles.enter} type="button" disabled={busy} onClick={()=>void enter()}><ShieldCheck size={16}/>{busy?"Abriendo…":"Entrar como administrador"}<ArrowRight size={16}/></button></header>
    {detailsLoading?<p role="status">Comprobando registros de esta empresa…</p>:analytics&&<>
      <div className={styles.kpis}>{([
        ["Contactos",analytics.counts.contacts,"Registros de clientes"],
        ["Conversaciones",analytics.counts.conversations,"Hilos guardados"],
        ["Asignadas",analytics.counts.assigned_conversations,"Con vendedor responsable"],
        ["Mensajes recibidos",analytics.counts.inbound_messages,"Entrantes registrados"],
        ["Respuestas humanas",analytics.counts.human_reply_messages,"Salientes atribuidos"],
        ["Cotizaciones",analytics.counts.quotations,"Presupuestos registrados"],
        ["Oportunidades",analytics.counts.opportunities,"Incluye prospectos importados"],
        ["Órdenes",analytics.counts.orders,"Órdenes del CRM"]
      ] as [string,number,string][]).map(([title,value,desc])=><div className={styles.kpi} key={title}><span>{title}</span><strong>{n(value)}</strong><small>{desc}</small></div>)}</div>
      <div className={styles.double}>
        <section className={styles.block}><h3>Cotizaciones por moneda</h3>{analytics.quotations_by_currency.length===0?<p>Sin cotizaciones registradas.</p>:analytics.quotations_by_currency.map(q=><div className={styles.moneyRow} key={q.currency}><strong>{q.currency} · {n(q.count)} documentos</strong><span>Total cotizado: {money(q.total,q.currency)}</span><span>Aceptado: {money(q.accepted_total,q.currency)}</span><small>{n(q.sent_count||0)} enviadas · {n(q.accepted_count||0)} aceptadas</small></div>)}</section>
        <section className={styles.block}><h3>Oportunidades · no son ingresos</h3>{analytics.opportunities_by_currency.length===0?<p>Sin oportunidades.</p>:analytics.opportunities_by_currency.map(q=><div className={styles.moneyRow} key={q.currency}><strong>{q.currency} · {n(q.count)} registros</strong><span>Estimado abierto: {money(q.open_amount,q.currency)}</span><span>Registrado como ganado: {money(q.won_amount,q.currency)}</span><small>Valores del pipeline; no equivalen a facturas verificadas.</small></div>)}</section>
      </div>
      <section className={styles.block}><h3>Resultados por vendedor</h3>
      <div className={styles.scroller}><table><thead><tr><th>Usuario</th><th>Asignadas</th><th>Conversaciones respondidas</th><th>Respuestas</th><th>Oportunidades</th><th>Ganadas</th><th>Cotizaciones</th></tr></thead>
      <tbody>{analytics.sellers.map(s=><tr key={s.user_id}><th>{names.get(s.user_id)||s.user_id.slice(0,8)}<small>{s.role}</small></th><td>{n(s.assigned_conversations)}</td><td>{n(s.conversations_replied_to)}</td><td>{n(s.reply_messages)}</td><td>{n(s.opportunities_assigned)}</td><td>{n(s.opportunities_won)}</td><td>{n(s.quotations_authored)}{s.quotations_by_currency.map(q=><small key={q.currency}>{money(q.total,q.currency)}</small>)}</td></tr>)}
      {analytics.sellers.length===0&&<tr><td colSpan={7}>Aún no hay responsables activos.</td></tr>}</tbody></table></div><p className={styles.muted}>Las respuestas sólo cuentan mensajes salientes reales atribuidos a cada usuario. Sin eventos no se inventan tiempos ni resultados.</p>
      </section>
      <div className={styles.double}>
       <section className={styles.block}><h3>Facturas y cobros</h3><p><strong>Sin integración comercial verificada.</strong></p><p>Las facturas de la plataforma no se contabilizan como facturación de los clientes. Se requiere un ERP o emisor de facturas conectado.</p></section>
       <section className={styles.block}><h3>Meta Pixel y Facebook Ads</h3><p><strong>Sin telemetría de Pixel/CAPI conectada.</strong></p><p>No podemos atribuir eventos, conversiones o campañas sin los permisos y eventos reales del negocio.</p></section>
      </div>
      <section className={styles.block}><h3>Canales de esta empresa</h3><div className={styles.channels}>{analytics.channel_status.map((c,i)=><span key={i}>{c.name}: <strong>{c.status==="connected"?"Conectado":c.status==="disconnected"?"Sin conectar":c.status}</strong></span>)}</div><p className={styles.muted}>El estado configurado no sustituye una prueba de mensajes entrantes y salientes.</p></section>
      <p className={styles.muted}>Fuente: registros de Supabase, consultados {new Intl.DateTimeFormat("es-DO",{dateStyle:"medium",timeStyle:"short"}).format(new Date(analytics.calculated_at))}.</p>
    </>}
  </section>}
 </main>;
}

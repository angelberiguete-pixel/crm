"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, Building2, CheckCircle2, ChevronRight, Database, ExternalLink, Layers3, LogOut, Plus, RefreshCw, Settings2, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { notifyTenantContextChanged } from "@/lib/tenant-context-events";
import BrandLogo from "@/components/brand-logo";
import { isCommercialClientTenant } from "@/lib/visible-client-tenants";

type Tenant = { tenant_id:string; tenant_name:string; tenant_slug:string; owner_user_id:string|null; plan_code:string|null; subscription_status:string|null; member_count:number; created_at:string };
type Plan = { id:string; code:string; name:string; monthly_price_cents:number; is_active:boolean };
type Module = { module_key:string; module_name:string; enabled:boolean; source:string; config:Record<string,unknown> };
type TenantRole={role_key:string;role_name:string};
type Member = { user_id:string; email:string|null; membership_role:string; membership_status:string; role_key:string|null; role_name:string|null };
type ReadinessCheck={key:string;label:string;detail:string;status:"passed"|"action_required"|"not_verified"};
type Readiness={tenant_id:string;account_onboarding_status:string;verified_configuration:number;required_actions:number;manual_checks:number;ready_for_commercial_activation:boolean;checks:ReadinessCheck[]};
type Snapshot = { tenant?:{id:string;name:string;slug:string}; metrics?:{companies:number;contacts:number;open_opportunities:number;won_opportunities:number;won_mrr:number;open_mrr:number;conversations:number;products:number}; settings?:{brand_name?:string|null;support_email?:string|null;primary_color?:string|null;hide_platform_branding?:boolean;country_code?:string|null;currency?:string|null;timezone?:string|null;locale?:string|null}|null; agency_account?:{status:string;onboarding_status:string;monthly_recurring_cents:number;setup_fee_cents:number;vertical:string|null;template_key:string|null;customizations:Record<string,unknown>}|null; odoo?:Array<{id:string;provider:string;name:string;base_url:string;database_name:string|null;status:string;sync_direction:string;last_healthcheck_at:string|null;last_error:string|null}>; channels?:Array<{provider:string;name:string;status:string}>; lead_pages?:number };

const usd=(cents:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format((Number(cents)||0)/100);
const dop=(value:number)=>new Intl.NumberFormat("es-DO",{style:"currency",currency:"DOP",maximumFractionDigits:0}).format(Number(value)||0);
const slugify=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,64);

export default function EurevectorConsole(){
 const router=useRouter(); const[loading,setLoading]=useState(true); const[notice,setNotice]=useState("");
 const[tenants,setTenants]=useState<Tenant[]>([]); const[plans,setPlans]=useState<Plan[]>([]); const[selectedId,setSelectedId]=useState<string|null>(null);
 const[showTechnical,setShowTechnical]=useState(false);
 const commercialTenants=useMemo(()=>tenants.filter(t=>isCommercialClientTenant(t.tenant_slug)),[tenants]);
 const visibleTenants=showTechnical?tenants:commercialTenants;
 const selectedRef=useRef<string|null>(null); const requestVersion=useRef(0); const[tenantLoading,setTenantLoading]=useState(false);
 const[modules,setModules]=useState<Module[]>([]); const[members,setMembers]=useState<Member[]>([]);const[tenantRoles,setTenantRoles]=useState<TenantRole[]>([]);const[memberEmail,setMemberEmail]=useState("");const[memberRole,setMemberRole]=useState("viewer");const[linkingMember,setLinkingMember]=useState(false); const[snapshot,setSnapshot]=useState<Snapshot|null>(null);const[readiness,setReadiness]=useState<Readiness|null>(null);
 const[brand,setBrand]=useState(""); const[support,setSupport]=useState(""); const[color,setColor]=useState("#0f766e"); const[whiteLabel,setWhiteLabel]=useState(false);
 const[country,setCountry]=useState(""); const[currency,setCurrency]=useState("DOP"); const[timezone,setTimezone]=useState("America/Santo_Domingo"); const[locale,setLocale]=useState("es-DO");
 const[odooUrl,setOdooUrl]=useState(""); const[odooDb,setOdooDb]=useState(""); const[odooDirection,setOdooDirection]=useState("bidirectional");
 const[newName,setNewName]=useState(""); const[newSlug,setNewSlug]=useState(""); const[newPlan,setNewPlan]=useState("starter"); const[newVertical,setNewVertical]=useState(""); const[newTemplate,setNewTemplate]=useState(""); const[creating,setCreating]=useState(false);
 const selected=useMemo(()=>tenants.find(t=>t.tenant_id===selectedId)??null,[tenants,selectedId]);
 const chooseTenant=(id:string)=>{setNotice("");selectedRef.current=id;requestVersion.current++;setSelectedId(id);setSnapshot(null);setReadiness(null);setModules([]);setMembers([]);setTenantRoles([]);setMemberEmail("");setMemberRole("viewer");setTenantLoading(true);setBrand("");setSupport("");setOdooUrl("");setOdooDb("");setCountry("");setCurrency("");setTimezone("");setLocale("");};

 const loadPlatform=useCallback(async()=>{setLoading(true);setNotice("");const{data:{session}}=await supabase.auth.getSession();if(!session){router.replace('/login');return}const access=await supabase.rpc('platform_current_access');if(access.error){setNotice(access.error.message);setLoading(false);return}if(!(access.data as any)?.is_platform_admin){setNotice('Tu usuario no tiene acceso de Platform Admin.');setLoading(false);return}const[t,p]=await Promise.all([supabase.rpc('platform_admin_tenants'),supabase.from('plans').select('id,code,name,monthly_price_cents,is_active').eq('is_active',true).order('monthly_price_cents')]);if(t.error||p.error){setNotice((t.error??p.error)?.message??'No se pudo cargar la plataforma');setLoading(false);return}const rows=(t.data??[]) as Tenant[];setTenants(rows);setPlans((p.data??[]) as Plan[]);setSelectedId(cur=>cur&&rows.some(x=>x.tenant_id===cur&&isCommercialClientTenant(x.tenant_slug))?cur:rows.find(x=>isCommercialClientTenant(x.tenant_slug))?.tenant_id??rows[0]?.tenant_id??null);setLoading(false)},[router]);
 const loadTenant=useCallback(async(id:string)=>{
   if(selectedRef.current!==id)return;
   const ticket=++requestVersion.current;
   setTenantLoading(true);setSnapshot(null);setReadiness(null);setModules([]);setMembers([]);setTenantRoles([]);
   const[s,m,u,readinessResult,tenantRoleResult]=await Promise.all([
     supabase.rpc('platform_admin_tenant_snapshot',{p_tenant_id:id}),
     supabase.rpc('tenant_effective_modules',{p_tenant_id:id}),
     supabase.rpc('platform_admin_members',{p_tenant_id:id}),
     supabase.rpc('platform_client_readiness',{p_tenant_id:id}),
     supabase.rpc('platform_admin_tenant_roles',{p_tenant_id:id})
   ]);
   if(ticket!==requestVersion.current||selectedRef.current!==id)return;
   const err=s.error??m.error??u.error??readinessResult.error??tenantRoleResult.error;
   setTenantLoading(false);
   if(err){setNotice(err.message);return;}
   const snap=(s.data??{}) as Snapshot;
   setSnapshot(snap);setReadiness(readinessResult.data as Readiness);setModules((m.data??[]) as Module[]);setMembers((u.data??[]) as Member[]);setTenantRoles((tenantRoleResult.data??[]) as TenantRole[]);
   setBrand(snap.settings?.brand_name??snap.tenant?.name??'');
   setSupport(snap.settings?.support_email??'');
   setColor(snap.settings?.primary_color??'#0f766e');
   setWhiteLabel(Boolean(snap.settings?.hide_platform_branding));
   setCountry(snap.settings?.country_code??'');
   setCurrency(snap.settings?.currency??'');
   setTimezone(snap.settings?.timezone??'');
   setLocale(snap.settings?.locale??'');
   const o=snap.odoo?.[0];
   setOdooUrl(o?.base_url??'');setOdooDb(o?.database_name??'');
   setOdooDirection(o?.sync_direction??'bidirectional');
 },[]);
 useEffect(()=>{loadPlatform()},[loadPlatform]);
 useEffect(()=>{selectedRef.current=selectedId;if(selectedId)void loadTenant(selectedId);else{requestVersion.current++;setTenantLoading(false);setSnapshot(null);setReadiness(null);setModules([]);setMembers([]);setTenantRoles([])}return()=>{requestVersion.current++}},[selectedId,loadTenant]);
 async function createClient(e:FormEvent){
  e.preventDefault();
  const name=newName.trim(),slug=(newSlug.trim()||slugify(name));
  if(name.length<2||slug.length<3){setNotice('Completa un nombre y un identificador válidos.');return}
  if(slug==='family-power' && name!=='Family Power'){setNotice('Utiliza el nombre Family Power para aplicar su identidad aprobada.');return}
  const existing=tenants.find(t=>t.tenant_slug===slug);
  if(existing){chooseTenant(existing.tenant_id);setNotice('Este cliente ya existe. No se ha creado un duplicado.');return}
  setCreating(true);setNotice('');
  const r=slug==='family-power'
    ? await supabase.rpc('platform_create_family_power_tenant',{p_plan_code:newPlan})
    : await supabase.rpc('platform_create_client_tenant',{p_name:name,p_slug:slug,p_plan_code:newPlan,p_vertical:newVertical.trim()||null,p_template_key:newTemplate||null});
  setCreating(false);
  if(r.error){setNotice(r.error.message);return}
  const id=typeof r.data==='string'?r.data:typeof (r.data as {tenant_id?:unknown}|null)?.tenant_id==='string'?(r.data as {tenant_id:string}).tenant_id:null;
  setNewName('');setNewSlug('');setNewVertical('');setNewTemplate('');
  await loadPlatform();
  if(id)chooseTenant(id);
  setNotice(id?'Cliente creado; verifica sus módulos, usuarios y acceso antes de la entrega.':'El servidor procesó el alta sin devolver un identificador. Verifica la lista antes de reintentar.');
 }
 async function assignPlan(code:string){if(!selectedId||selectedRef.current!==selectedId||tenantLoading)return;const r=await supabase.rpc('platform_assign_plan',{p_tenant_id:selectedId,p_plan_code:code});if(r.error)return setNotice(r.error.message);await loadPlatform();await loadTenant(selectedId);setNotice('Plan actualizado.')}
 async function toggleModule(mod:Module){if(!selectedId||selectedRef.current!==selectedId||tenantLoading)return;const r=await supabase.rpc('platform_set_tenant_module',{p_tenant_id:selectedId,p_module_key:mod.module_key,p_enabled:!mod.enabled,p_config:mod.config??{}});if(r.error)return setNotice(r.error.message);await loadTenant(selectedId)}
 async function enter(path:'/crm'|'/ventas'){if(!selectedId||selectedRef.current!==selectedId||tenantLoading)return;const r=await supabase.rpc('platform_join_tenant_as_admin',{p_tenant_id:selectedId});if(r.error)return setNotice(r.error.message);if(selectedRef.current!==selectedId)return;notifyTenantContextChanged();window.location.href=path}
 async function saveBrand(e:FormEvent){e.preventDefault();if(!selectedId||selectedRef.current!==selectedId||tenantLoading)return;const r=await supabase.rpc('platform_update_tenant_settings',{p_tenant_id:selectedId,p_brand_name:brand,p_support_email:support,p_primary_color:color,p_hide_platform_branding:whiteLabel});if(r.error)return setNotice(r.error.message);await loadTenant(selectedId);setNotice('Personalización guardada.')}
 async function linkExistingAccount(e:FormEvent){
   e.preventDefault();if(!selectedId||selectedRef.current!==selectedId||tenantLoading||linkingMember)return;
   const target=selectedId;setNotice("");setLinkingMember(true);
   try{
     const r=await supabase.rpc("platform_link_existing_user",{p_tenant_id:target,p_email:memberEmail.trim(),p_role_key:memberRole});
     if(selectedRef.current!==target)return;
     if(r.error){setNotice(r.error.message);return;}
     setMemberEmail("");await loadTenant(target);
     if(selectedRef.current===target)setNotice("Usuario vinculado a esta empresa. No se ha enviado correo; necesita sus credenciales existentes.");
   }finally{setLinkingMember(false);}
 }
 async function saveRegion(e:FormEvent){e.preventDefault();if(!selectedId||selectedRef.current!==selectedId||tenantLoading)return;
   const target=selectedId;const r=await supabase.rpc("platform_update_client_locale",{p_tenant_id:target,p_country_code:country,p_currency:currency,p_timezone:timezone,p_locale:locale});
   if(r.error){if(selectedRef.current===target)setNotice(r.error.message);return;}
   if(selectedRef.current!==target)return;
   await loadTenant(target);setNotice("País, moneda y zona horaria guardados con auditoría.");
 }
 async function saveOdoo(e:FormEvent){e.preventDefault();if(!selectedId||selectedRef.current!==selectedId||tenantLoading)return;const r=await supabase.rpc('platform_configure_odoo',{p_tenant_id:selectedId,p_base_url:odooUrl,p_database_name:odooDb||null,p_sync_direction:odooDirection});if(r.error)return setNotice(r.error.message);await loadTenant(selectedId);setNotice('Odoo configurado. Las credenciales se gestionan fuera del navegador.')}
 if(loading)return <div className="loading">Abriendo administración de empresas…</div>; const metrics=snapshot?.metrics??{companies:0,contacts:0,open_opportunities:0,won_opportunities:0,won_mrr:0,open_mrr:0,conversations:0,products:0};
 return <div className="shell"><aside className="sidebar"><div className="brand"><BrandLogo size="sidebar"/><span>Administración de clientes</span></div><nav className="nav"><a className="active" href="#clientes"><Building2 size={17}/>Mis empresas cliente</a><a href="#resultado"><BarChart3 size={17}/>Resultados</a><a href="#personalizacion"><Settings2 size={17}/>Personalización</a><a href="#localizacion"><Settings2 size={17}/>País y moneda</a><a href="#readiness"><CheckCircle2 size={17}/>Verificación</a><a href="#onboarding-users"><Users size={17}/>Usuarios</a><a href="#modulos"><Layers3 size={17}/>Módulos</a><a href="#odoo"><Database size={17}/>Odoo / ERP</a><Link href="/ventas"><ChevronRight size={17}/>Ventas LOOK SOCIAL MEDIA</Link></nav><div className="sidebar-footer"><div className="muted">Platform Owner</div><button className="text-button" onClick={async()=>{await supabase.auth.signOut();router.replace('/login')}}><LogOut size={14}/> Salir</button></div></aside>
 <main className="content"><header className="topbar"><div><div className="eyebrow">Control global de la agencia y SaaS</div><div className="platform-brand-head"><BrandLogo size="compact"/><div><h1>Administración de empresas</h1><p className="muted">Acceso de propietario · Configura cada cliente y sus usuarios</p></div></div></div><div className="top-actions"><button className="button" onClick={loadPlatform}><RefreshCw size={14}/> Actualizar</button><button type="button" className="button mobile-only" onClick={async()=>{const r=await supabase.auth.signOut();if(r.error)return setNotice("No se pudo cerrar la sesión. Intenta nuevamente.");router.replace("/login");}}>Salir</button></div></header>{notice&&<div className="notice" style={{marginBottom:16}}>{notice}</div>}
 <section className="grid metrics" style={{marginBottom:16}}><Metric label="Empresas cliente" value={String(commercialTenants.length)} sub="Excluye demostraciones y entornos QA"/><Metric label="Usuarios" value={String(commercialTenants.reduce((n,t)=>n+Number(t.member_count||0),0))} sub="Miembros de empresas cliente"/><Metric label="Planes" value={String(plans.length)} sub="Essential · Growth · Scale"/><Metric label="Control" value="Activo" sub="Platform Admin"/></section>
 <section className="grid two-col" id="clientes"><div className="card"><h2>Mis empresas cliente</h2><p className="muted">Selecciona una empresa para ver sus cuentas, indicadores y abrir su CRM. Los entornos QA no cuentan como clientes.</p><div style={{margin:"12px 0"}}><Link className="button" href="/platform-admin/control">Administración avanzada de roles e invitaciones <ChevronRight size={14}/></Link></div><label className="platform-technical-toggle"><input type="checkbox" checked={showTechnical} onChange={e=>setShowTechnical(e.target.checked)}/> Mostrar entornos técnicos de pruebas ({tenants.length-commercialTenants.length})</label><div className="platform-company-cards" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,220px),1fr))",gap:12,marginTop:14}}>{visibleTenants.map(t=><button type="button" key={t.tenant_id} aria-pressed={selectedId===t.tenant_id} aria-label={`Gestionar empresa ${t.tenant_name}`} onClick={()=>chooseTenant(t.tenant_id)} style={{textAlign:"left",background:"var(--card, #151a24)",color:"inherit",border:selectedId===t.tenant_id?"2px solid #647df8":"1px solid #6b728055",borderRadius:14,padding:16,minHeight:190,cursor:"pointer",display:"flex",flexDirection:"column",gap:9}}><div style={{height:62,display:"flex",alignItems:"center",justifyContent:"center",background:t.tenant_slug==="family-power"?"#101115":"transparent",borderRadius:10,padding:7}}>{t.tenant_slug==="family-power"?<img src="/client-brands/family-power/logo-negativo.svg" width={185} height={55} alt="Logo oficial Family Power" style={{maxWidth:"100%",maxHeight:"100%",objectFit:"contain"}}/>:t.tenant_slug==="eurevector"?<BrandLogo size="compact"/>:<span aria-hidden="true" style={{fontSize:30,fontWeight:800}}>{t.tenant_name.slice(0,2).toUpperCase()}</span>}</div><strong style={{fontSize:17}}>{t.tenant_name}</strong><span className="muted" style={{fontSize:12}}>{t.tenant_slug} · {t.plan_code??"Sin plan"}</span><span className="muted" style={{fontSize:12}}>{t.member_count} cuenta(s) · {t.subscription_status??"Estado sin verificar"}</span><span style={{fontWeight:700,marginTop:"auto"}}>{selectedId===t.tenant_id?"Empresa seleccionada":"Ver panel y cuentas →"}</span></button>)}</div>{visibleTenants.length===0&&<p className="muted">No hay empresas cliente registradas. Usa el alta de la derecha.</p>}</div>
 <form className="card" onSubmit={createClient}><div className="eyebrow">Incorporación de clientes</div><div style={{background:"#111317",borderRadius:12,padding:12,marginBottom:14}}><img src="/client-brands/family-power/logo-negativo.svg" width={185} height={65} alt="Family Power" style={{objectFit:"contain",maxWidth:"100%"}}/><p style={{color:"#e5e7eb",fontSize:13}}>Cliente de energía e instalaciones. Sin duplicar el CRM ni iniciar cobros.</p><button type="button" className="button" onClick={()=>{const t=tenants.find(x=>x.tenant_slug==="family-power");if(t){chooseTenant(t.tenant_id);setNotice("Family Power ya existe; se abrió su ficha.");return}setNewName("Family Power");setNewSlug("family-power");setNewVertical("Energía e instalaciones");setNewTemplate("energia-instalaciones");setNotice("Preparado: comprueba el plan y pulsa Crear cliente para darlo de alta.");}}>Preparar Family Power</button></div><h2>Agregar empresa cliente</h2><p className="muted">Provisiona un workspace aislado y reutilizable desde la plataforma.</p><div className="stack gap-12"><label>Nombre<input value={newName} onChange={e=>{setNewName(e.target.value);if(!newSlug)setNewSlug(slugify(e.target.value))}} placeholder="Proyecto 812 Tareas — Cevicos" required/></label><label>Identificador interno<input value={newSlug} onChange={e=>setNewSlug(slugify(e.target.value))} placeholder="proyecto-812-cevicos" required/></label><label>Plan<select value={newPlan} onChange={e=>setNewPlan(e.target.value)}>{plans.map(p=><option key={p.id} value={p.code}>{p.name} · {usd(p.monthly_price_cents)}/mes</option>)}</select></label><label>Sector<input value={newVertical} onChange={e=>setNewVertical(e.target.value)} placeholder="Clínicas / servicios / comercio"/></label><label>Plantilla<select value={newTemplate} onChange={e=>setNewTemplate(e.target.value)}><option value="">CRM base</option><option value="cita-24">Sistema Cita-24</option><option value="energia-instalaciones">Energía e instalaciones</option></select></label><button className="button primary" disabled={creating}><Plus size={14}/>{creating?' Creando…':' Crear cliente'}</button></div></form></section>
 {selected&&<div className="stack gap-16 section-gap"><section className="card"><div className="eyebrow">Cliente seleccionado</div><h2>{selected.tenant_name}</h2><p className="muted">Entra al mismo tenant en el que trabaja su equipo, sin mezclar datos.</p>{tenantLoading&&<p role="status">Validando datos y permisos del cliente seleccionado…</p>}<div className="top-actions"><label>Plan <select disabled={tenantLoading} value={selected.plan_code??''} onChange={e=>e.target.value&&assignPlan(e.target.value)}>{plans.map(p=><option value={p.code} key={p.id}>{p.name}</option>)}</select></label><button className="button primary" disabled={tenantLoading} onClick={()=>enter('/crm')}>Entrar al CRM <ExternalLink size={13}/></button>{selected.tenant_slug==="family-power"&&<Link className="button" href="/family-power/login" target="_blank" rel="noopener noreferrer">Ver inicio de sesión del cliente</Link>}<button className="button" disabled={tenantLoading} onClick={()=>enter('/ventas')}>Abrir Ventas</button></div></section>
 <section className="card" id="onboarding-users" aria-label="Vincular cuenta existente al cliente">
 <div className="eyebrow">Onboarding · Equipo del cliente</div>
 <h2>Vincular usuario ya registrado</h2>
 <p className="muted">Usa el correo exacto de una cuenta con email verificado en esta plataforma. Esta acción asigna acceso y rol inmediatamente. No crea contraseñas ni envía invitaciones por email.</p>
 <form className="stack gap-12" onSubmit={linkExistingAccount}>
  <label>Correo de la cuenta existente<input type="email" autoComplete="off" value={memberEmail} onChange={e=>setMemberEmail(e.target.value)} required disabled={tenantLoading||linkingMember}/></label>
  <label>Rol de acceso<select value={memberRole} onChange={e=>setMemberRole(e.target.value)} disabled={tenantLoading||linkingMember}>
  {tenantRoles.filter(x=>x.role_key!=="owner").map(x=><option key={x.role_key} value={x.role_key}>{x.role_name}</option>)}
  </select></label>
  <button className="button primary" type="submit" disabled={tenantLoading||linkingMember||!memberEmail.trim()||!tenantRoles.some(x=>x.role_key===memberRole)}>{linkingMember?"Vinculando…":"Vincular usuario"}</button>
 </form>
 <div className="stack gap-12"><h3>Miembros registrados</h3>
 {members.map(m=><div className="priority-item" key={m.user_id}>
  <div><strong>{m.email??m.user_id.slice(0,8)}</strong><p className="muted">{m.role_name??m.membership_role}</p></div>
  <span className="pill">{m.membership_status}</span>
 </div>)}
 {!members.length&&<p className="muted">Todavía no hay miembros visibles para esta cuenta.</p>}</div>
 </section>
 <section className="card" id="readiness" aria-label="Verificación de activación del cliente">
   <div className="eyebrow">Evidencia real por empresa</div>
   <div className="topbar"><h2>Verificación antes de entregar al cliente</h2>
   <button type="button" className="button" disabled={tenantLoading} onClick={()=>selectedId&&void loadTenant(selectedId)}><RefreshCw size={14}/> Verificar</button></div>
   <p className="muted">Este panel lee datos de Supabase. Las pruebas de correo, integraciones, cobros y sesiones reales requieren comprobaciones adicionales. Nunca marca el negocio como listo automáticamente.</p>
   {tenantLoading ? <p role="status">Comprobando configuraciones…</p> :
   !readiness ? <p role="alert">No se pudo obtener la verificación del cliente.</p> : <>
    <p data-testid="client-readiness-status"><strong>Configuraciones comprobadas: {readiness.verified_configuration}</strong> · {readiness.required_actions} acciones necesarias · {readiness.manual_checks} pruebas reales pendientes</p>
    <p className="muted">Estado administrativo registrado: {readiness.account_onboarding_status}. Autorización comercial: pendiente de revisión manual.</p>
    <div className="stack gap-12">{readiness.checks.map(check=><div className="priority-item" key={check.key}>
     <div><strong>{check.label}</strong><p className="muted">{check.detail}</p></div>
     <span className="pill" style={{whiteSpace:"nowrap"}}>{check.status==="passed"?"Comprobado":check.status==="action_required"?"Pendiente":"Sin verificar"}</span>
    </div>)}</div>
   </>}
 </section>
 <section id="resultado"><div className="grid metrics"><Metric label="Empresas" value={String(metrics.companies)} sub="Cuentas"/><Metric label="Contactos" value={String(metrics.contacts)} sub="Personas / leads"/><Metric label="Pipeline" value={String(metrics.open_opportunities)} sub={dop(metrics.open_mrr)+" abierto"}/><Metric label="Ganadas" value={String(metrics.won_opportunities)} sub={dop(metrics.won_mrr)}/><Metric label="Conversaciones" value={String(metrics.conversations)} sub="Inbox"/><Metric label="Productos" value={String(metrics.products)} sub="Catálogo"/></div></section>
 <section className="grid two-col" id="personalizacion"><form className="card" onSubmit={saveBrand}><h2>Vista del cliente</h2><div className="stack gap-12"><label>Marca<input value={brand} onChange={e=>setBrand(e.target.value)}/></label><label>Email soporte<input type="email" value={support} onChange={e=>setSupport(e.target.value)}/></label><label>Color<input type="color" value={color} onChange={e=>setColor(e.target.value)}/></label><label><input type="checkbox" checked={whiteLabel} onChange={e=>setWhiteLabel(e.target.checked)}/> White-label</label><button className="button primary">Guardar</button></div></form><div className="card"><h2>Acceso y preparación</h2>
<p className="muted">Miembros activos: {members.filter(m=>m.membership_status==="active").length}. Gestiona los permisos sin crear otra aplicación para esta empresa.</p>
<div className="stack gap-12"><a href="#onboarding-users" className="button">Gestionar usuarios y roles</a><a href="#readiness" className="button">Revisar pendientes de activación</a></div>
</div></section>
 <section className="card" id="localizacion"><div className="eyebrow">Onboarding · Configuración regional</div><h2>País, moneda y zona horaria</h2>
 <p className="muted">Guarda la región de cada cliente sin editar bases de datos. Los valores anteriores se mantienen hasta guardar. Este paso no activa el cliente automáticamente.</p>
 <p className="muted">{snapshot?.settings?.country_code?"País configurado":"País pendiente de configuración"}</p>
 <form className="stack gap-12" onSubmit={saveRegion}>
  <label>País (ISO, 2 letras)<input value={country} maxLength={2} onChange={e=>setCountry(e.target.value.toUpperCase().replace(/[^A-Z]/g,""))} placeholder="DO" required disabled={tenantLoading}/></label>
  <label>Moneda (ISO, 3 letras)<input value={currency} maxLength={3} onChange={e=>setCurrency(e.target.value.toUpperCase().replace(/[^A-Z]/g,""))} placeholder="DOP" required disabled={tenantLoading}/></label>
  <label>Zona horaria (IANA)<input value={timezone} onChange={e=>setTimezone(e.target.value)} list="crm-timezones" required disabled={tenantLoading}/></label>
  <datalist id="crm-timezones"><option value="America/Santo_Domingo"/><option value="America/New_York"/><option value="America/Mexico_City"/><option value="America/Bogota"/><option value="Europe/Madrid"/><option value="UTC"/></datalist>
  <label>Idioma y región<input value={locale} onChange={e=>setLocale(e.target.value)} placeholder="es-DO" pattern="[a-z]{2,3}-[A-Z]{2}" required disabled={tenantLoading}/></label>
  <button className="button primary" type="submit" disabled={tenantLoading||country.length!==2||currency.length!==3}>Guardar región</button>
 </form></section>
 <section className="card" id="modulos"><h2>Módulos</h2><div className="grid two-col">{modules.map(m=><div className="priority-item" key={m.module_key}><div><strong>{m.module_name}</strong><div className="muted">{m.source}</div></div><button className={`button small ${m.enabled?'':'danger'}`} onClick={()=>toggleModule(m)}>{m.enabled?<><CheckCircle2 size={13}/> Activo</>:'Desactivado'}</button></div>)}</div></section>
 <section className="grid two-col" id="odoo"><form className="card" onSubmit={saveOdoo}><h2>Odoo / ERP</h2><div className="stack gap-12"><label>URL<input value={odooUrl} onChange={e=>setOdooUrl(e.target.value)} required/></label><label>Base de datos<input value={odooDb} onChange={e=>setOdooDb(e.target.value)}/></label><label>Sincronización<select value={odooDirection} onChange={e=>setOdooDirection(e.target.value)}><option value="bidirectional">Bidireccional</option><option value="erp_to_crm">Odoo → CRM</option><option value="crm_to_erp">CRM → Odoo</option></select></label><button className="button primary">Guardar Odoo</button></div></form><div className="card"><h2>Integraciones</h2><div className="priority-item"><strong>Landing / Leads</strong><span>{Number(snapshot?.lead_pages??0)} activa(s)</span></div>{(snapshot?.odoo??[]).map(o=><div className="priority-item" key={o.id}><strong>{o.name}</strong><span className="pill">{o.status}</span></div>)}{(snapshot?.channels??[]).map((c,i)=><div className="priority-item" key={`${c.provider}-${i}`}><strong>{c.name}</strong><span className="pill">{c.status}</span></div>)}</div></section></div>}
 </main></div>}
function Metric({label,value,sub}:{label:string;value:string;sub:string}){return <div className="metric"><div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className="metric-sub">{sub}</div></div>}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  BarChart3, Bot, Building2, CalendarDays, FileText, Gauge, Inbox,
  Package, Settings, Target, Users, Workflow, FolderOpen, PlugZap,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useActiveTenant } from "@/components/tenant-context";
import { useTenantBrand } from "@/components/tenant-brand-provider";
import BrandLogo from "@/components/brand-logo";
import PlatformCompaniesShortcut from "@/components/platform-companies-shortcut";

type Section = { path:string; label:string; familyLabel?:string; permission:string; Icon:typeof Gauge; adminOnly?:boolean };
const sections:Section[] = [
  {path:"",label:"Inicio",permission:"dashboard",Icon:Gauge},
  {path:"companies",label:"Empresas",permission:"companies",Icon:Building2},
  {path:"contacts",label:"Contactos",familyLabel:"Clientes",permission:"contacts",Icon:Users},
  {path:"revenue",label:"Oportunidades",familyLabel:"Ventas",permission:"pipeline",Icon:Target},
  {path:"inbox",label:"Conversaciones",familyLabel:"Mensajes",permission:"inbox",Icon:Inbox},
  {path:"quotations",label:"Cotizaciones",permission:"quotations",Icon:FileText},
  {path:"operations",label:"Operaciones",familyLabel:"Instalaciones",permission:"operations",Icon:Workflow},
  {path:"calendar",label:"Calendario",familyLabel:"Agenda",permission:"calendar",Icon:CalendarDays},
  {path:"products",label:"Productos",permission:"products",Icon:Package},
  {path:"automations",label:"Automatizaciones",permission:"automations",Icon:Bot},
  {path:"employees",label:"Empleados digitales",permission:"settings",Icon:Bot,adminOnly:true},
  {path:"marketing",label:"Marketing",permission:"settings",Icon:BarChart3,adminOnly:true},
  {path:"files",label:"Archivos",permission:"dashboard",Icon:FolderOpen},
  {path:"channels",label:"Canales",permission:"settings",Icon:Inbox,adminOnly:true},
  {path:"integrations",label:"Integraciones",familyLabel:"Conexiones",permission:"settings",Icon:PlugZap,adminOnly:true},
  {path:"sessions",label:"Sesiones del equipo",permission:"settings",Icon:Users,adminOnly:true},
  {path:"settings",label:"Configuración",permission:"settings",Icon:Settings,adminOnly:true},
];

function useAuthorizedSections() {
  const tenant=useActiveTenant();
  const [access,setAccess]=useState<{tenantId:string;items:Section[]}|null>(null);
  useEffect(()=>{
    let active=true;
    setAccess(null);
    if(!tenant?.tenant_id)return()=>{active=false;};
    const tenantId=tenant.tenant_id;
    void Promise.all([
      supabase.rpc("tenant_current_permissions",{p_tenant_id:tenantId}),
      supabase.rpc("tenant_effective_modules",{p_tenant_id:tenantId}),
    ]).then(([p,m])=>{
      if(!active)return;
      if(p.error||m.error){setAccess({tenantId,items:[]});return;}
      const permissions=(p.data??{}) as Record<string,unknown>;
      const modules=(m.data??[]) as Array<{module_key:string;enabled:boolean}>;
      const admin=["owner","admin","manager"].includes(tenant.membership_role);
      const list=sections.filter(item=>{
        // Family Power is a client workspace, not an administrator's company portfolio.
        if(tenant.tenant_slug==="family-power"&&item.path==="companies")return false;
        if(item.adminOnly&&!admin)return false;
        if(item.path==="sessions"&&!["owner","admin"].includes(tenant.membership_role))return false;
        return (permissions.all===true||permissions[item.permission]===true)
          &&modules.find(mod=>mod.module_key===item.permission)?.enabled!==false;
      });
      setAccess({tenantId,items:list});
    }).catch(()=>{if(active)setAccess({tenantId,items:[]});});
    return()=>{active=false;};
  },[tenant?.tenant_id,tenant?.membership_role,tenant?.tenant_slug]);
  return {tenant,items:tenant&&access?.tenantId===tenant.tenant_id?(access.items??[]):[],loading:tenant!==null&&access?.tenantId!==tenant.tenant_id};
}

const current=(activeSection:string,path:string)=>(activeSection==="sales"?"revenue":activeSection)===path;
const label=(tenantSlug:string|undefined,item:Section)=>tenantSlug==="family-power"?(item.familyLabel??item.label):item.label;

export function CrmSidebar({activeSection}:{activeSection:string}) {
  const {tenant,items,loading}=useAuthorizedSections();
  const brand=useTenantBrand();
  return <aside className="sidebar" aria-label="Navegación de la empresa">
    <div className="brand">
      <BrandLogo size="sidebar"/>
      <span>{brand?.name??tenant?.tenant_name??"Mi empresa"}</span>
    </div>
    <nav className="nav" aria-label="Módulos autorizados del CRM">
      <PlatformCompaniesShortcut/>
      {loading&&<span className="crm-nav-loading" role="status">Cargando menú…</span>}
      {items.map(item=><Link
        key={item.path||"home"}
        href={`/crm${item.path?"/"+item.path:""}`}
        className={current(activeSection,item.path)?"active":""}
        aria-current={current(activeSection,item.path)?"page":undefined}>
        <item.Icon size={18} aria-hidden="true"/>
        <span>{label(tenant?.tenant_slug,item)}</span>
      </Link>)}
    </nav>
  </aside>;
}

export function CrmBottomNav({activeSection}:{activeSection:string}) {
  const {tenant,items,loading}=useAuthorizedSections();
  // The global mobile "Módulos" menu in TenantPermissionGate provides all
  // remaining authorized sections; this bar holds only daily work.
  const primary=["","companies","contacts","revenue","inbox","calendar"];
  const visible=primary.map(path=>items.find(item=>item.path===path)).filter((item):item is Section=>Boolean(item)).slice(0,5);
  return <nav className="mobile-nav crm-unified-bottom-nav" aria-label="Navegación rápida">
    {loading&&<span className="crm-nav-loading">Preparando menú…</span>}
    {visible.map(item=><Link
      key={item.path||"home"}
      href={`/crm${item.path?"/"+item.path:""}`}
      className={current(activeSection,item.path)?"active":""}
      aria-current={current(activeSection,item.path)?"page":undefined}>
      <item.Icon size={20} aria-hidden="true"/>
      <span>{label(tenant?.tenant_slug,item)}</span>
    </Link>)}
  </nav>;
}

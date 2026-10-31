"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useActiveTenant } from "@/components/tenant-context";
import PlatformCompaniesShortcut from "@/components/platform-companies-shortcut";

// Los cinco accesos principales están visibles en la barra inferior; este menú muestra el resto.
const links = [["marketing", "Marketing"], ["calendar", "Calendario"], ["products", "Productos"], ["quotations", "Cotizaciones"], ["operations", "Operación"], ["automations", "Automatizaciones"], ["files", "Archivos"], ["channels", "Canales"], ["integrations", "Integraciones"], ["settings", "Configuración"]];
export default function MobileTenantNavigation() {
  const tenant=useActiveTenant(),router=useRouter();
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const [allowed,setAllowed]=useState<string[]|null>(null);
  useEffect(()=>{
    let active=true;setAllowed(null);
    if(!tenant?.tenant_id)return()=>{active=false;};
    void (async()=>{
      const [p,m]=await Promise.all([
        supabase.rpc("tenant_current_permissions",{p_tenant_id:tenant.tenant_id}),
        supabase.rpc("tenant_effective_modules",{p_tenant_id:tenant.tenant_id})
      ]);
      if(!active)return;
      if(p.error||m.error){setAllowed([]);return;}
      const permissions=(p.data??{}) as Record<string,unknown>;
      const modules=(m.data??[]) as Array<{module_key:string;enabled:boolean}>;
      const key=(slug:string)=>["channels","integrations","settings","sesiones","employees","marketing"].includes(slug)?"settings":slug==="files"?"dashboard":slug;
      const possible=[...links,["sesiones","Sesiones del equipo"]];
      setAllowed(possible.filter(([slug])=>(slug!=="sesiones"||["owner","admin"].includes(tenant.membership_role))
        &&(permissions.all===true||permissions[key(slug)]===true)
        &&modules.find(x=>x.module_key===key(slug))?.enabled!==false).map(x=>x[0]));
    })();
    return()=>{active=false;};
  },[tenant?.tenant_id,tenant?.membership_role]);
  if (!tenant) return null;
  async function logout() {
    setBusy(true);setError("");
    if(tenant)try{await supabase.rpc("crm_member_session_close",{p_tenant_id:tenant.tenant_id});}catch{}
    const result=await supabase.auth.signOut();
    setBusy(false);
    if(result.error) {setError("No se pudo cerrar la sesión. Intenta nuevamente.");return;}
    router.replace("/login");
  }
  return <details className="mobile-tenant-navigation"><summary aria-label="Abrir todos los módulos">Módulos <span aria-hidden="true">☰</span></summary>
    <div className="mobile-module-panel">{tenant.tenant_slug==="eurevector"&&<span className="platform-company-shortcut"><PlatformCompaniesShortcut/></span>}<nav aria-label={`Otros módulos de ${tenant.tenant_name}`}>{[...links,["sesiones","Sesiones del equipo"]].filter(([path])=>allowed?.includes(path)).map(([path,label])=><Link href={`/crm${path?"/"+path:""}`} key={path} onClick={event=>event.currentTarget.closest("details")?.removeAttribute("open")}>{label}</Link>)}</nav>
    <button type="button" className="button" disabled={busy} onClick={logout}>{busy?"Cerrando sesión…":"Salir"}</button>
    {error&&<p role="alert">{error}</p>}</div>
  </details>;
}

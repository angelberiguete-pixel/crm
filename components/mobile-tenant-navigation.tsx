"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { signOutOfTenant } from "@/lib/tenant-session";
import { useActiveTenant } from "@/components/tenant-context";
import PlatformCompaniesShortcut from "@/components/platform-companies-shortcut";

// Los cinco accesos principales están visibles en la barra inferior; este menú muestra el resto.
const links = [["marketing", "Marketing"], ["calendar", "Calendario"], ["products", "Productos"], ["quotations", "Cotizaciones"], ["operations", "Operación"], ["automations", "Automatizaciones"], ["files", "Archivos"], ["channels", "Canales"], ["integrations", "Integraciones"], ["sessions", "Sesiones del equipo"], ["settings", "Configuración"]];
export default function MobileTenantNavigation() {
  const tenant=useActiveTenant(),router=useRouter();
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const [allowed,setAllowed]=useState<string[]|null>(null);
  useEffect(()=>{
    let alive=true;
    setAllowed(null); // Fail closed while permissions are loading or tenant changes.
    if(!tenant?.tenant_id)return()=>{alive=false;};
    const id=tenant.tenant_id,role=tenant.membership_role;
    void (async()=>{
      try{
        const [p,m]=await Promise.all([
          supabase.rpc("tenant_current_permissions",{p_tenant_id:id}),
          supabase.rpc("tenant_effective_modules",{p_tenant_id:id})
        ]);
        if(!alive)return;
        if(p.error||m.error){setAllowed([]);return;}
        const permissions=(p.data??{}) as Record<string,unknown>;
        const modules=(m.data??[]) as Array<{module_key:string;enabled:boolean}>;
        const permissionKey=(name:string)=>(
          ["channels","integrations","marketing","sessions","settings"].includes(name)?"settings":
          name==="files"?"dashboard":name
        );
        setAllowed(links.filter(([path])=>{
          if(path==="sessions"&&!["owner","admin"].includes(role))return false;
          const key=permissionKey(path);
          return (permissions.all===true||permissions[key]===true)
            &&modules.find(mod=>mod.module_key===key)?.enabled!==false;
        }).map(([path])=>path));
      }catch{if(alive)setAllowed([]);}
    })();
    return()=>{alive=false;};
  },[tenant?.tenant_id,tenant?.membership_role]);
  if (!tenant) return null;
  const tenantId=tenant.tenant_id;
  async function logout() {
    setBusy(true);setError("");
    const result=await signOutOfTenant(tenantId);
    setBusy(false);
    if(result.error) {setError("No se pudo cerrar la sesión. Intenta nuevamente.");return;}
    router.replace("/login");
  }
  return <details className="mobile-tenant-navigation"><summary aria-label="Abrir todos los módulos">Módulos <span aria-hidden="true">☰</span></summary>
    <div className="mobile-module-panel"><span className="platform-company-shortcut"><PlatformCompaniesShortcut/></span><nav aria-label={`Otros módulos de ${tenant.tenant_name}`}>{links.filter(([path])=>allowed?.includes(path)).map(([path,label])=><Link href={`/crm${path?"/"+path:""}`} key={path} onClick={event=>event.currentTarget.closest("details")?.removeAttribute("open")}>{label}</Link>)}</nav>
    <button type="button" className="button" disabled={busy} onClick={logout}>{busy?"Cerrando sesión…":"Salir"}</button>
    {error&&<p role="alert">{error}</p>}</div>
  </details>;
}

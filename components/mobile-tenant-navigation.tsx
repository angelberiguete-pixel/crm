"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useActiveTenant } from "@/components/tenant-context";
import PlatformCompaniesShortcut from "@/components/platform-companies-shortcut";

// Los cinco accesos principales están visibles en la barra inferior; este menú muestra el resto.
const links = [["marketing", "Marketing"], ["calendar", "Calendario"], ["products", "Productos"], ["quotations", "Cotizaciones"], ["operations", "Operación"], ["automations", "Automatizaciones"], ["files", "Archivos"], ["channels", "Canales"], ["integrations", "Integraciones"], ["settings", "Configuración"]];
export default function MobileTenantNavigation() {
  const tenant=useActiveTenant(),router=useRouter();
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  if (!tenant) return null;
  async function logout() {
    setBusy(true);setError("");
    try{await supabase.rpc("tenant_session_end",{p_tenant_id:tenant.tenant_id});}catch{}
    const result=await supabase.auth.signOut();
    setBusy(false);
    if(result.error) {setError("No se pudo cerrar la sesión. Intenta nuevamente.");return;}
    router.replace("/login");
  }
  return <details className="mobile-tenant-navigation"><summary aria-label="Abrir todos los módulos">Módulos <span aria-hidden="true">☰</span></summary>
    <div className="mobile-module-panel">{tenant.tenant_slug==="eurevector"&&<span className="platform-company-shortcut"><PlatformCompaniesShortcut/></span>}<nav aria-label={`Otros módulos de ${tenant.tenant_name}`}>{links.map(([path,label])=><Link href={`/crm${path?"/"+path:""}`} key={path} onClick={event=>event.currentTarget.closest("details")?.removeAttribute("open")}>{label}</Link>)}</nav>
    <button type="button" className="button" disabled={busy} onClick={logout}>{busy?"Cerrando sesión…":"Salir"}</button>
    {error&&<p role="alert">{error}</p>}</div>
  </details>;
}

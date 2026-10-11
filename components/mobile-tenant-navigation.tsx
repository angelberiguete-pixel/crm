"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useActiveTenant } from "@/components/tenant-context";

const links = [["", "Inicio"], ["companies", "Empresas"], ["contacts", "Contactos"], ["revenue", "Pipeline"], ["inbox", "Inbox"], ["calendar", "Calendario"], ["products", "Productos"], ["quotations", "Cotizaciones"], ["operations", "Operación"], ["automations", "Automatizaciones"], ["settings", "Configuración"]];
export default function MobileTenantNavigation() {
  const tenant=useActiveTenant(),router=useRouter();
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  if (!tenant) return null;
  async function logout() {
    setBusy(true);setError("");
    const result=await supabase.auth.signOut();
    setBusy(false);
    if(result.error) {setError("No se pudo cerrar la sesión. Intenta nuevamente.");return;}
    router.replace("/login");
  }
  return <details className="mobile-tenant-navigation"><summary>Menú · {tenant.tenant_name}</summary>
    <nav aria-label="Navegación móvil del CRM">{links.map(([path,label])=><Link href={`/crm${path?"/"+path:""}`} key={path} onClick={event=>event.currentTarget.closest("details")?.removeAttribute("open")}>{label}</Link>)}</nav>
    <button type="button" className="button" disabled={busy} onClick={logout}>{busy?"Cerrando sesión…":"Salir"}</button>
    {error&&<p role="alert">{error}</p>}
  </details>;
}

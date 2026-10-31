"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ReactNode, useEffect, useState, useRef } from "react";
import { ShieldAlert } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { resolveTenantContext } from "@/lib/tenant-context";
import TenantSwitcher from "@/components/tenant-switcher";
import MobileTenantNavigation from "@/components/mobile-tenant-navigation";
import BrandLogo from "@/components/brand-logo";
import TenantBrandProvider from "@/components/tenant-brand-provider";
import { isCommercialClientTenant } from "@/lib/visible-client-tenants";
import { TenantContextProvider, type ActiveTenant } from "@/components/tenant-context";
import { notifyTenantContextChanged, TENANT_CONTEXT_EVENT, TENANT_CONTEXT_REVISION } from "@/lib/tenant-context-events";

const sectionPermission: Record<string, string> = {
  "": "dashboard",
  companies: "companies",
  contacts: "contacts",
  revenue: "pipeline",
  sales: "pipeline",
  inbox: "inbox",
  channels: "settings",
  integrations: "settings",
  marketing: "settings",
  sessions: "settings",
  employees: "settings",
  products: "products",
  quotations: "quotations",
  operations: "operations",
  calendar: "calendar",
  automations: "automations",
  settings: "settings",
  files: "dashboard",
};

type TenantAccess = {
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  membership_role: string;
  is_active: boolean;
};

export default function TenantPermissionGate({ section, children }: { section: string; children: ReactNode }) {
  const router = useRouter();
  const [tenant, setTenant] = useState<ActiveTenant | null>(null);
  const tenantRef = useRef<string | null>(null);
  const [validatedSection, setValidatedSection] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "allow" | "deny">("loading");
  const [reason, setReason] = useState("");
  const [choices, setChoices] = useState<TenantAccess[]>([]);
  const [selecting, setSelecting] = useState(false);
  const [contextVersion, setContextVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!alive) return;
      if (!session?.user) {
        router.replace("/login");
        setState("loading");
        return;
      }

      const tenants = await supabase.rpc("list_my_tenants");
      if (!alive) return;
      if (tenants.error) {
        setReason("No pudimos comprobar el workspace activo. Actualiza la página o vuelve a iniciar sesión.");
        setState("deny");
        return;
      }

      const memberships = (tenants.data ?? []) as TenantAccess[];
      if (memberships.length === 0) {
        // New users must be allowed through so onboarding can create their first tenant.
        setTenant(null);
        setChoices([]);
        setValidatedSection(section);
        setState("allow");
        return;
      }

      const resolved = resolveTenantContext(memberships);
      if (!resolved) {
        setState("loading");
        const commercial=memberships.filter(t=>isCommercialClientTenant(t.tenant_slug));
        setChoices(commercial.length?commercial:memberships);
        return;
      }
      let activeTenant = resolved;
      setChoices([]);
      if (!memberships.some((membership) => membership.is_active)) {
        const selected = await supabase.rpc("set_active_tenant", { p_tenant_id: activeTenant.tenant_id });
        if (!alive) return;
        if (selected.error) {
          setReason("No pudimos establecer de forma segura el workspace activo. No se concedió acceso.");
          setState("deny");
          return;
        }
        activeTenant = { ...activeTenant, is_active: true };
        notifyTenantContextChanged();
      }

      // A client session must stay pinned to the selected company. This RPC
      // enforces the lock in the database, not only through hidden navigation.
      const lock = await supabase.rpc("crm_lock_client_portal",{p_tenant_id:activeTenant.tenant_id});
      if(!alive)return;
      if(lock.error){
        setReason("No se pudo aislar de forma segura tu sesión de empresa. Cierra sesión e inicia nuevamente.");
        setState("deny");return;
      }
      if (tenantRef.current && tenantRef.current !== activeTenant.tenant_id) setState("loading");
      const tenantId = activeTenant.tenant_id;
      const permissionKey = sectionPermission[section] ?? section;
      const [permissionsResult, modulesResult] = await Promise.all([
        supabase.rpc("tenant_current_permissions", { p_tenant_id: tenantId }),
        supabase.rpc("tenant_effective_modules", { p_tenant_id: tenantId }),
      ]);

      if (!alive) return;
      if (permissionsResult.error || modulesResult.error) {
        setReason("No pudimos validar tus permisos para este workspace. No se concedió acceso por defecto.");
        setState("deny");
        return;
      }

      const permissions = (permissionsResult.data ?? {}) as Record<string, unknown>;
      const modules = (modulesResult.data ?? []) as Array<{ module_key: string; enabled: boolean }>;
      const module = modules.find((m) => m.module_key === permissionKey);
      const hasPermission = permissions.all === true || permissions[permissionKey] === true;
      const moduleEnabled = module ? module.enabled : true;

      if (hasPermission && moduleEnabled) {
        tenantRef.current = activeTenant.tenant_id;
        setTenant(activeTenant);
        setValidatedSection(section);
        setState("allow");
      } else {
        setReason(!moduleEnabled ? "Este módulo no está habilitado para el plan/configuración de esta empresa." : "Tu rol no tiene permiso para utilizar esta función.");
        setState("deny");
      }
    })().catch(() => {
      if (!alive) return;
      setReason("No pudimos validar el acceso. Intenta nuevamente.");
      setState("deny");
    });
    return () => { alive = false; };
  }, [section, contextVersion, router]);

  useEffect(()=>{
    if(state!=="allow"||!tenant?.tenant_id)return;
    const tenantId=tenant.tenant_id;
    // Presence is measured only while the authenticated tab is visible.
    const ping=()=>{if(document.visibilityState==="visible")
      void supabase.rpc("crm_member_session_heartbeat",{p_tenant_id:tenantId});};
    ping();
    const timer=window.setInterval(ping,60000);
    document.addEventListener("visibilitychange",ping);
    return()=>{window.clearInterval(timer);document.removeEventListener("visibilitychange",ping);};
  },[state,tenant?.tenant_id]);

  useEffect(() => {
    const invalidate = () => {
      setState("loading");
      setTenant(null);
      setValidatedSection(null);
      setContextVersion(version => version + 1);
    };
    const storage = (event: StorageEvent) => {
      if (event.key === TENANT_CONTEXT_REVISION) invalidate();
    };
    const focus = () => setContextVersion(version => version + 1);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" || event === "USER_UPDATED") invalidate();
    });
    window.addEventListener("storage", storage);
    window.addEventListener(TENANT_CONTEXT_EVENT, invalidate);
    window.addEventListener("focus", focus);
    return () => {
      window.removeEventListener("storage", storage);
      window.removeEventListener(TENANT_CONTEXT_EVENT, invalidate);
      window.removeEventListener("focus", focus);
      subscription.unsubscribe();
    };
  }, []);

  async function selectTenant(tenant: TenantAccess) {
    setSelecting(true);
    setReason("");
    try {
      const result = await supabase.rpc("set_active_tenant", { p_tenant_id: tenant.tenant_id });
      if (result.error) { setReason(result.error.message); return; }
      setChoices([]);
      notifyTenantContextChanged();
    } catch { setReason("No se pudo seleccionar la empresa. Intenta nuevamente."); }
    finally { setSelecting(false); }
  }

  if (choices.length > 0) return <main className="auth-shell"><section className="auth-panel">
    <BrandLogo size="login"/><div className="eyebrow">Selecciona tu empresa</div><h1>Acceso a tu portal</h1>
    <p className="muted">Selecciona tu empresa. Para cambiar a otra después tendrás que cerrar sesión e iniciar sesión nuevamente.</p>
    <div className="stack gap-16">{choices.map(tenant => <button type="button" className="button" key={tenant.tenant_id} disabled={selecting} onClick={() => selectTenant(tenant)}>{tenant.tenant_name}</button>)}</div>
    {reason && <div className="notice" role="alert">{reason}</div>}
  </section></main>;

  if (state === "loading" || (state === "allow" && validatedSection !== section)) return <div className="tenant-gate-loading" role="status">Comprobando el acceso a tu empresa…</div>;
  if (state === "allow") return <TenantContextProvider key={tenant?.tenant_id ?? "onboarding"} tenant={tenant}>
    {tenant ? <TenantBrandProvider key={tenant.tenant_id} tenant={tenant}>
      <div className="workspace-header"><span className="tenant-mobile-brand"><BrandLogo size="compact" /></span><div className="workspace-switcher"><TenantSwitcher /></div><MobileTenantNavigation /></div>
      {children}
    </TenantBrandProvider> : children}
  </TenantContextProvider>;

  return <main className="auth-shell">
    <section className="auth-panel">
      <BrandLogo size="compact"/><ShieldAlert size={32} />
      <div className="eyebrow" style={{ marginTop: 12 }}>Acceso restringido</div>
      <h1>Esta función no está disponible</h1>
      <p className="muted">{reason}</p>
      <Link className="button primary" href="/crm">Volver al inicio</Link>
    </section>
  </main>;
}

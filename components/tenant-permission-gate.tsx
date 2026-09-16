"use client";

import Link from "next/link";
import { ReactNode, useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { supabase } from "@/lib/supabase";

const sectionPermission: Record<string, string> = {
  "": "dashboard",
  companies: "companies",
  contacts: "contacts",
  revenue: "pipeline",
  inbox: "inbox",
  products: "products",
  quotations: "quotations",
  calendar: "calendar",
  automations: "automations",
  settings: "settings",
};

type TenantAccess = {
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  membership_role: string;
  is_active: boolean;
};

export default function TenantPermissionGate({ section, children }: { section: string; children: ReactNode }) {
  const [state, setState] = useState<"loading" | "allow" | "deny">("loading");
  const [reason, setReason] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!alive) return;
      if (!session?.user) {
        // CrmWorkspace owns the redirect to /login. Keep onboarding/login behavior intact.
        setState("allow");
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
        setState("allow");
        return;
      }

      // list_my_tenants orders the explicit active tenant first. If this account has
      // never selected one, establish that deterministic first tenant before the CRM
      // workspace performs any membership/data reads. RLS then scopes those reads to
      // the exact same tenant used by this permission gate.
      let activeTenant = memberships.find((membership) => membership.is_active) ?? memberships[0];
      if (!memberships.some((membership) => membership.is_active)) {
        const selected = await supabase.rpc("set_active_tenant", { p_tenant_id: activeTenant.tenant_id });
        if (!alive) return;
        if (selected.error) {
          setReason("No pudimos establecer de forma segura el workspace activo. No se concedió acceso.");
          setState("deny");
          return;
        }
        activeTenant = { ...activeTenant, is_active: true };
      }

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
        setState("allow");
      } else {
        setReason(!moduleEnabled ? "Este módulo no está habilitado para el plan/configuración de esta empresa." : "Tu rol no tiene permiso para utilizar esta función.");
        setState("deny");
      }
    })();
    return () => { alive = false; };
  }, [section]);

  if (state === "loading") return <div className="loading">Comprobando permisos…</div>;
  if (state === "allow") return <>{children}</>;

  return <main className="auth-shell">
    <section className="auth-panel">
      <ShieldAlert size={32} />
      <div className="eyebrow" style={{ marginTop: 12 }}>Acceso restringido</div>
      <h1>Esta función no está disponible</h1>
      <p className="muted">{reason}</p>
      <Link className="button primary" href="/crm">Volver al dashboard</Link>
    </section>
  </main>;
}

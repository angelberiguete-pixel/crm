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

export default function TenantPermissionGate({ section, children }: { section: string; children: ReactNode }) {
  const [state, setState] = useState<"loading" | "allow" | "deny">("loading");
  const [reason, setReason] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!alive) return;
      if (!session?.user) {
        setState("allow");
        return;
      }

      const membership = await supabase
        .from("memberships")
        .select("tenant_id")
        .eq("user_id", session.user.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();

      if (!alive) return;
      if (!membership.data?.tenant_id) {
        // New users must be allowed through so the existing onboarding can create a tenant.
        setState("allow");
        return;
      }

      const tenantId = membership.data.tenant_id as string;
      const permissionKey = sectionPermission[section] ?? section;
      const [permissionsResult, modulesResult] = await Promise.all([
        supabase.rpc("tenant_current_permissions", { p_tenant_id: tenantId }),
        supabase.rpc("tenant_effective_modules", { p_tenant_id: tenantId }),
      ]);

      // During a schema rollout, preserve the existing CRM rather than locking users out.
      if (permissionsResult.error || modulesResult.error) {
        setState("allow");
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

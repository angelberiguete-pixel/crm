"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { notifyTenantContextChanged } from "@/lib/tenant-context-events";
import { useActiveTenant, type ActiveTenant } from "@/components/tenant-context";

export default function TenantSwitcher() {
  const tenant = useActiveTenant();
  const [choices, setChoices] = useState<ActiveTenant[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    supabase.rpc("list_my_tenants").then(({ data, error }) => {
      if (!alive) return;
      if (error) setError("No pudimos cargar tus empresas.");
      else setChoices((data ?? []) as ActiveTenant[]);
    });
    return () => { alive = false; };
  }, [tenant?.tenant_id]);
  if (!tenant || choices.length < 2) return null;
  async function select(id: string) {
    if (id === tenant?.tenant_id) return;
    setBusy(true); setError("");
    try {
      const { error } = await supabase.rpc("set_active_tenant", { p_tenant_id: id });
      if (error) { setError(error.message); return; }
      notifyTenantContextChanged();
    } catch { setError("No se pudo cambiar de empresa."); }
    finally { setBusy(false); }
  }
  return <div className="tenant-switcher"><label className="sr-only" htmlFor="active-company">Empresa activa</label>
    <select id="active-company" aria-label="Empresa activa" value={tenant.tenant_id} disabled={busy} onChange={event => select(event.target.value)}>
      {choices.map(choice => <option key={choice.tenant_id} value={choice.tenant_id}>{choice.tenant_name}</option>)}
    </select>{error && <small role="alert">{error}</small>}
  </div>;
}

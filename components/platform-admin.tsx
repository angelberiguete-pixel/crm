"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  CheckCircle2,
  ChevronRight,
  KeyRound,
  Layers3,
  LogOut,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Stethoscope,
  Users,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type Access = { is_platform_admin?: boolean; is_platform_user?: boolean; role?: string | null };
type Tenant = {
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  owner_user_id: string | null;
  plan_code: string | null;
  subscription_status: string | null;
  member_count: number;
  created_at: string;
};
type Module = { module_key: string; module_name: string; enabled: boolean; source: string; config: Record<string, unknown> };
type Member = { user_id: string; email: string | null; membership_role: string; membership_status: string; role_key: string | null; role_name: string | null };
type Role = { role_key: string; role_name: string; description: string | null; permissions: Record<string, unknown>; is_system: boolean };
type Plan = { id?: string; code?: string; name?: string; [key: string]: unknown };

function unwrap<T>(value: unknown, rpcName: string): T[] {
  if (!Array.isArray(value)) return [];
  return value.map((row) => {
    if (row && typeof row === "object" && rpcName in (row as Record<string, unknown>)) return (row as Record<string, unknown>)[rpcName] as T;
    return row as T;
  });
}

export default function PlatformAdmin() {
  const router = useRouter();
  const [access, setAccess] = useState<Access | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [bootstrapCode, setBootstrapCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");

  const selected = useMemo(() => tenants.find((t) => t.tenant_id === selectedId) ?? null, [tenants, selectedId]);

  const loadAccess = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.replace("/login");
      return false;
    }
    const result = await supabase.rpc("platform_current_access");
    if (result.error) {
      setNotice(result.error.message);
      setAccess({ is_platform_admin: false, is_platform_user: false, role: null });
      return false;
    }
    const value = (result.data ?? {}) as Access;
    setAccess(value);
    return Boolean(value.is_platform_admin);
  }, [router]);

  const loadPlatform = useCallback(async () => {
    setLoading(true);
    const [tenantResult, planResult] = await Promise.all([
      supabase.rpc("platform_admin_tenants"),
      supabase.rpc("platform_admin_plans"),
    ]);
    if (tenantResult.error) setNotice(tenantResult.error.message);
    if (planResult.error) setNotice(planResult.error.message);
    const tenantRows = (tenantResult.data ?? []) as Tenant[];
    setTenants(tenantRows);
    setPlans(unwrap<Plan>(planResult.data, "platform_admin_plans"));
    setSelectedId((current) => current && tenantRows.some((t) => t.tenant_id === current) ? current : tenantRows[0]?.tenant_id ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      const ok = await loadAccess();
      if (ok) await loadPlatform();
      else setLoading(false);
    })();
  }, [loadAccess, loadPlatform]);

  const loadTenant = useCallback(async (tenantId: string) => {
    const [moduleResult, memberResult, roleResult] = await Promise.all([
      supabase.rpc("tenant_effective_modules", { p_tenant_id: tenantId }),
      supabase.rpc("platform_admin_members", { p_tenant_id: tenantId }),
      supabase.rpc("platform_admin_tenant_roles", { p_tenant_id: tenantId }),
    ]);
    const err = moduleResult.error ?? memberResult.error ?? roleResult.error;
    if (err) setNotice(err.message);
    setModules((moduleResult.data ?? []) as Module[]);
    setMembers((memberResult.data ?? []) as Member[]);
    setRoles((roleResult.data ?? []) as Role[]);
  }, []);

  useEffect(() => {
    if (selectedId && access?.is_platform_admin) loadTenant(selectedId);
    else { setModules([]); setMembers([]); setRoles([]); }
  }, [selectedId, access, loadTenant]);

  async function claimOwner(e: FormEvent) {
    e.preventDefault(); setNotice("");
    const result = await supabase.rpc("claim_platform_owner", { p_bootstrap_code: bootstrapCode.trim() });
    if (result.error) return setNotice(result.error.message);
    setBootstrapCode("");
    const ok = await loadAccess();
    if (ok) await loadPlatform();
  }

  async function createTenant(e: FormEvent) {
    e.preventDefault(); setNotice("");
    const slug = newSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const result = await supabase.rpc("create_tenant", { p_name: newName.trim(), p_slug: slug });
    if (result.error) return setNotice(result.error.message);
    const tenantId = result.data as string;
    setNewName(""); setNewSlug("");
    await supabase.rpc("initialize_revenue_command_center", { p_tenant_id: tenantId });
    await loadPlatform();
    setSelectedId(tenantId);
    setNotice("Cliente/tenant creado. Ya puedes asignarle plan, módulos y template.");
  }

  async function setPlan(code: string) {
    if (!selectedId) return;
    setNotice("");
    const r = await supabase.rpc("platform_assign_plan", { p_tenant_id: selectedId, p_plan_code: code });
    if (r.error) return setNotice(r.error.message);
    await loadPlatform();
    setSelectedId(selectedId);
    setNotice(`Plan ${code} asignado.`);
  }

  async function toggleModule(module: Module) {
    if (!selectedId) return;
    setNotice("");
    const r = await supabase.rpc("platform_set_tenant_module", { p_tenant_id: selectedId, p_module_key: module.module_key, p_enabled: !module.enabled, p_config: module.config ?? {} });
    if (r.error) return setNotice(r.error.message);
    await loadTenant(selectedId);
  }

  async function installCita24() {
    if (!selectedId) return;
    setNotice("");
    const r = await supabase.rpc("install_crm_template", { p_tenant_id: selectedId, p_template_key: "cita-24" });
    if (r.error) return setNotice(r.error.message);
    await loadTenant(selectedId);
    setNotice("Cita-24 instalado: pipeline, etapas y módulos configurados en este tenant.");
  }

  async function enterTenant() {
    if (!selectedId) return;
    setNotice("");
    const r = await supabase.rpc("platform_join_tenant_as_admin", { p_tenant_id: selectedId });
    if (r.error) return setNotice(r.error.message);
    window.localStorage.setItem("crm_active_tenant_id", selectedId);
    window.location.href = "/crm";
  }

  async function setMemberRole(userId: string, roleKey: string) {
    if (!selectedId) return;
    setNotice("");
    const r = await supabase.rpc("platform_set_member_role", { p_tenant_id: selectedId, p_user_id: userId, p_role_key: roleKey });
    if (r.error) return setNotice(r.error.message);
    await loadTenant(selectedId);
  }

  if (loading) return <div className="loading">Cargando Platform Admin…</div>;

  if (!access?.is_platform_admin) {
    return <main className="auth-shell">
      <section className="auth-panel">
        <div className="eyebrow">Eurevector · Control plane</div>
        <h1>Activar Platform Owner</h1>
        <p className="muted">Esta activación es de un solo uso y convierte tu usuario autenticado en propietario global de la plataforma.</p>
        <form className="stack gap-16" onSubmit={claimOwner}>
          <label>Código de bootstrap<input value={bootstrapCode} onChange={(e) => setBootstrapCode(e.target.value.toUpperCase())} placeholder="Código de 16 caracteres" required /></label>
          {notice && <div className="notice">{notice}</div>}
          <button className="button primary"><KeyRound size={15} /> Activar Platform Owner</button>
        </form>
        <button className="text-button" onClick={async () => { await supabase.auth.signOut(); router.replace("/login"); }}><LogOut size={14} /> Cerrar sesión</button>
      </section>
    </main>;
  }

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><strong>Eurevector Platform</strong><span>Super Admin · {access.role}</span></div>
      <nav className="nav">
        <a className="active" href="#tenants"><Building2 size={17} /> Clientes / Tenants</a>
        <a href="#modules"><Layers3 size={17} /> Planes y módulos</a>
        <a href="#team"><Users size={17} /> Usuarios y roles</a>
        <a href="#templates"><Stethoscope size={17} /> Templates</a>
      </nav>
      <div className="sidebar-footer">
        <Link className="text-button" href="/crm"><ChevronRight size={14} /> Ir al CRM</Link>
        <button className="text-button" onClick={async () => { await supabase.auth.signOut(); router.replace("/login"); }}><LogOut size={14} /> Salir</button>
      </div>
    </aside>
    <main className="content">
      <header className="topbar"><div><div className="eyebrow">Control global de la plataforma</div><h1>Super Admin OS</h1></div><div className="top-actions"><button className="button" onClick={loadPlatform}><RefreshCw size={14} /> Actualizar</button></div></header>
      {notice && <div className="notice" style={{ marginBottom: 16 }}>{notice}</div>}

      <section className="grid metrics" style={{ marginBottom: 16 }}>
        <div className="metric"><div className="metric-label">Tenants</div><div className="metric-value">{tenants.length}</div><div className="metric-sub">Clientes / workspaces</div></div>
        <div className="metric"><div className="metric-label">Usuarios activos</div><div className="metric-value">{tenants.reduce((n, t) => n + Number(t.member_count ?? 0), 0)}</div><div className="metric-sub">Membresías activas</div></div>
        <div className="metric"><div className="metric-label">Planes</div><div className="metric-value">{plans.length}</div><div className="metric-sub">Catálogo actual</div></div>
        <div className="metric"><div className="metric-label">Control</div><div className="metric-value"><ShieldCheck size={26} /></div><div className="metric-sub">Platform Owner activo</div></div>
      </section>

      <section className="grid two-col" id="tenants">
        <div className="card">
          <h2>Clientes / Tenants</h2>
          <div className="table-wrap"><table className="data-table"><thead><tr><th>Cliente</th><th>Plan</th><th>Estado</th><th>Usuarios</th><th></th></tr></thead><tbody>{tenants.map((t) => <tr key={t.tenant_id}><td><strong>{t.tenant_name}</strong><div className="muted">{t.tenant_slug}</div></td><td>{t.plan_code ?? "—"}</td><td><span className="pill">{t.subscription_status ?? "sin plan"}</span></td><td>{t.member_count}</td><td><button className="button small" onClick={() => setSelectedId(t.tenant_id)}>Gestionar</button></td></tr>)}</tbody></table>{tenants.length === 0 && <div className="empty"><strong>Sin tenants todavía</strong><div>Crea el primero desde este panel.</div></div>}</div>
        </div>
        <form className="card" onSubmit={createTenant}>
          <h2>Nuevo cliente</h2>
          <p className="muted">Provisiona un tenant sobre el mismo core CRM.</p>
          <div className="stack gap-12"><label>Empresa / cliente<input value={newName} onChange={(e) => { setNewName(e.target.value); if (!newSlug) setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")); }} required /></label><label>Slug<input value={newSlug} onChange={(e) => setNewSlug(e.target.value)} required /></label><button className="button primary">Crear tenant</button></div>
        </form>
      </section>

      {selected && <div className="stack gap-16 section-gap">
        <section className="card">
          <div className="topbar" style={{ marginBottom: 0 }}><div><div className="eyebrow">Tenant seleccionado</div><h2>{selected.tenant_name}</h2><div className="muted">{selected.tenant_slug} · {selected.subscription_status ?? "sin suscripción"}</div></div><div className="top-actions"><button className="button primary" onClick={enterTenant}>Entrar al CRM del cliente</button><button className="button" onClick={installCita24}><Stethoscope size={14} /> Instalar Cita-24</button></div></div>
        </section>

        <section className="grid two-col" id="modules">
          <div className="card">
            <h2>Plan comercial</h2>
            <p className="muted">El plan controla la base; los overrides permiten personalizar un cliente sin crear otro CRM.</p>
            <label>Plan<select value={selected.plan_code ?? ""} onChange={(e) => e.target.value && setPlan(e.target.value)}><option value="">Seleccionar plan</option>{plans.map((p, i) => <option key={String(p.id ?? p.code ?? i)} value={String(p.code ?? "")}>{String(p.name ?? p.code ?? "Plan")}</option>)}</select></label>
          </div>
          <div className="card">
            <h2>Módulos del tenant</h2>
            <div className="priority-list">{modules.map((m) => <div className="priority-item" key={m.module_key}><div><strong>{m.module_name}</strong><div className="muted">{m.source}</div></div><button className={`button small ${m.enabled ? "" : "danger"}`} onClick={() => toggleModule(m)}>{m.enabled ? <><CheckCircle2 size={13} /> Activo</> : "Desactivado"}</button></div>)}</div>
          </div>
        </section>

        <section className="grid two-col" id="team">
          <div className="card">
            <h2>Usuarios del cliente</h2>
            {members.map((m) => <div className="priority-item" key={m.user_id}><div><strong>{m.email ?? m.user_id.slice(0, 8)}</strong><div className="muted">Membership: {m.membership_role}</div></div><select style={{ width: 160 }} value={m.role_key ?? (m.membership_role === "owner" ? "owner" : "sales")} onChange={(e) => setMemberRole(m.user_id, e.target.value)}>{roles.map((r) => <option key={r.role_key} value={r.role_key}>{r.role_name}</option>)}</select></div>)}
            {members.length === 0 && <div className="empty"><strong>Sin usuarios</strong><div>El tenant todavía no tiene miembros activos.</div></div>}
          </div>
          <div className="card">
            <h2>Perfiles de acceso</h2>
            <p className="muted">Estos perfiles permiten mostrar funciones distintas a dueño, administrador, gerente, vendedor y consulta.</p>
            {roles.map((r) => <div className="priority-item" key={r.role_key}><div><strong>{r.role_name}</strong><div className="muted">{r.description ?? r.role_key}</div></div><span className="pill">{r.is_system ? "Base" : "Custom"}</span></div>)}
          </div>
        </section>

        <section className="card" id="templates">
          <div className="grid two-col"><div><div className="eyebrow">Configuración vertical</div><h2>Cita-24</h2><p className="muted">Instala pipeline de clínicas, etapas y módulos sobre este tenant. No crea un fork del CRM.</p><button className="button primary" onClick={installCita24}><Stethoscope size={14} /> Instalar / actualizar Cita-24</button></div><div><div className="eyebrow">Arquitectura</div><h2>Core + módulos + templates + agents</h2><p className="muted">La personalización comercial vive en configuración y permisos. El mismo core puede operar clínicas, inmobiliarias, dealers, agencias y otras verticales.</p><div className="kpi-row"><span className="kpi-chip"><strong>Tenant:</strong> aislado</span><span className="kpi-chip"><strong>RLS:</strong> activo</span><span className="kpi-chip"><strong>White-label:</strong> preparado</span></div></div></div>
        </section>
      </div>}
    </main>
  </div>;
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Bot,
  Building2,
  CalendarDays,
  FileText,
  Gauge,
  Inbox,
  LogOut,
  Package,
  RefreshCw,
  Settings,
  Target,
  Users,
  Workflow,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import CrmOperations from "@/components/crm-operations";

type Member = { tenant_id: string; role: string };
type Company = { id: string; name: string; sector: string | null; city: string | null; email: string | null; phone: string | null; whatsapp_phone: string | null; website: string | null; created_at: string };
type Contact = { id: string; company_id: string | null; display_name: string; job_title: string | null; email: string | null; phone: string | null; whatsapp_phone: string | null; status: string; source: string | null; created_at: string };
type Conversation = { id: string; contact_id: string | null; subject: string | null; status: string; priority: string; unread_count: number; last_message_at: string | null; created_at: string };
type Message = { id: string; conversation_id: string; direction: string; sender_type: string; body: string | null; status: string; sent_at: string | null; created_at: string };
type Product = { id: string; sku: string; name: string; description: string | null; status: string; source_system: string; sale_price: number; currency: string; stock_snapshot: number | null; stock_synced_at: string | null; created_at: string };
type Quotation = { id: string; quote_number: string; company_id: string | null; contact_id: string | null; status: string; currency: string; valid_until: string | null; total: number; created_at: string };
type CalendarEvent = { id: string; title: string; description: string | null; event_type: string; status: string; starts_at: string; ends_at: string; location: string | null; created_at: string };
type AutomationRule = { id: string; name: string; description: string | null; status: string; trigger_type: string; trigger_event: string | null; created_at: string };
type Agent = { id: string; name: string; purpose: string | null; status: string; model_provider: string; model_name: string; approval_mode: string; created_at: string };
type TenantSettings = { tenant_id: string; brand_name: string | null; primary_color: string | null; support_email: string | null; timezone: string; currency: string; hide_platform_branding: boolean };
type RevenueDash = { current_mrr: number | null; open_pipeline_mrr: number | null; weighted_pipeline_mrr: number | null; cash_collected: number | null; open_opportunities: number | null; won_opportunities: number | null };
type ErpStatus = { tenant_id:string; connection_id:string; provider:string; status:string; sync_direction:string; last_healthcheck_at:string|null; last_error:string|null; source_of_truth:Record<string,unknown>|null; inventory_synced_at:string|null; odoo_products:number };
type ProductPublication = { product_id:string; is_published:boolean; show_exact_stock:boolean; show_price:boolean; public_label:string|null };

const money = new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP", maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat("es-DO", { dateStyle: "medium", timeStyle: "short" });
const nav = [
  ["", "Inicio", Gauge],
  ["companies", "Empresas", Building2],
  ["contacts", "Contactos", Users],
  ["revenue", "Pipeline / Revenue", Target],
  ["inbox", "Inbox", Inbox],
  ["products", "Productos", Package],
  ["quotations", "Cotizaciones", FileText],
  ["operations", "Operaciones", Workflow],
  ["calendar", "Calendario", CalendarDays],
  ["automations", "Automatizaciones / IA", Bot],
  ["settings", "Configuración", Settings],
] as const;

const titleFor = (section: string) => nav.find(([key]) => key === section)?.[1] ?? "CRM";
const isoFromLocal = (value: string) => (value ? new Date(value).toISOString() : null);

export default function CrmWorkspace({ slug }: { slug: string[] }) {
  const router = useRouter();
  const section = slug[0] ?? "";
  const [userId, setUserId] = useState<string | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [onboarding, setOnboarding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const refresh = useCallback(() => setReloadKey((v) => v + 1), []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!alive) return;
      if (!session?.user) {
        router.replace("/login");
        return;
      }
      setUserId(session.user.id);
      const membership = await supabase
        .from("memberships")
        .select("tenant_id,role")
        .eq("user_id", session.user.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      if (!alive) return;
      if (membership.error) {
        setNotice(membership.error.message);
        setLoading(false);
        return;
      }
      if (!membership.data) {
        setOnboarding(true);
        setLoading(false);
        return;
      }
      setMember(membership.data as Member);
      setLoading(false);
    })();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.replace("/login");
    });
    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, [router]);

  if (loading) return <div className="loading">Cargando CRM…</div>;
  if (onboarding && userId) {
    return <Onboarding userId={userId} done={(tenantId) => {
      setMember({ tenant_id: tenantId, role: "owner" });
      setOnboarding(false);
      refresh();
    }} />;
  }
  if (!member) return <div className="loading">No se pudo preparar el workspace.</div>;

  const tenantId = member.tenant_id;
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><strong>Look Social Media CRM</strong><span>Ventas · Operaciones · IA</span></div>
        <nav className="nav">
          {nav.map(([key, label, Icon]) => (
            <Link key={key} className={section === key ? "active" : ""} href={`/crm${key ? `/${key}` : ""}`}>
              <Icon size={17} />{label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="muted">Rol: {member.role}</div>
          <button className="text-button" onClick={async () => { await supabase.auth.signOut(); router.replace("/login"); }}><LogOut size={14} /> Salir</button>
        </div>
      </aside>
      <main className="content">
        <header className="topbar">
          <div><div className="eyebrow">CRM multi-tenant</div><h1>{titleFor(section)}</h1></div>
          <div className="top-actions">
            <Link className="button" href="/revenue-command-center"><Workflow size={14} /> Revenue Command Center</Link>
            <button className="button" onClick={refresh}><RefreshCw size={14} /> Actualizar</button>
          </div>
        </header>
        {notice && <div className="notice" style={{ marginBottom: 16 }}>{notice}</div>}
        {section === "" && <Dashboard tenantId={tenantId} reloadKey={reloadKey} notice={setNotice} />}
        {section === "companies" && <Companies tenantId={tenantId} reloadKey={reloadKey} refresh={refresh} notice={setNotice} />}
        {section === "contacts" && <Contacts tenantId={tenantId} reloadKey={reloadKey} refresh={refresh} notice={setNotice} />}
        {section === "revenue" && <Revenue tenantId={tenantId} reloadKey={reloadKey} notice={setNotice} />}
        {section === "inbox" && <InboxPanel tenantId={tenantId} reloadKey={reloadKey} notice={setNotice} />}
        {section === "products" && <Products tenantId={tenantId} reloadKey={reloadKey} refresh={refresh} notice={setNotice} />}
        {section === "quotations" && <Quotations tenantId={tenantId} reloadKey={reloadKey} refresh={refresh} notice={setNotice} />}
        {section === "operations" && <CrmOperations tenantId={tenantId} />}
        {section === "calendar" && <Calendar tenantId={tenantId} reloadKey={reloadKey} refresh={refresh} notice={setNotice} />}
        {section === "automations" && <Automations tenantId={tenantId} reloadKey={reloadKey} refresh={refresh} notice={setNotice} />}
        {section === "settings" && <SettingsPanel tenantId={tenantId} reloadKey={reloadKey} notice={setNotice} />}
      </main>
      <nav className="mobile-nav">
        {nav.slice(0, 5).map(([key, label, Icon]) => <Link key={key} href={`/crm${key ? `/${key}` : ""}`}><Icon size={17} />{label}</Link>)}
      </nav>
    </div>
  );
}

function Onboarding({ userId, done }: { userId: string; done: (tenantId: string) => void }) {
  const [name, setName] = useState("Mi negocio");
  const [slug, setSlug] = useState("mi-negocio");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const result = await supabase.rpc("create_tenant", { p_name: name, p_slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, "-") });
    if (result.error) { setError(result.error.message); setBusy(false); return; }
    const tenantId = result.data as string;
    const init = await supabase.rpc("initialize_revenue_command_center", { p_tenant_id: tenantId });
    setBusy(false);
    if (init.error) { setError(init.error.message); return; }
    done(tenantId);
  }
  return <main className="auth-shell"><section className="auth-panel"><div className="eyebrow">Primer acceso</div><h1>Crea tu workspace</h1><p className="muted">Esto prepara tu tenant, plan, pipeline y permisos.</p><form className="stack gap-16" onSubmit={submit}><label>Nombre del negocio<input value={name} onChange={(e) => setName(e.target.value)} required /></label><label>Slug<input value={slug} onChange={(e) => setSlug(e.target.value)} required /></label>{error && <div className="notice">{error}</div>}<button className="button primary" disabled={busy}>{busy ? "Creando…" : "Crear workspace"}</button></form><small className="muted">Usuario {userId.slice(0, 8)}…</small></section></main>;
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return <div className="metric"><div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className="metric-sub">{sub}</div></div>;
}
function Empty({ title, text }: { title: string; text: string }) { return <div className="empty"><strong>{title}</strong><div>{text}</div></div>; }

function Dashboard({ tenantId, reloadKey, notice }: { tenantId: string; reloadKey: number; notice: (s: string) => void }) {
  const [counts, setCounts] = useState({ companies: 0, contacts: 0, opportunities: 0, conversations: 0, quotations: 0, events: 0 });
  const [revenue, setRevenue] = useState<RevenueDash | null>(null);
  useEffect(() => {
    (async () => {
      const [companies, contacts, opportunities, conversations, quotations, events, dash] = await Promise.all([
        supabase.from("companies").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
        supabase.from("contacts").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
        supabase.from("opportunities").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
        supabase.from("conversations").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
        supabase.from("quotations").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
        supabase.from("calendar_events").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
        supabase.from("revenue_command_center_dashboard").select("current_mrr,open_pipeline_mrr,weighted_pipeline_mrr,cash_collected,open_opportunities,won_opportunities").eq("tenant_id", tenantId).maybeSingle(),
      ]);
      const err = [companies, contacts, opportunities, conversations, quotations, events, dash].find((x) => x.error)?.error;
      if (err) notice(err.message);
      setCounts({ companies: companies.count ?? 0, contacts: contacts.count ?? 0, opportunities: opportunities.count ?? 0, conversations: conversations.count ?? 0, quotations: quotations.count ?? 0, events: events.count ?? 0 });
      setRevenue((dash.data as RevenueDash | null) ?? null);
    })();
  }, [tenantId, reloadKey, notice]);
  return <div className="stack gap-16">
    <section className="grid metrics">
      <Metric label="MRR actual" value={money.format(Number(revenue?.current_mrr ?? 0))} sub="Ingresos recurrentes" />
      <Metric label="Pipeline abierto" value={money.format(Number(revenue?.open_pipeline_mrr ?? 0))} sub={`${Number(revenue?.open_opportunities ?? 0)} oportunidades`} />
      <Metric label="Empresas" value={String(counts.companies)} sub="Cuentas CRM" />
      <Metric label="Contactos" value={String(counts.contacts)} sub="Personas registradas" />
      <Metric label="Conversaciones" value={String(counts.conversations)} sub="Inbox omnicanal" />
      <Metric label="Cotizaciones" value={String(counts.quotations)} sub="Documentos comerciales" />
      <Metric label="Calendario" value={String(counts.events)} sub="Eventos registrados" />
      <Metric label="Oportunidades" value={String(counts.opportunities)} sub="Todas las etapas" />
    </section>
    <section className="grid two-col">
      <div className="card"><div className="eyebrow">Revenue Intelligence</div><h2>Tu centro comercial ya está conectado</h2><p className="muted">El Revenue Command Center conserva el objetivo de RD$1M MRR, prospectos, forecast, tareas y analytics; este workspace añade los módulos operativos del CRM.</p><Link className="button primary" href="/revenue-command-center">Abrir Revenue Command Center</Link></div>
      <div className="card"><h2>Estado del producto</h2><div className="stack gap-8"><div className="priority-item"><strong>Autenticación + multi-tenant</strong><span>Activo</span></div><div className="priority-item"><strong>RLS por tenant</strong><span>Activo</span></div><div className="priority-item"><strong>CRM operativo</strong><span>Conectado</span></div><div className="priority-item"><strong>ERP Odoo</strong><span>Integración separada</span></div></div></div>
    </section>
  </div>;
}

function Companies({ tenantId, reloadKey, refresh, notice }: { tenantId: string; reloadKey: number; refresh: () => void; notice: (s: string) => void }) {
  const [rows, setRows] = useState<Company[]>([]);
  const [name, setName] = useState(""); const [sector, setSector] = useState(""); const [city, setCity] = useState(""); const [phone, setPhone] = useState(""); const [email, setEmail] = useState("");
  useEffect(() => { (async () => { const r = await supabase.from("companies").select("id,name,sector,city,email,phone,whatsapp_phone,website,created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(500); if (r.error) notice(r.error.message); else setRows((r.data ?? []) as Company[]); })(); }, [tenantId, reloadKey, notice]);
  async function add(e: FormEvent) { e.preventDefault(); const r = await supabase.from("companies").insert({ tenant_id: tenantId, name, sector: sector || null, city: city || null, phone: phone || null, whatsapp_phone: phone || null, email: email || null }); if (r.error) return notice(r.error.message); setName(""); setSector(""); setCity(""); setPhone(""); setEmail(""); refresh(); }
  return <div className="stack gap-16"><form className="card" onSubmit={add}><h2>Nueva empresa</h2><div className="form-grid"><label>Nombre<input value={name} onChange={(e) => setName(e.target.value)} required /></label><label>Sector<input value={sector} onChange={(e) => setSector(e.target.value)} /></label><label>Ciudad<input value={city} onChange={(e) => setCity(e.target.value)} /></label><label>WhatsApp / Teléfono<input value={phone} onChange={(e) => setPhone(e.target.value)} /></label><label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label></div><div className="section-gap"><button className="button primary">Guardar empresa</button></div></form><div className="table-wrap"><table className="data-table"><thead><tr><th>Empresa</th><th>Sector</th><th>Ciudad</th><th>Contacto</th><th>Creada</th></tr></thead><tbody>{rows.map((r) => <tr key={r.id}><td><strong>{r.name}</strong></td><td>{r.sector ?? "—"}</td><td>{r.city ?? "—"}</td><td>{r.email ?? r.whatsapp_phone ?? r.phone ?? "—"}</td><td>{date.format(new Date(r.created_at))}</td></tr>)}</tbody></table>{rows.length === 0 && <Empty title="Sin empresas" text="Agrega tu primera empresa o activa prospectos desde Revenue." />}</div></div>;
}

function Contacts({ tenantId, reloadKey, refresh, notice }: { tenantId: string; reloadKey: number; refresh: () => void; notice: (s: string) => void }) {
  const [rows, setRows] = useState<Contact[]>([]); const [companies, setCompanies] = useState<Company[]>([]);
  const [displayName, setDisplayName] = useState(""); const [companyId, setCompanyId] = useState(""); const [job, setJob] = useState(""); const [email, setEmail] = useState(""); const [phone, setPhone] = useState("");
  useEffect(() => { (async () => { const [c, co] = await Promise.all([supabase.from("contacts").select("id,company_id,display_name,job_title,email,phone,whatsapp_phone,status,source,created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(500), supabase.from("companies").select("id,name,sector,city,email,phone,whatsapp_phone,website,created_at").eq("tenant_id", tenantId).order("name")]); const err = c.error ?? co.error; if (err) notice(err.message); setRows((c.data ?? []) as Contact[]); setCompanies((co.data ?? []) as Company[]); })(); }, [tenantId, reloadKey, notice]);
  const companyMap = useMemo(() => new Map(companies.map((c) => [c.id, c.name])), [companies]);
  async function add(e: FormEvent) { e.preventDefault(); const r = await supabase.from("contacts").insert({ tenant_id: tenantId, company_id: companyId || null, display_name: displayName, job_title: job || null, email: email || null, phone: phone || null, whatsapp_phone: phone || null, source: "manual", status: "lead" }); if (r.error) return notice(r.error.message); setDisplayName(""); setCompanyId(""); setJob(""); setEmail(""); setPhone(""); refresh(); }
  return <div className="stack gap-16"><form className="card" onSubmit={add}><h2>Nuevo contacto</h2><div className="form-grid"><label>Nombre<input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required /></label><label>Empresa<select value={companyId} onChange={(e) => setCompanyId(e.target.value)}><option value="">Sin empresa</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Cargo<input value={job} onChange={(e) => setJob(e.target.value)} /></label><label>WhatsApp / Teléfono<input value={phone} onChange={(e) => setPhone(e.target.value)} /></label><label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label></div><div className="section-gap"><button className="button primary">Guardar contacto</button></div></form><div className="table-wrap"><table className="data-table"><thead><tr><th>Contacto</th><th>Empresa</th><th>Cargo</th><th>Estado</th><th>Contacto</th></tr></thead><tbody>{rows.map((r) => <tr key={r.id}><td><strong>{r.display_name}</strong></td><td>{r.company_id ? companyMap.get(r.company_id) ?? "—" : "—"}</td><td>{r.job_title ?? "—"}</td><td><span className="pill">{r.status}</span></td><td>{r.email ?? r.whatsapp_phone ?? r.phone ?? "—"}</td></tr>)}</tbody></table>{rows.length === 0 && <Empty title="Sin contactos" text="Registra personas y relaciónalas con tus empresas." />}</div></div>;
}

function Revenue({ tenantId, reloadKey, notice }: { tenantId: string; reloadKey: number; notice: (s: string) => void }) {
  const [dash, setDash] = useState<RevenueDash | null>(null);
  useEffect(() => { (async () => { const r = await supabase.from("revenue_command_center_dashboard").select("current_mrr,open_pipeline_mrr,weighted_pipeline_mrr,cash_collected,open_opportunities,won_opportunities").eq("tenant_id", tenantId).maybeSingle(); if (r.error) notice(r.error.message); else setDash(r.data as RevenueDash | null); })(); }, [tenantId, reloadKey, notice]);
  return <div className="stack gap-16"><section className="grid metrics"><Metric label="MRR actual" value={money.format(Number(dash?.current_mrr ?? 0))} sub="Objetivo RD$1M" /><Metric label="Pipeline abierto" value={money.format(Number(dash?.open_pipeline_mrr ?? 0))} sub={`${Number(dash?.open_opportunities ?? 0)} oportunidades`} /><Metric label="Ponderado" value={money.format(Number(dash?.weighted_pipeline_mrr ?? 0))} sub="Probabilidad aplicada" /><Metric label="Caja" value={money.format(Number(dash?.cash_collected ?? 0))} sub={`${Number(dash?.won_opportunities ?? 0)} ganadas`} /></section><section className="card"><h2>Pipeline comercial especializado</h2><p className="muted">Prospectos, kanban, actividades, tareas, forecast y analytics están concentrados en el Revenue Command Center para no duplicar lógica.</p><Link className="button primary" href="/revenue-command-center/pipeline">Abrir Pipeline</Link> <Link className="button" href="/revenue-command-center/prospects">Prospectos</Link> <Link className="button" href="/revenue-command-center/forecast">Forecast</Link></section></div>;
}

function InboxPanel({ tenantId, reloadKey, notice }: { tenantId: string; reloadKey: number; notice: (s: string) => void }) {
  const [rows, setRows] = useState<Conversation[]>([]); const [contacts, setContacts] = useState<Contact[]>([]); const [selected, setSelected] = useState<string | null>(null); const [messages, setMessages] = useState<Message[]>([]);
  useEffect(() => { (async () => { const [c, p] = await Promise.all([supabase.from("conversations").select("id,contact_id,subject,status,priority,unread_count,last_message_at,created_at").eq("tenant_id", tenantId).order("last_message_at", { ascending: false, nullsFirst: false }).limit(250), supabase.from("contacts").select("id,company_id,display_name,job_title,email,phone,whatsapp_phone,status,source,created_at").eq("tenant_id", tenantId)]); const err = c.error ?? p.error; if (err) notice(err.message); setRows((c.data ?? []) as Conversation[]); setContacts((p.data ?? []) as Contact[]); })(); }, [tenantId, reloadKey, notice]);
  useEffect(() => { if (!selected) { setMessages([]); return; } (async () => { const r = await supabase.from("messages").select("id,conversation_id,direction,sender_type,body,status,sent_at,created_at").eq("tenant_id", tenantId).eq("conversation_id", selected).order("created_at", { ascending: true }).limit(500); if (r.error) notice(r.error.message); else setMessages((r.data ?? []) as Message[]); })(); }, [selected, tenantId, reloadKey, notice]);
  const contactMap = useMemo(() => new Map(contacts.map((c) => [c.id, c.display_name])), [contacts]);
  return <div className="grid two-col"><div className="card"><h2>Conversaciones</h2>{rows.map((r) => <button key={r.id} className="priority-item" style={{ width: "100%", textAlign: "left", marginBottom: 8 }} onClick={() => setSelected(r.id)}><strong>{r.contact_id ? contactMap.get(r.contact_id) ?? r.subject ?? "Conversación" : r.subject ?? "Conversación"}</strong><span>{r.unread_count ? `${r.unread_count} sin leer` : r.status}</span></button>)}{rows.length === 0 && <Empty title="Inbox vacío" text="La infraestructura omnicanal está lista; las conversaciones aparecerán al conectar canales." />}</div><div className="card"><h2>Mensajes</h2>{!selected && <Empty title="Selecciona una conversación" text="Aquí verás su historial de mensajes." />}{selected && messages.map((m) => <div className="timeline-item" key={m.id}><strong>{m.direction === "inbound" ? "Cliente" : "Equipo"}</strong><span>{m.body ?? `[${m.status}]`} · {date.format(new Date(m.sent_at ?? m.created_at))}</span></div>)}{selected && messages.length === 0 && <Empty title="Sin mensajes" text="La conversación todavía no contiene mensajes." />}</div></div>;
}

function Products({ tenantId, reloadKey, refresh, notice }: { tenantId: string; reloadKey: number; refresh: () => void; notice: (s: string) => void }) {
  const [rows, setRows] = useState<Product[]>([]);
  const [publications,setPublications]=useState<ProductPublication[]>([]);
  const [erp,setErp]=useState<ErpStatus|null>(null);
  const [sku, setSku] = useState(""); const [name, setName] = useState(""); const [price, setPrice] = useState("");
  useEffect(() => { (async () => {
    const [r,p,e]=await Promise.all([
      supabase.from("products").select("id,sku,name,description,status,source_system,sale_price,currency,stock_snapshot,stock_synced_at,created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(500),
      supabase.from("product_publication").select("product_id,is_published,show_exact_stock,show_price,public_label").eq("tenant_id",tenantId),
      supabase.from("tenant_erp_status").select("tenant_id,connection_id,provider,status,sync_direction,last_healthcheck_at,last_error,source_of_truth,inventory_synced_at,odoo_products").eq("tenant_id",tenantId).maybeSingle()
    ]);
    const err=r.error??p.error??e.error; if(err) notice(err.message);
    setRows((r.data ?? []).map((x) => ({ ...x, sale_price: Number(x.sale_price), stock_snapshot: x.stock_snapshot === null ? null : Number(x.stock_snapshot) })) as Product[]);
    setPublications((p.data??[]) as ProductPublication[]);
    setErp(e.data as ErpStatus|null);
  })(); }, [tenantId, reloadKey, notice]);
  const pubMap=useMemo(()=>new Map(publications.map(p=>[p.product_id,p])),[publications]);
  async function add(e: FormEvent) { e.preventDefault(); const r = await supabase.from("products").insert({ tenant_id: tenantId, sku, name, sale_price: Number(price) || 0, currency: "DOP", status: "active", source_system: "crm" }); if (r.error) return notice(r.error.message); setSku(""); setName(""); setPrice(""); refresh(); }
  async function syncFromOdoo(){ const r=await supabase.rpc("queue_tenant_odoo_sync",{p_tenant_id:tenantId,p_entity_type:"product",p_entity_id:null}); if(r.error) return notice(r.error.message); notice("Sincronización de productos e inventario Odoo encolada."); refresh(); }
  async function togglePublication(product:Product){ const current=pubMap.get(product.id); if(current?.is_published){ const r=await supabase.from("product_publication").update({is_published:false,updated_at:new Date().toISOString()}).eq("tenant_id",tenantId).eq("product_id",product.id); if(r.error)return notice(r.error.message); } else { const r=await supabase.from("product_publication").upsert({tenant_id:tenantId,product_id:product.id,is_published:true,show_exact_stock:true,show_price:true},{onConflict:"tenant_id,product_id"}); if(r.error)return notice(r.error.message); } notice(current?.is_published?"Producto retirado del catálogo web.":"Producto publicado para consumo seguro desde la web."); refresh(); }
  return <div className="stack gap-16">
    <section className="card"><div className="topbar" style={{marginBottom:0}}><div><div className="eyebrow">Fuente de inventario</div><h2>{erp?"Odoo conectado":"Odoo pendiente"}</h2><p className="muted">{erp ? ("Estado "+erp.status+" · "+Number(erp.odoo_products??0)+" productos Odoo · última sync "+(erp.inventory_synced_at?date.format(new Date(erp.inventory_synced_at)):"sin sincronizar")) : "Cuando conectes Odoo, productos, precios e inventario sincronizados serán la fuente oficial."}</p></div><button className="button" type="button" onClick={syncFromOdoo} disabled={!erp}><RefreshCw size={14}/> Sincronizar Odoo</button></div></section>
    <form className="card" onSubmit={add}><h2>Producto local / previo a Odoo</h2><p className="muted">Úsalo solo cuando aún no exista en Odoo. Una vez mapeado, Odoo pasa a ser la fuente de precio e inventario.</p><div className="form-grid"><label>SKU<input value={sku} onChange={(e) => setSku(e.target.value)} required /></label><label>Nombre<input value={name} onChange={(e) => setName(e.target.value)} required /></label><label>Precio RD$<input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} required /></label></div><div className="section-gap"><button className="button primary">Guardar producto</button></div></form>
    <div className="table-wrap"><table className="data-table"><thead><tr><th>SKU</th><th>Producto</th><th>Precio</th><th>Stock</th><th>Fuente</th><th>Web</th></tr></thead><tbody>{rows.map((r) => { const pub=pubMap.get(r.id); return <tr key={r.id}><td>{r.sku}</td><td><strong>{r.name}</strong><div className="muted">{r.stock_synced_at?("Actualizado "+date.format(new Date(r.stock_synced_at))):"Sin fecha de sync"}</div></td><td>{money.format(r.sale_price)}</td><td>{r.stock_snapshot ?? "—"}</td><td><span className="pill">{r.source_system==="odoo"?"Odoo":"CRM"}</span></td><td><button type="button" className="button small" onClick={()=>togglePublication(r)}>{pub?.is_published?"Publicado":"Publicar"}</button></td></tr>; })}</tbody></table>{rows.length === 0 && <Empty title="Sin productos" text="Conecta Odoo o crea temporalmente un producto local." />}</div>
  </div>;
}
function Quotations({ tenantId, reloadKey, refresh, notice }: { tenantId: string; reloadKey: number; refresh: () => void; notice: (s: string) => void }) {
  const [rows, setRows] = useState<Quotation[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [items, setItems] = useState<Array<{ id:string; quotation_id:string; product_id:string|null; description:string; quantity:number; unit_price:number; line_subtotal:number|null }>>([]);
  const [companyId, setCompanyId] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedQuote, setSelectedQuote] = useState("");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");

  useEffect(() => { (async () => {
    const [q, c, p, i] = await Promise.all([
      supabase.from("quotations").select("id,quote_number,company_id,contact_id,status,currency,valid_until,total,created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(500),
      supabase.from("companies").select("id,name,sector,city,email,phone,whatsapp_phone,website,created_at").eq("tenant_id", tenantId).order("name"),
      supabase.from("products").select("id,sku,name,description,status,source_system,sale_price,currency,stock_snapshot,stock_synced_at,created_at").eq("tenant_id", tenantId).eq("status","active").order("name"),
      supabase.from("quotation_items").select("id,quotation_id,product_id,description,quantity,unit_price,line_subtotal").eq("tenant_id",tenantId).order("position")
    ]);
    const err = q.error ?? c.error ?? p.error ?? i.error; if (err) notice(err.message);
    setRows((q.data ?? []).map((x) => ({ ...x, total: Number(x.total) })) as Quotation[]);
    setCompanies((c.data ?? []) as Company[]);
    setProducts((p.data ?? []).map(x=>({...x,sale_price:Number(x.sale_price),stock_snapshot:x.stock_snapshot===null?null:Number(x.stock_snapshot)})) as Product[]);
    setItems((i.data??[]).map(x=>({...x,quantity:Number(x.quantity),unit_price:Number(x.unit_price),line_subtotal:x.line_subtotal===null?null:Number(x.line_subtotal)})));
  })(); }, [tenantId, reloadKey, notice]);

  const companyMap = useMemo(() => new Map(companies.map((c) => [c.id, c.name])), [companies]);
  const selected = rows.find(r=>r.id===selectedQuote) ?? null;
  const selectedItems = items.filter(i=>i.quotation_id===selectedQuote);

  async function add(e: FormEvent) {
    e.preventDefault();
    const quoteNumber = `COT-${Date.now().toString().slice(-8)}`;
    const r = await supabase.from("quotations").insert({ tenant_id: tenantId, quote_number: quoteNumber, company_id: companyId || null, status: "draft", currency: "DOP", valid_until: validUntil || null, notes: notes || null, subtotal: 0, discount_total: 0, tax_total: 0, total: 0 }).select("id").single();
    if (r.error) return notice(r.error.message);
    setCompanyId(""); setValidUntil(""); setNotes(""); setSelectedQuote(r.data.id); refresh();
  }

  async function addItem(e: FormEvent) {
    e.preventDefault();
    if(!selectedQuote) return notice("Selecciona una cotización.");
    const product=products.find(p=>p.id===productId);
    if(!product) return notice("Selecciona un producto activo con precio aprobado.");
    const qty=Number(quantity);
    if(!Number.isFinite(qty)||qty<=0) return notice("Cantidad inválida.");
    const subtotal=qty*product.sale_price;
    const r=await supabase.from("quotation_items").insert({
      tenant_id:tenantId, quotation_id:selectedQuote, product_id:product.id, position:selectedItems.length+1,
      sku_snapshot:product.sku, description:product.name, quantity:qty, unit_price:product.sale_price,
      discount_percent:0, tax_rate:0
    });
    if(r.error) return notice(r.error.message);
    const newSubtotal=selectedItems.reduce((a,i)=>a+Number(i.line_subtotal??i.quantity*i.unit_price),0)+subtotal;
    const u=await supabase.from("quotations").update({subtotal:newSubtotal,total:newSubtotal}).eq("tenant_id",tenantId).eq("id",selectedQuote);
    if(u.error) return notice(u.error.message);
    setProductId(""); setQuantity("1"); refresh();
  }

  async function syncQuotationToOdoo(q:Quotation) { if(q.total<=0) return notice("La cotización necesita artículos y total antes de enviarse a Odoo."); const r=await supabase.rpc("queue_tenant_odoo_sync",{p_tenant_id:tenantId,p_entity_type:"quotation",p_entity_id:q.id}); if(r.error)return notice(r.error.message); notice("Cotización encolada para sincronizar con Odoo. Odoo será la fuente del documento/PDF definitivo."); }

  async function setQuoteStatus(q:Quotation,status:string) {
    if(status==="accepted" && q.total<=0) return notice("No puedes aceptar una cotización sin artículos y total.");
    const patch:Record<string,unknown>={status};
    if(status==="accepted") patch.accepted_at=new Date().toISOString();
    if(status==="rejected") patch.rejected_at=new Date().toISOString();
    const r=await supabase.from("quotations").update(patch).eq("tenant_id",tenantId).eq("id",q.id);
    if(r.error) return notice(r.error.message);
    notice(`Cotización ${q.quote_number}: ${status}.`); refresh();
  }

  function printQuote(q:Quotation) {
    const quoteItems=items.filter(i=>i.quotation_id===q.id);
    const company=q.company_id?companyMap.get(q.company_id)??"Cliente":"Cliente";
    const lines=quoteItems.map(i=>`<tr><td>${i.description}</td><td style="text-align:right">${i.quantity}</td><td style="text-align:right">${money.format(i.unit_price)}</td><td style="text-align:right">${money.format(Number(i.line_subtotal??i.quantity*i.unit_price))}</td></tr>`).join("");
    const html=`<!doctype html><html><head><meta charset="utf-8"><title>${q.quote_number}</title><style>body{font-family:Arial,sans-serif;padding:40px;color:#111}h1{margin-bottom:4px}.muted{color:#666}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{padding:10px;border-bottom:1px solid #ddd;text-align:left}.total{text-align:right;font-size:20px;font-weight:700;margin-top:24px}@media print{button{display:none}}</style></head><body><h1>Sublimaciones Lazala</h1><div class="muted">Cotización ${q.quote_number}</div><p><strong>Cliente:</strong> ${company}</p><p><strong>Estado:</strong> ${q.status}</p><table><thead><tr><th>Artículo</th><th>Cant.</th><th>Precio</th><th>Total</th></tr></thead><tbody>${lines||'<tr><td colspan="4">Sin artículos</td></tr>'}</tbody></table><div class="total">Total: ${money.format(q.total)}</div><p class="muted">Vista previa interna del CRM. El documento comercial/PDF definitivo debe generarse desde Odoo cuando exista una conexión activa.</p><button onclick="window.print()">Imprimir / Guardar PDF</button></body></html>`;
    const w=window.open("","_blank"); if(!w) return notice("El navegador bloqueó la ventana de impresión.");
    w.document.write(html); w.document.close();
  }

  return <div className="stack gap-16">
    <form className="card" onSubmit={add}><h2>Nueva cotización</h2><div className="form-grid"><label>Empresa<select value={companyId} onChange={(e) => setCompanyId(e.target.value)}><option value="">Sin empresa</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Válida hasta<input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></label></div><label style={{ marginTop: 12 }}>Notas<textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></label><div className="section-gap"><button className="button primary">Crear borrador</button></div></form>

    <section className="grid two-col">
      <div className="card"><h2>Cotizaciones</h2>{rows.map(q=><button type="button" key={q.id} className="priority-item" style={{width:"100%",textAlign:"left",marginBottom:8}} onClick={()=>setSelectedQuote(q.id)}><div><strong>{q.quote_number}</strong><div className="muted">{q.company_id?companyMap.get(q.company_id)??"—":"—"} · {money.format(q.total)}</div></div><span className="pill">{q.status}</span></button>)}{rows.length===0&&<Empty title="Sin cotizaciones" text="Crea el primer borrador comercial." />}</div>
      <div className="card">
        <h2>Detalle</h2>
        {!selected&&<Empty title="Selecciona una cotización" text="Añade artículos, cambia su estado y sincronízala con Odoo para el documento comercial definitivo." />}
        {selected&&<div className="stack gap-12">
          <div className="priority-item"><strong>{selected.quote_number}</strong><span>{money.format(selected.total)}</span></div>
          {selectedItems.map(i=><div key={i.id} className="priority-item"><div><strong>{i.description}</strong><div className="muted">{i.quantity} × {money.format(i.unit_price)}</div></div><span>{money.format(Number(i.line_subtotal??i.quantity*i.unit_price))}</span></div>)}
          {selected.status==="draft"&&<form onSubmit={addItem} className="stack gap-12"><label>Producto<select value={productId} onChange={e=>setProductId(e.target.value)} required><option value="">Seleccionar producto activo</option>{products.map(p=><option key={p.id} value={p.id}>{p.name} · {money.format(p.sale_price)}</option>)}</select></label><label>Cantidad<input type="number" min="1" step="1" value={quantity} onChange={e=>setQuantity(e.target.value)} required /></label><button className="button primary">Añadir artículo</button></form>}
          <div className="top-actions" style={{flexWrap:"wrap"}}>
            {selected.status==="draft"&&<button className="button" onClick={()=>setQuoteStatus(selected,"sent")}>Marcar enviada</button>}
            {["draft","sent"].includes(selected.status)&&<button className="button primary" onClick={()=>setQuoteStatus(selected,"accepted")}>Aceptar</button>}
            {["draft","sent"].includes(selected.status)&&<button className="button danger" onClick={()=>setQuoteStatus(selected,"rejected")}>Rechazar</button>}
            <button className="button primary" onClick={()=>syncQuotationToOdoo(selected)}>Enviar / actualizar en Odoo</button>
            <button className="button" onClick={()=>printQuote(selected)}>Vista previa interna</button>
          </div>
          {products.length===0&&<div className="notice">No hay productos activos con precio aprobado. Completa costos/precio antes de cotizar.</div>}
        </div>}
      </div>
    </section>
  </div>;
}
function Calendar({ tenantId, reloadKey, refresh, notice }: { tenantId: string; reloadKey: number; refresh: () => void; notice: (s: string) => void }) {
  const [rows, setRows] = useState<CalendarEvent[]>([]); const [title, setTitle] = useState(""); const [start, setStart] = useState(""); const [end, setEnd] = useState(""); const [location, setLocation] = useState("");
  useEffect(() => { (async () => { const r = await supabase.from("calendar_events").select("id,title,description,event_type,status,starts_at,ends_at,location,created_at").eq("tenant_id", tenantId).order("starts_at", { ascending: true }).limit(500); if (r.error) notice(r.error.message); else setRows((r.data ?? []) as CalendarEvent[]); })(); }, [tenantId, reloadKey, notice]);
  async function add(e: FormEvent) { e.preventDefault(); const startsAt = isoFromLocal(start); const endsAt = isoFromLocal(end); if (!startsAt || !endsAt) return; const r = await supabase.from("calendar_events").insert({ tenant_id: tenantId, title, starts_at: startsAt, ends_at: endsAt, location: location || null, event_type: "meeting", status: "scheduled", timezone: "America/Santo_Domingo" }); if (r.error) return notice(r.error.message); setTitle(""); setStart(""); setEnd(""); setLocation(""); refresh(); }
  return <div className="stack gap-16"><form className="card" onSubmit={add}><h2>Nuevo evento</h2><div className="form-grid"><label>Título<input value={title} onChange={(e) => setTitle(e.target.value)} required /></label><label>Lugar<input value={location} onChange={(e) => setLocation(e.target.value)} /></label><label>Inicio<input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required /></label><label>Fin<input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} required /></label></div><div className="section-gap"><button className="button primary">Agendar</button></div></form><div className="card"><h2>Agenda</h2>{rows.map((r) => <div className="priority-item" key={r.id}><strong>{r.title}</strong><span>{date.format(new Date(r.starts_at))} · {r.location ?? r.status}</span></div>)}{rows.length === 0 && <Empty title="Calendario vacío" text="Agenda reuniones, demos y seguimientos." />}</div></div>;
}

function Automations({ tenantId, reloadKey, refresh, notice }: { tenantId: string; reloadKey: number; refresh: () => void; notice: (s: string) => void }) {
  const [rules, setRules] = useState<AutomationRule[]>([]); const [agents, setAgents] = useState<Agent[]>([]); const [name, setName] = useState(""); const [event, setEvent] = useState("lead.created");
  useEffect(() => { (async () => { const [r, a] = await Promise.all([supabase.from("automation_rules").select("id,name,description,status,trigger_type,trigger_event,created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }), supabase.from("ai_agents").select("id,name,purpose,status,model_provider,model_name,approval_mode,created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false })]); const err = r.error ?? a.error; if (err) notice(err.message); setRules((r.data ?? []) as AutomationRule[]); setAgents((a.data ?? []) as Agent[]); })(); }, [tenantId, reloadKey, notice]);
  async function add(e: FormEvent) { e.preventDefault(); const r = await supabase.from("automation_rules").insert({ tenant_id: tenantId, name, status: "draft", trigger_type: "event", trigger_event: event, trigger_config: {}, conditions: {}, stop_on_error: true }); if (r.error) return notice(r.error.message); setName(""); refresh(); }
  return <div className="stack gap-16"><div className="grid two-col"><form className="card" onSubmit={add}><h2>Nueva automatización</h2><label>Nombre<input value={name} onChange={(e) => setName(e.target.value)} required /></label><label style={{ marginTop: 12 }}>Evento<select value={event} onChange={(e) => setEvent(e.target.value)}><option value="lead.created">Lead creado</option><option value="opportunity.stage_changed">Oportunidad cambia de etapa</option><option value="conversation.created">Nueva conversación</option><option value="quotation.created">Cotización creada</option></select></label><div className="section-gap"><button className="button primary">Crear borrador</button></div></form><div className="card"><h2>Agentes IA</h2>{agents.map((a) => <div className="priority-item" key={a.id}><strong>{a.name}</strong><span>{a.status} · {a.model_provider}</span></div>)}{agents.length === 0 && <Empty title="Sin agentes configurados" text="La infraestructura de agentes está lista para configuración segura." />}</div></div><div className="card"><h2>Reglas</h2>{rules.map((r) => <div className="priority-item" key={r.id}><strong>{r.name}</strong><span>{r.status} · {r.trigger_event ?? r.trigger_type}</span></div>)}{rules.length === 0 && <Empty title="Sin automatizaciones" text="Crea tu primera regla; quedará en borrador hasta completar sus acciones." />}</div></div>;
}

function SettingsPanel({ tenantId, reloadKey, notice }: { tenantId: string; reloadKey: number; notice: (s: string) => void }) {
  const [settings, setSettings] = useState<TenantSettings | null>(null); const [erp,setErp]=useState<ErpStatus|null>(null); const [brand, setBrand] = useState(""); const [support, setSupport] = useState(""); const [primary, setPrimary] = useState("#0f766e"); const [saving, setSaving] = useState(false);
  useEffect(() => { (async () => { const [r,e]=await Promise.all([supabase.from("tenant_settings").select("tenant_id,brand_name,primary_color,support_email,timezone,currency,hide_platform_branding").eq("tenant_id", tenantId).maybeSingle(),supabase.from("tenant_erp_status").select("tenant_id,connection_id,provider,status,sync_direction,last_healthcheck_at,last_error,source_of_truth,inventory_synced_at,odoo_products").eq("tenant_id",tenantId).maybeSingle()]); if (r.error) return notice(r.error.message); if(e.error) notice(e.error.message); const s = r.data as TenantSettings | null; setSettings(s); setBrand(s?.brand_name ?? ""); setSupport(s?.support_email ?? ""); setPrimary(s?.primary_color ?? "#0f766e"); setErp(e.data as ErpStatus|null); })(); }, [tenantId, reloadKey, notice]);
  async function save(e: FormEvent) { e.preventDefault(); setSaving(true); const r = await supabase.from("tenant_settings").update({ brand_name: brand || null, support_email: support || null, primary_color: primary }).eq("tenant_id", tenantId); setSaving(false); if (r.error) return notice(r.error.message); notice("Configuración guardada."); }
  async function syncProducts(){ const r=await supabase.rpc("queue_tenant_odoo_sync",{p_tenant_id:tenantId,p_entity_type:"product",p_entity_id:null}); if(r.error)return notice(r.error.message); notice("Sincronización Odoo encolada."); }
  return <div className="stack gap-16">
    <div className="grid two-col"><form className="card" onSubmit={save}><h2>Marca y soporte</h2><div className="stack gap-12"><label>Nombre de marca<input value={brand} onChange={(e) => setBrand(e.target.value)} /></label><label>Email de soporte<input type="email" value={support} onChange={(e) => setSupport(e.target.value)} /></label><label>Color principal<input type="color" value={primary} onChange={(e) => setPrimary(e.target.value)} /></label><button className="button primary" disabled={saving}>{saving ? "Guardando…" : "Guardar"}</button></div></form><div className="card"><h2>Workspace</h2><div className="priority-list"><div className="priority-item"><strong>Moneda</strong><span>{settings?.currency ?? "DOP"}</span></div><div className="priority-item"><strong>Zona horaria</strong><span>{settings?.timezone ?? "America/Santo_Domingo"}</span></div><div className="priority-item"><strong>White-label</strong><span>{settings?.hide_platform_branding ? "Activo" : "Disponible"}</span></div><div className="priority-item"><strong>Tenant</strong><span>{tenantId.slice(0, 8)}…</span></div></div></div></div>
    <section className="card"><div className="eyebrow">ERP por tenant</div><h2>Odoo · fuente operativa oficial</h2>{erp ? <div className="stack gap-8"><div className="priority-item"><strong>Conexión</strong><span>{erp.status}</span></div><div className="priority-item"><strong>Dirección</strong><span>{erp.sync_direction}</span></div><div className="priority-item"><strong>Productos Odoo</strong><span>{Number(erp.odoo_products??0)}</span></div><div className="priority-item"><strong>Inventario sincronizado</strong><span>{erp.inventory_synced_at?date.format(new Date(erp.inventory_synced_at)):"Pendiente"}</span></div><div className="priority-item"><strong>Autoridad</strong><span>Productos · inventario · cotizaciones · PDF · pedidos · facturas</span></div>{erp.last_error&&<div className="notice">{erp.last_error}</div>}<button className="button" onClick={syncProducts}><RefreshCw size={14}/> Sincronizar productos/inventario</button></div> : <div className="empty"><strong>Odoo no conectado</strong><div>La arquitectura está preparada, pero este tenant necesita su URL, base de datos y credenciales seguras de Odoo antes de sincronizar.</div></div>}</section>
    <section className="card"><h2>Catálogo web conectado</h2><p className="muted">Los productos marcados como publicados pueden consumirse desde el endpoint público seguro del CRM. La web recibe disponibilidad y fecha de sincronización sin acceder directamente a las credenciales de Odoo.</p><code>/functions/v1/crm-public-catalog?tenant=&lt;slug-del-tenant&gt;</code></section>
  </div>;
}

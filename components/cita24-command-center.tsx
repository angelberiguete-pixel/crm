"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Handshake,
  LayoutDashboard,
  LogOut,
  Mail,
  MessageSquareReply,
  RefreshCw,
  Search,
  Send,
  Star,
  Target,
  Users,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type Prospect = {
  id: string;
  name: string;
  category: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  instagram: string | null;
  score: number | null;
  priority: number | null;
  stage: string;
  last_contact_at: string | null;
  next_action: string | null;
  next_action_at: string | null;
  service_interest: string | null;
  potential_value_cents: number | null;
  fit_signals: string | null;
  notes: string | null;
  converted_tenant_id: string | null;
  converted_at: string | null;
  source_data: {
    week1_batch?: string;
    week1_rank?: number;
    web_audit_v1?: {
      status?: string;
      facts?: string;
      hypothesis?: string;
      source_url?: string;
      verified_at?: string;
    };
    [key: string]: unknown;
  } | null;
};

type ProspectActivity = {
  id: string;
  prospect_id: string;
  activity_type: string;
  summary: string;
  outcome: string | null;
  occurred_at: string;
  next_action: string | null;
  next_action_at: string | null;
};

type Props = { slug: string[] };

type ViewKey = "all" | "priority" | "audit" | "outreach" | "response" | "meeting" | "proposal" | "client";

const dt = new Intl.DateTimeFormat("es-DO", { dateStyle: "medium", timeStyle: "short" });
const nav = [
  ["", "Resumen", LayoutDashboard],
  ["prospectos", "Prospectos", Users],
  ["outreach", "Outreach", Send],
  ["reuniones", "Reuniones", Handshake],
  ["propuestas", "Propuestas", FileText],
  ["clientes", "Clientes", CheckCircle2],
] as const;

const norm = (value: string | null | undefined) => (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function auditReady(p: Prospect) {
  return p.source_data?.web_audit_v1?.status === "ready_for_outreach";
}
function hasActivity(acts: ProspectActivity[], types: string[]) {
  return acts.some((a) => types.includes(norm(a.activity_type)));
}
function hasOutreach(acts: ProspectActivity[]) {
  return hasActivity(acts, ["email", "whatsapp", "call", "linkedin"]);
}
function hasResponse(p: Prospect, acts: ProspectActivity[]) {
  const stage = norm(p.stage);
  if (["respondio", "interesado", "objecion", "reunion", "negociacion"].some((x) => stage.includes(x))) return true;
  return acts.some((a) => {
    const o = norm(a.outcome);
    return ["interesado", "pregunta", "objecion", "no ahora", "no interesado", "reunion", "respondio"].some((x) => o.includes(x));
  });
}
function hasMeeting(p: Prospect, acts: ProspectActivity[]) {
  return norm(p.stage).includes("reunion") || hasActivity(acts, ["meeting"]);
}
function hasProposal(p: Prospect, acts: ProspectActivity[]) {
  return norm(p.stage).includes("propuesta") || hasActivity(acts, ["proposal"]);
}
function isClient(p: Prospect) {
  const stage = norm(p.stage);
  return Boolean(p.converted_tenant_id) || ["won", "ganado", "cliente"].some((x) => stage.includes(x));
}

export default function Cita24CommandCenter({ slug }: Props) {
  const router = useRouter();
  const section = slug[0] ?? "";
  const detailId = section === "prospectos" ? slug[1] : undefined;
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [platformAdmin, setPlatformAdmin] = useState(false);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [activities, setActivities] = useState<ProspectActivity[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((v) => v + 1), []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) { router.replace("/login"); return; }
        const access = await supabase.rpc("platform_current_access");
        if (!alive) return;
        if (access.error) throw access.error;
        const admin = Boolean((access.data as { is_platform_admin?: boolean } | null)?.is_platform_admin);
        setPlatformAdmin(admin);
        if (!admin) {
          setNotice("Esta vista está reservada para la administración de AUREVECTOR.");
          setLoading(false);
          return;
        }

        const [p, a] = await Promise.all([
          supabase
            .from("agency_prospects")
            .select("id,name,category,city,phone,email,website,instagram,score,priority,stage,last_contact_at,next_action,next_action_at,service_interest,potential_value_cents,fit_signals,notes,converted_tenant_id,converted_at,source_data")
            .eq("service_interest", "Sistema Cita-24")
            .not("priority", "is", null)
            .order("priority", { ascending: true })
            .limit(100),
          supabase
            .from("agency_prospect_activities")
            .select("id,prospect_id,activity_type,summary,outcome,occurred_at,next_action,next_action_at")
            .order("occurred_at", { ascending: false })
            .limit(2000),
        ]);
        const err = p.error ?? a.error;
        if (err) throw err;
        if (!alive) return;
        const rows = (p.data ?? []) as Prospect[];
        const ids = new Set(rows.map((x) => x.id));
        setProspects(rows);
        setActivities(((a.data ?? []) as ProspectActivity[]).filter((x) => ids.has(x.prospect_id)));
      } catch (e) {
        if (alive) setNotice(e instanceof Error ? e.message : "No se pudo cargar Cita-24.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [reloadKey, router]);

  const actsByProspect = useMemo(() => {
    const map = new Map<string, ProspectActivity[]>();
    for (const a of activities) {
      const rows = map.get(a.prospect_id) ?? [];
      rows.push(a);
      map.set(a.prospect_id, rows);
    }
    return map;
  }, [activities]);

  const counts = useMemo(() => {
    const c = { all: prospects.length, priority: prospects.filter((p) => (p.priority ?? 999) <= 100).length, audit: 0, outreach: 0, response: 0, meeting: 0, proposal: 0, client: 0 };
    for (const p of prospects) {
      const acts = actsByProspect.get(p.id) ?? [];
      if (auditReady(p)) c.audit++;
      if (hasOutreach(acts)) c.outreach++;
      if (hasResponse(p, acts)) c.response++;
      if (hasMeeting(p, acts)) c.meeting++;
      if (hasProposal(p, acts)) c.proposal++;
      if (isClient(p)) c.client++;
    }
    return c;
  }, [prospects, actsByProspect]);

  if (loading) return <div className="loading">Cargando Cita-24 Command Center…</div>;
  if (!platformAdmin) return <div className="auth-shell"><section className="auth-panel"><h1>Cita-24</h1><p className="muted">{notice || "Acceso no disponible."}</p><Link className="button" href="/crm">Volver al CRM</Link></section></div>;

  const detail = detailId ? prospects.find((x) => x.id === detailId) : undefined;
  const title = detail ? detail.name : nav.find(([key]) => key === section)?.[1] ?? "Cita-24";
  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><strong>Cita-24</strong><span>AUREVECTOR · Revenue Automation</span></div>
      <nav className="nav">
        {nav.map(([key,label,Icon]) => <Link key={key} className={section === key ? "active" : ""} href={`/revenue-command-center${key ? `/${key}` : ""}`}><Icon size={17}/>{label}</Link>)}
        <Link href="/crm"><Target size={17}/>CRM Core</Link>
      </nav>
      <div className="sidebar-footer"><div className="muted">Vertical: clínicas</div><button className="text-button" onClick={async()=>{await supabase.auth.signOut();router.replace("/login")}}><LogOut size={14}/> Salir</button></div>
    </aside>
    <main className="content">
      <header className="topbar"><div><div className="eyebrow">Semana 1 · Sistema Cita-24</div><h1>{title}</h1></div><div className="top-actions">{detail && <Link className="button" href="/revenue-command-center/prospectos"><ArrowLeft size={14}/> Volver</Link>}<button className="button" onClick={reload}><RefreshCw size={14}/> Actualizar</button></div></header>
      {notice && <div className="notice" style={{marginBottom:16}}>{notice}</div>}
      {!detail && <Funnel counts={counts}/>} 
      {detail ? <ProspectDetail prospect={detail} activities={actsByProspect.get(detail.id) ?? []}/> : section === "" ? <Overview prospects={prospects} actsByProspect={actsByProspect} counts={counts}/> : <ProspectTable prospects={prospects} actsByProspect={actsByProspect} view={sectionToView(section)}/>} 
    </main>
  </div>;
}

function sectionToView(section: string): ViewKey {
  if (section === "outreach") return "outreach";
  if (section === "reuniones") return "meeting";
  if (section === "propuestas") return "proposal";
  if (section === "clientes") return "client";
  return "all";
}

function Funnel({ counts }: { counts: Record<ViewKey, number> }) {
  const steps: Array<[ViewKey,string,React.ComponentType<{size?: number}>]> = [
    ["all","Prospectos",Users],["priority","Prioridad",Star],["audit","Auditoría",ClipboardCheck],["outreach","Outreach",Mail],
    ["response","Respuesta",MessageSquareReply],["meeting","Reunión",Handshake],["proposal","Propuesta",FileText],["client","Cliente",CheckCircle2],
  ];
  return <section className="card" style={{marginBottom:16}}><div className="eyebrow">Flujo operativo visible</div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:8,marginTop:10}}>{steps.map(([key,label,Icon])=><div className="metric" key={key}><div className="metric-label"><Icon size={14}/> {label}</div><div className="metric-value">{counts[key]}</div><div className="metric-sub">{key === "all" ? "Lote Semana 1" : "Verificado en CRM"}</div></div>)}</div></section>;
}

function Overview({ prospects, actsByProspect, counts }: { prospects: Prospect[]; actsByProspect: Map<string, ProspectActivity[]>; counts: Record<ViewKey,number> }) {
  const ready = prospects.filter((p) => auditReady(p)).slice(0,12);
  const next = prospects.filter((p) => !isClient(p)).slice(0,20);
  return <div className="stack gap-16">
    <section className="grid metrics"><Metric label="Lote activo" value={String(counts.all)} sub="Objetivo Semana 1: 100"/><Metric label="Auditados" value={String(counts.audit)} sub="Con evidencia pública"/><Metric label="Outreach" value={String(counts.outreach)} sub="Email / WhatsApp / llamada"/><Metric label="Respuestas" value={String(counts.response)} sub="Clasificadas"/><Metric label="Reuniones" value={String(counts.meeting)} sub="Registradas"/><Metric label="Propuestas" value={String(counts.proposal)} sub="Emitidas"/><Metric label="Clientes" value={String(counts.client)} sub="Convertidos"/><Metric label="Meta" value="3" sub="RD$135k MRR"/></section>
    <section className="grid two-col"><div className="card"><div className="topbar" style={{marginBottom:8}}><div><h2>Listos para outreach</h2><div className="muted">Auditoría pública terminada.</div></div><Link className="button" href="/revenue-command-center/outreach">Ver todos</Link></div>{ready.length ? ready.map((p)=><div className="priority-item" key={p.id}><div><strong>#{p.priority} · {p.name}</strong><div className="muted">Score {p.score ?? 0} · {p.city ?? "—"}</div></div><Link className="button small" href={`/revenue-command-center/prospectos/${p.id}`}>Abrir</Link></div>) : <Empty title="Aún sin auditados" text="Las auditorías aparecerán aquí al verificarse."/>}</div><div className="card"><h2>Próximas acciones</h2>{next.slice(0,10).map((p)=><div className="priority-item" key={p.id}><div><strong>#{p.priority} · {p.name}</strong><div className="muted">{p.next_action ?? "Auditar y contactar"}</div></div><span className="pill">{stageLabel(p,actsByProspect.get(p.id)??[])}</span></div>)}</div></section>
    <ProspectTable prospects={prospects} actsByProspect={actsByProspect} view="all" compact/>
  </div>;
}

function ProspectTable({ prospects, actsByProspect, view, compact=false }: { prospects: Prospect[]; actsByProspect: Map<string,ProspectActivity[]>; view: ViewKey; compact?: boolean }) {
  const [search,setSearch]=useState("");
  const rows = prospects.filter((p) => {
    const acts=actsByProspect.get(p.id)??[];
    const matchesView = view === "all" || view === "priority" || (view === "audit" && auditReady(p)) || (view === "outreach" && hasOutreach(acts)) || (view === "response" && hasResponse(p,acts)) || (view === "meeting" && hasMeeting(p,acts)) || (view === "proposal" && hasProposal(p,acts)) || (view === "client" && isClient(p));
    const matchesSearch = !search || `${p.name} ${p.city??""} ${p.email??""} ${p.phone??""}`.toLowerCase().includes(search.toLowerCase());
    return matchesView && matchesSearch;
  });
  const shown = compact ? rows.slice(0,20) : rows;
  return <section className="card"><div className="topbar" style={{marginBottom:12}}><div><h2>{rows.length} prospectos</h2><div className="muted">Prioridad, auditoría y seguimiento en la misma vista.</div></div>{!compact&&<label style={{minWidth:260}}><Search size={14}/> <input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Buscar clínica, ciudad o contacto"/></label>}</div><div className="table-wrap"><table className="data-table"><thead><tr><th>#</th><th>Prospecto</th><th>Score</th><th>Auditoría</th><th>Outreach</th><th>Estado</th><th>Próxima acción</th><th></th></tr></thead><tbody>{shown.map((p)=>{const acts=actsByProspect.get(p.id)??[];return <tr key={p.id}><td><strong>{p.priority ?? "—"}</strong></td><td><strong>{p.name}</strong><div className="muted">{p.city??"—"} · {p.category??"Clínica"}</div></td><td>{p.score??0}</td><td>{auditReady(p)?<span className="pill">Lista</span>:<span className="muted">Pendiente</span>}</td><td>{hasOutreach(acts)?<span className="pill">Registrado</span>:<span className="muted">Pendiente</span>}</td><td><span className="pill">{stageLabel(p,acts)}</span></td><td>{p.next_action??"Auditar y contactar"}</td><td><Link className="button small" href={`/revenue-command-center/prospectos/${p.id}`}>Abrir</Link></td></tr>})}</tbody></table>{shown.length===0&&<Empty title="Sin registros" text="No hay prospectos que cumplan este filtro."/>}</div>{compact&&rows.length>shown.length&&<div style={{marginTop:12}}><Link className="button" href="/revenue-command-center/prospectos">Ver los 100 prospectos</Link></div>}</section>;
}

function stageLabel(p: Prospect, acts: ProspectActivity[]) {
  if (isClient(p)) return "Cliente";
  if (hasProposal(p,acts)) return "Propuesta";
  if (hasMeeting(p,acts)) return "Reunión";
  if (hasResponse(p,acts)) return "Respuesta";
  if (hasOutreach(acts)) return "Outreach";
  if (auditReady(p)) return "Auditado";
  return "Prospecto";
}

function ProspectDetail({ prospect: p, activities }: { prospect: Prospect; activities: ProspectActivity[] }) {
  const audit=p.source_data?.web_audit_v1;
  return <div className="drawer-grid"><div className="stack gap-16"><section className="card"><div className="eyebrow">Prioridad #{p.priority ?? "—"} · Score {p.score ?? 0}</div><h2>{p.name}</h2><div className="grid three-col"><Info label="Ciudad" value={p.city}/><Info label="Categoría" value={p.category}/><Info label="Estado" value={stageLabel(p,activities)}/></div><p className="muted" style={{marginTop:12}}>{p.next_action ?? "Sin próxima acción"}</p></section><section className="card"><h3>Auditoría pública</h3>{auditReady(p)?<div className="stack gap-12"><div><div className="metric-label">HECHOS OBSERVADOS</div><p>{audit?.facts ?? p.fit_signals ?? "—"}</p></div><div><div className="metric-label">HIPÓTESIS A VALIDAR</div><p>{audit?.hypothesis ?? p.notes ?? "—"}</p></div>{audit?.source_url&&<a className="button" href={audit.source_url} target="_blank" rel="noreferrer">Abrir fuente pública</a>}</div>:<Empty title="Auditoría pendiente" text="Este prospecto todavía no tiene mini-auditoría pública verificada."/>}</section><section className="card"><h3>Timeline comercial</h3>{activities.length?activities.map((a)=><div className="timeline-item" key={a.id}><div><strong>{a.summary}</strong><div className="muted">{a.activity_type}{a.outcome?` · ${a.outcome}`:""}</div></div><small>{dt.format(new Date(a.occurred_at))}</small></div>):<Empty title="Sin actividad" text="Todavía no se ha registrado contacto con este prospecto."/>}</section></div><aside className="stack gap-16"><section className="card"><h3>Contacto</h3><p>{p.email ?? "Sin email"}<br/>{p.phone ?? "Sin teléfono"}</p><div className="stack gap-8">{p.website&&<a className="button" href={p.website} target="_blank" rel="noreferrer">Sitio web</a>}{p.instagram&&<a className="button" href={p.instagram} target="_blank" rel="noreferrer">Instagram</a>}{p.email&&<a className="button primary" href={`mailto:${p.email}`}>Abrir email</a>}</div></section><section className="card"><h3>Estado operativo</h3><Status label="Auditoría" ok={auditReady(p)}/><Status label="Outreach" ok={hasOutreach(activities)}/><Status label="Respuesta" ok={hasResponse(p,activities)}/><Status label="Reunión" ok={hasMeeting(p,activities)}/><Status label="Propuesta" ok={hasProposal(p,activities)}/><Status label="Cliente" ok={isClient(p)}/></section></aside></div>;
}

function Metric({label,value,sub}:{label:string;value:string;sub:string}){return <div className="metric"><div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className="metric-sub">{sub}</div></div>}
function Info({label,value}:{label:string;value:string|null|undefined}){return <div><div className="metric-label">{label}</div><strong>{value||"—"}</strong></div>}
function Status({label,ok}:{label:string;ok:boolean}){return <div className="priority-item"><span>{label}</span><span className={ok?"pill":"muted"}>{ok?"Completo":"Pendiente"}</span></div>}
function Empty({title,text}:{title:string;text:string}){return <div className="empty"><strong>{title}</strong><div>{text}</div></div>}

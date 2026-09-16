"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, ContactRound, Gauge, LayoutDashboard, LogOut, RefreshCw, Search, Settings2, Tag, Target, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Membership = { tenant_id: string; role: string };
type Opportunity = { id: string; pipeline_id: string; stage_id: string; company_id: string | null; contact_id: string | null; title: string; status: string; lead_score: number; acquisition_source: string | null; next_action: string | null; mrr_value: number; created_at: string };
type Stage = { id: string; pipeline_id: string; name: string; position: number; stage_type: string };
type Company = { id: string; name: string; sector: string | null; city: string | null; email: string | null; phone: string | null; whatsapp_phone: string | null };
type Contact = { id: string; company_id: string | null; display_name: string; email: string | null; phone: string | null; whatsapp_phone: string | null; status: string; source: string | null };
type TagRow = { id: string; name: string; tag_key: string; category: string };
type Binding = { contact_id: string; tag_id: string };

type Props = { slug: string[] };

const nav = [
  ["", "Resumen", LayoutDashboard],
  ["prospectos", "Prospectos", Target],
  ["pipeline", "Pipeline", Gauge],
  ["contactos", "Contactos", ContactRound],
] as const;

export default function SalesHub({ slug }: Props) {
  const router = useRouter();
  const section = slug[0] ?? "";
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [role, setRole] = useState("");
  const [platformAdmin, setPlatformAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [tags, setTags] = useState<TagRow[]>([]);
  const [bindings, setBindings] = useState<Binding[]>([]);

  const reload = useCallback(() => setReloadKey((v) => v + 1), []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) { router.replace("/login"); return; }
        const [m, access] = await Promise.all([
          supabase.from("memberships").select("tenant_id,role").eq("user_id", session.user.id).eq("status", "active"),
          supabase.rpc("platform_current_access"),
        ]);
        if (!alive) return;
        if (m.error) throw m.error;
        const memberships = (m.data ?? []) as Membership[];
        if (!memberships.length) { setNotice("Tu usuario no tiene un workspace activo."); setLoading(false); return; }
        const wanted = typeof window !== "undefined" ? window.localStorage.getItem("crm_active_tenant_id") : null;
        const chosen = memberships.find((x) => x.tenant_id === wanted) ?? memberships[0];
        setTenantId(chosen.tenant_id);
        setRole(chosen.role);
        const a = (access.data ?? {}) as { is_platform_admin?: boolean };
        setPlatformAdmin(Boolean(a.is_platform_admin));
      } catch (e) {
        setNotice(e instanceof Error ? e.message : "No se pudo abrir Ventas.");
        setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [router]);

  useEffect(() => {
    if (!tenantId) return;
    let alive = true;
    (async () => {
      setLoading(true); setNotice("");
      try {
        const [o, s, co, c, t, b] = await Promise.all([
          supabase.from("opportunities").select("id,pipeline_id,stage_id,company_id,contact_id,title,status,lead_score,acquisition_source,next_action,mrr_value,created_at").eq("tenant_id", tenantId).order("lead_score", { ascending: false }).limit(2000),
          supabase.from("pipeline_stages").select("id,pipeline_id,name,position,stage_type").eq("tenant_id", tenantId).order("position"),
          supabase.from("companies").select("id,name,sector,city,email,phone,whatsapp_phone").eq("tenant_id", tenantId).limit(2000),
          supabase.from("contacts").select("id,company_id,display_name,email,phone,whatsapp_phone,status,source").eq("tenant_id", tenantId).limit(2000),
          supabase.from("contact_tags").select("id,name,tag_key,category").eq("tenant_id", tenantId).order("name"),
          supabase.from("contact_tag_bindings").select("contact_id,tag_id").eq("tenant_id", tenantId).limit(10000),
        ]);
        const err = [o, s, co, c, t, b].find((x) => x.error)?.error;
        if (err) throw err;
        if (!alive) return;
        setOpps((o.data ?? []).map((x: any) => ({ ...x, lead_score: Number(x.lead_score ?? 0), mrr_value: Number(x.mrr_value ?? 0) })) as Opportunity[]);
        setStages((s.data ?? []) as Stage[]);
        setCompanies((co.data ?? []) as Company[]);
        setContacts((c.data ?? []) as Contact[]);
        setTags((t.data ?? []) as TagRow[]);
        setBindings((b.data ?? []) as Binding[]);
      } catch (e) {
        setNotice(e instanceof Error ? e.message : "No se pudieron cargar los datos de ventas.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [tenantId, reloadKey]);

  const companyMap = useMemo(() => new Map(companies.map((x) => [x.id, x])), [companies]);
  const contactMap = useMemo(() => new Map(contacts.map((x) => [x.id, x])), [contacts]);
  const stageMap = useMemo(() => new Map(stages.map((x) => [x.id, x])), [stages]);
  const tagMap = useMemo(() => new Map(tags.map((x) => [x.id, x])), [tags]);
  const tagsByContact = useMemo(() => {
    const map = new Map<string, TagRow[]>();
    for (const b of bindings) {
      const tag = tagMap.get(b.tag_id); if (!tag) continue;
      const rows = map.get(b.contact_id) ?? []; rows.push(tag); map.set(b.contact_id, rows);
    }
    return map;
  }, [bindings, tagMap]);

  if (loading && !tenantId) return <div className="loading">Cargando Ventas…</div>;

  const title = nav.find(([key]) => key === section)?.[1] ?? "Ventas";
  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><strong>Ventas</strong><span>Prospectos · Pipeline · Seguimiento</span></div>
      <nav className="nav">
        {nav.map(([key, label, Icon]) => <Link key={key} className={section === key ? "active" : ""} href={`/ventas${key ? `/${key}` : ""}`}><Icon size={17}/>{label}</Link>)}
        <Link href="/crm"><Building2 size={17}/>CRM</Link>
        {platformAdmin && <Link href="/admin"><Settings2 size={17}/>Consola Eurevector</Link>}
      </nav>
      <div className="sidebar-footer"><div className="muted">Rol: {role || "—"}</div><button className="text-button" onClick={async()=>{await supabase.auth.signOut();router.replace('/login')}}><LogOut size={14}/> Salir</button></div>
    </aside>
    <main className="content">
      <header className="topbar"><div><div className="eyebrow">Motor comercial</div><h1>{title}</h1></div><div className="top-actions"><Link className="button" href="/eurevector">Landing pública</Link><button className="button" onClick={reload}><RefreshCw size={14}/> Actualizar</button></div></header>
      {notice && <div className="notice" style={{marginBottom:16}}>{notice}</div>}
      {loading && <div className="notice" style={{marginBottom:16}}>Actualizando datos…</div>}
      {section === "" && <Overview opps={opps} contacts={contacts} companies={companies} tags={tags} stages={stages}/>} 
      {section === "prospectos" && <Prospects opps={opps} companyMap={companyMap} contactMap={contactMap} stageMap={stageMap} tagsByContact={tagsByContact}/>} 
      {section === "pipeline" && <Pipeline opps={opps} stages={stages} companyMap={companyMap}/>} 
      {section === "contactos" && <Contacts contacts={contacts} companyMap={companyMap} tagsByContact={tagsByContact}/>} 
    </main>
    <nav className="mobile-nav">{nav.map(([key,label,Icon])=><Link key={key} href={`/ventas${key?`/${key}`:""}`}><Icon size={17}/>{label}</Link>)}</nav>
  </div>;
}

function Metric({label,value,sub}:{label:string;value:string;sub:string}){return <div className="metric"><div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className="metric-sub">{sub}</div></div>}

function Overview({opps,contacts,companies,tags,stages}:{opps:Opportunity[];contacts:Contact[];companies:Company[];tags:TagRow[];stages:Stage[]}){
  const open=opps.filter(x=>x.status==='open'); const won=opps.filter(x=>x.status==='won');
  return <div className="stack gap-16">
    <section className="grid metrics"><Metric label="Prospectos" value={String(open.length)} sub="Oportunidades abiertas"/><Metric label="Contactos" value={String(contacts.length)} sub="Base centralizada"/><Metric label="Empresas" value={String(companies.length)} sub="Cuentas comerciales"/><Metric label="Etiquetas" value={String(tags.length)} sub="Segmentación activa"/><Metric label="Ganadas" value={String(won.length)} sub="Clientes cerrados"/><Metric label="Etapas" value={String(stages.length)} sub="Pipeline configurable"/></section>
    <section className="grid two-col"><div className="card"><h2>Flujo unificado</h2><p className="muted">Un lead nuevo entra como contacto, oportunidad y prospecto. Mantiene su fuente, UTM, etiquetas y próxima acción sin duplicar el negocio.</p><div className="top-actions"><Link className="button primary" href="/ventas/prospectos">Ver prospectos</Link><Link className="button" href="/ventas/pipeline">Abrir pipeline</Link></div></div><div className="card"><h2>Captación</h2><p className="muted">La landing pública de Eurevector ya está conectada al CRM. Los formularios de publicidad aterrizan directamente en Ventas.</p><Link className="button primary" href="/eurevector">Abrir landing</Link></div></section>
  </div>
}

function Prospects({opps,companyMap,contactMap,stageMap,tagsByContact}:{opps:Opportunity[];companyMap:Map<string,Company>;contactMap:Map<string,Contact>;stageMap:Map<string,Stage>;tagsByContact:Map<string,TagRow[]>}){
  const [search,setSearch]=useState("");
  const rows=opps.filter(x=>x.status==='open').filter(x=>{const co=x.company_id?companyMap.get(x.company_id):null;const ct=x.contact_id?contactMap.get(x.contact_id):null;return !search||`${co?.name??''} ${ct?.display_name??''} ${co?.city??''} ${co?.sector??''}`.toLowerCase().includes(search.toLowerCase())});
  return <div className="stack gap-16"><div className="card"><div className="topbar" style={{marginBottom:0}}><div><h2>{rows.length} prospectos</h2><div className="muted">Todos son contactos y oportunidades del mismo tenant.</div></div><label style={{minWidth:260}}><Search size={14}/> <input placeholder="Buscar empresa, contacto o ciudad" value={search} onChange={e=>setSearch(e.target.value)}/></label></div></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Prospecto</th><th>Etapa</th><th>Score</th><th>Contacto</th><th>Etiquetas</th><th>Próxima acción</th></tr></thead><tbody>{rows.map(o=>{const co=o.company_id?companyMap.get(o.company_id):null;const ct=o.contact_id?contactMap.get(o.contact_id):null;const tagRows=o.contact_id?tagsByContact.get(o.contact_id)??[]:[];return <tr key={o.id}><td><strong>{co?.name??ct?.display_name??o.title}</strong><div className="muted">{co?.city??co?.sector??o.acquisition_source??"—"}</div></td><td><span className="pill">{stageMap.get(o.stage_id)?.name??"Prospecto"}</span></td><td>{o.lead_score}</td><td>{ct?.email??ct?.whatsapp_phone??ct?.phone??co?.whatsapp_phone??co?.phone??"—"}</td><td><div style={{display:'flex',gap:4,flexWrap:'wrap'}}>{tagRows.slice(0,4).map(t=><span className="pill" key={t.id}><Tag size={11}/> {t.name}</span>)}</div></td><td>{o.next_action??"Contactar"}</td></tr>})}</tbody></table>{rows.length===0&&<div className="empty"><strong>Sin prospectos</strong><div>Los leads nuevos aparecerán aquí automáticamente.</div></div>}</div></div>
}

function Pipeline({opps,stages,companyMap}:{opps:Opportunity[];stages:Stage[];companyMap:Map<string,Company>}){
  const visible=stages.filter(s=>opps.some(o=>o.stage_id===s.id)||s.stage_type!=='lost').sort((a,b)=>a.position-b.position);
  return <div style={{display:'grid',gridTemplateColumns:`repeat(${Math.min(Math.max(visible.length,1),4)}, minmax(240px,1fr))`,gap:12,alignItems:'start',overflowX:'auto'}}>{visible.map(s=>{const rows=opps.filter(o=>o.stage_id===s.id);return <section className="card" key={s.id}><div className="topbar" style={{marginBottom:12}}><h2 style={{fontSize:16}}>{s.name}</h2><span className="pill">{rows.length}</span></div><div className="stack gap-8">{rows.slice(0,100).map(o=><div className="priority-item" key={o.id}><div><strong>{o.company_id?companyMap.get(o.company_id)?.name??o.title:o.title}</strong><div className="muted">Score {o.lead_score} · {o.next_action??'Sin próxima acción'}</div></div></div>)}</div></section>})}</div>
}

function Contacts({contacts,companyMap,tagsByContact}:{contacts:Contact[];companyMap:Map<string,Company>;tagsByContact:Map<string,TagRow[]>}){
  const [search,setSearch]=useState(""); const rows=contacts.filter(c=>!search||`${c.display_name} ${c.email??''} ${c.phone??''} ${c.company_id?companyMap.get(c.company_id)?.name??'':''}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="stack gap-16"><div className="card"><div className="topbar" style={{marginBottom:0}}><div><h2>{rows.length} contactos</h2><div className="muted">Prospectos, leads y clientes centralizados.</div></div><input placeholder="Buscar contacto" value={search} onChange={e=>setSearch(e.target.value)}/></div></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Contacto</th><th>Empresa</th><th>Estado</th><th>Canal</th><th>Etiquetas</th></tr></thead><tbody>{rows.map(c=><tr key={c.id}><td><strong>{c.display_name}</strong><div className="muted">{c.email??c.whatsapp_phone??c.phone??"—"}</div></td><td>{c.company_id?companyMap.get(c.company_id)?.name??"—":"—"}</td><td><span className="pill">{c.status}</span></td><td>{c.source??"—"}</td><td><div style={{display:'flex',gap:4,flexWrap:'wrap'}}>{(tagsByContact.get(c.id)??[]).slice(0,5).map(t=><span className="pill" key={t.id}>{t.name}</span>)}</div></td></tr>)}</tbody></table></div></div>
}

"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Building2, CalendarDays, FileText, Gauge, Inbox, Package, Plus, RefreshCw, Search, Target, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useActiveTenant } from "@/components/tenant-context";
import styles from "@/components/crm-commercial.module.css";

type Opportunity = {
  id: string; pipeline_id: string; stage_id: string; company_id: string | null; contact_id: string | null;
  title: string; value: number; currency: string; probability: number; status: string;
  expected_close_date: string | null; owner_user_id: string | null; acquisition_source: string | null;
  loss_reason: string | null; lead_score: number; next_action: string | null;
  next_action_at: string | null; last_activity_at: string | null; created_at: string;
};
type Stage = { id: string; pipeline_id: string; name: string; position: number; win_probability: number; stage_type: string };
type Pipeline = { id: string; name: string; is_default: boolean };
type Company = { id: string; name: string };
type Contact = { id: string; display_name: string; company_id: string | null };
type NewDeal = { title: string; value: string; companyId: string; contactId: string; expectedClose: string; source: string };
const blankDeal: NewDeal = { title: "", value: "", companyId: "", contactId: "", expectedClose: "", source: "" };
const nav = [
  ["", "Inicio", Gauge], ["companies", "Empresas", Building2], ["contacts", "Contactos", Users],
  ["revenue", "Oportunidades", Target], ["inbox", "Conversaciones", Inbox], ["products", "Productos", Package],
  ["quotations", "Cotizaciones", FileText], ["calendar", "Calendario", CalendarDays]
] as const;
const money = (value: number, currency = "DOP") => {
  try { return new Intl.NumberFormat("es-DO", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(value) || 0); }
  catch { return money(value, "DOP"); }
};
const stageStatus = (stage: Stage) => stage.stage_type === "won" ? "won" : stage.stage_type === "lost" ? "lost" : "open";
const localDateValue = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export default function CrmSales360() {
  const tenant = useActiveTenant();
  const tenantId = tenant?.tenant_id ?? null;
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [pipelineId, setPipelineId] = useState("");
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [contactFilter, setContactFilter] = useState("");
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<Opportunity | null>(null);
  const [nextAction, setNextAction] = useState("");
  const [nextActionAt, setNextActionAt] = useState("");
  const [savingFollowup, setSavingFollowup] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [draft, setDraft] = useState<NewDeal>({ ...blankDeal });
  const [savingNew, setSavingNew] = useState(false);

  useEffect(() => {
    setOpps([]); setStages([]); setPipelines([]); setCompanies([]); setContacts([]);
    const params=new URLSearchParams(window.location.search);
    const companyId=params.get("companyId")??"";
    const contactId=params.get("contactId")??"";
    setPipelineId(""); setSelected(null); setNotice(""); setSearch("");
    setCompanyFilter(companyId); setContactFilter(contactId);
    setDraft({...blankDeal,companyId,contactId});
    setNewOpen(params.get("new")==="1");
  }, [tenantId]);
  useEffect(() => {
    if (!tenantId) { setLoading(false); return; }
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const [o, s, p, c, ct] = await Promise.all([
          supabase.from("opportunities").select("id,pipeline_id,stage_id,company_id,contact_id,title,value,currency,probability,status,expected_close_date,owner_user_id,acquisition_source,loss_reason,lead_score,next_action,next_action_at,last_activity_at,created_at").eq("tenant_id", tenantId).order("updated_at", { ascending: false }).limit(1000),
          supabase.from("pipeline_stages").select("id,pipeline_id,name,position,win_probability,stage_type").eq("tenant_id", tenantId).order("position"),
          supabase.from("pipelines").select("id,name,is_default").eq("tenant_id", tenantId).order("created_at"),
          supabase.from("companies").select("id,name").eq("tenant_id", tenantId).order("name").limit(2000),
          supabase.from("contacts").select("id,display_name,company_id").eq("tenant_id", tenantId).order("display_name").limit(2000)
        ]);
        if (!alive) return;
        const err = [o, s, p, c, ct].find(result => result.error)?.error;
        if (err) { setNotice("No se pudo cargar información comercial: " + err.message); return; }
        const ps = (p.data ?? []) as Pipeline[];
        setOpps((o.data ?? []) as Opportunity[]);
        setStages((s.data ?? []) as Stage[]);
        setPipelines(ps);
        setCompanies((c.data ?? []) as Company[]);
        const companyRows=(c.data??[]) as Company[];
        const contactRows=(ct.data??[]) as Contact[];
        setContacts(contactRows);
        setCompanyFilter(value=>companyRows.some(row=>row.id===value)?value:"");
        setContactFilter(value=>contactRows.some(row=>row.id===value)?value:"");
        setDraft(current=>{
          const companyId=companyRows.some(row=>row.id===current.companyId)?current.companyId:"";
          const contactId=contactRows.some(row=>row.id===current.contactId&&(!companyId||row.company_id===companyId))?current.contactId:"";
          return {...current,companyId,contactId};
        });
        setPipelineId(current => ps.some(row => row.id === current) ? current : (ps.find(row => row.is_default)?.id ?? ps[0]?.id ?? ""));
      } catch {
        if (alive) setNotice("No se pudo conectar al servidor para cargar las oportunidades.");
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [tenantId, reload]);

  const companyMap = useMemo(() => new Map(companies.map(x => [x.id, x.name])), [companies]);
  const contactMap = useMemo(() => new Map(contacts.map(x => [x.id, x.display_name])), [contacts]);
  const visibleStages = useMemo(() => stages.filter(s => s.pipeline_id === pipelineId).sort((a, b) => a.position - b.position), [stages, pipelineId]);
  const filtered = useMemo(() => opps.filter(o => o.pipeline_id === pipelineId)
    .filter(o => !companyFilter || o.company_id===companyFilter)
    .filter(o => !contactFilter || o.contact_id===contactFilter)
    .filter(o => [o.title, o.company_id ? companyMap.get(o.company_id) : "", o.contact_id ? contactMap.get(o.contact_id) : "", o.acquisition_source ?? ""]
      .join(" ").toLocaleLowerCase("es").includes(search.trim().toLocaleLowerCase("es"))
  ), [opps, pipelineId, search, companyMap, contactMap, companyFilter, contactFilter]);
  const open = filtered.filter(o => o.status === "open");
  const openValue = open.reduce((total, o) => total + Number(o.value || 0), 0);
  const weighted = open.reduce((total, o) => total + Number(o.value || 0) * Number(o.probability || 0), 0);
  const overdue = open.filter(o => o.next_action_at && new Date(o.next_action_at).getTime() < Date.now()).length;
  const stale = open.filter(o => !o.last_activity_at || Date.now() - new Date(o.last_activity_at).getTime() > 7 * 86400000).length;

  function openFollowup(o: Opportunity) {
    setSelected(o);
    setNextAction(o.next_action ?? "");
    setNextActionAt(localDateValue(o.next_action_at));
  }

  async function saveFollowup(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!tenantId || !selected || savingFollowup) return;
    setSavingFollowup(true); setNotice("");
    const dueAt = nextActionAt ? new Date(nextActionAt).toISOString() : null;
    const action = nextAction.trim();
    try {
      const result = await supabase.from("opportunities").update({ next_action: action, next_action_at: dueAt })
        .eq("tenant_id", tenantId).eq("id", selected.id).select("id").maybeSingle();
      if (result.error || !result.data) throw new Error(result.error?.message ?? "No se pudo confirmar la actualización.");
      setOpps(rows => rows.map(o => o.id === selected.id ? { ...o, next_action: action, next_action_at: dueAt } : o));
      const task = await supabase.from("tasks").insert({
        tenant_id: tenantId, title: action, status: "todo", priority: "normal", due_at: dueAt,
        assigned_user_id: selected.owner_user_id, contact_id: selected.contact_id,
        company_id: selected.company_id, opportunity_id: selected.id,
        source: "manual", metadata: { kind: "opportunity_followup" }
      });
      setSelected(null);
      setNotice(task.error ? "Seguimiento guardado, pero no se creó la tarea: " + task.error.message : "Seguimiento guardado y tarea vinculada creada.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo guardar el seguimiento.");
    } finally { setSavingFollowup(false); }
  }

  async function move(o: Opportunity, stageId: string) {
    if (!tenantId || movingId || o.stage_id === stageId) return;
    const stage = visibleStages.find(s => s.id === stageId);
    if (!stage) return;
    setMovingId(o.id); setNotice("");
    try {
      const patch = { stage_id: stage.id, probability: Number(stage.win_probability), status: stageStatus(stage) };
      const result = await supabase.from("opportunities").update(patch).eq("tenant_id", tenantId).eq("id", o.id).select("id").maybeSingle();
      if (result.error || !result.data) throw new Error(result.error?.message ?? "No se pudo confirmar el cambio de etapa.");
      setOpps(rows => rows.map(x => x.id === o.id ? { ...x, ...patch } : x));
      setNotice("Oportunidad movida a " + stage.name + ".");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo cambiar la etapa.");
    } finally { setMovingId(null); }
  }

  async function createDeal(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!tenantId || savingNew) return;
    const title = draft.title.trim();
    const amount = Number(draft.value || 0);
    const first = visibleStages.find(s => stageStatus(s) === "open");
    if (!first) { setNotice("Este proceso comercial no tiene una etapa abierta configurada."); return; }
    if (!title || !Number.isFinite(amount) || amount < 0) { setNotice("Indica un nombre y un monto válido."); return; }
    if (draft.companyId && !companies.some(row=>row.id===draft.companyId)) { setNotice("Selecciona una empresa válida de esta cuenta."); return; }
    const dealContact=contacts.find(row=>row.id===draft.contactId);
    if (draft.contactId && !dealContact) { setNotice("Selecciona un contacto válido de esta cuenta."); return; }
    if (draft.companyId && dealContact?.company_id && dealContact.company_id!==draft.companyId) { setNotice("El contacto pertenece a otra empresa. Selecciona un contacto de la empresa elegida."); return; }
    setSavingNew(true); setNotice("");
    try {
      const payload = {
        tenant_id: tenantId, pipeline_id: pipelineId, stage_id: first.id, title, value: amount,
        currency: "DOP", probability: Number(first.win_probability), status: "open",
        company_id: draft.companyId || null, contact_id: draft.contactId || null,
        expected_close_date: draft.expectedClose || null, acquisition_source: draft.source.trim() || "manual"
      };
      const result = await supabase.from("opportunities").insert(payload).select("id").single();
      if (result.error || !result.data?.id) throw new Error(result.error?.message ?? "No se pudo confirmar la creación.");
      setNewOpen(false); setDraft({ ...blankDeal });
      setNotice("Oportunidad registrada correctamente.");
      setReload(i => i + 1);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo registrar la oportunidad.");
    } finally { setSavingNew(false); }
  }

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><strong>Look Social Media CRM</strong><span>{tenant?.tenant_name ?? "Gestión comercial"}</span></div>
      <nav className="nav" aria-label="Módulos del CRM">
        {nav.map(([key, label, Icon]) => <Link key={key} href={"/crm" + (key ? "/" + key : "")} className={key === "revenue" ? "active" : ""}>
          <Icon size={17} />{label}
        </Link>)}
      </nav>
    </aside>
    <main className="content">
      <header className="topbar">
        <div><div className="eyebrow">Ventas · {tenant?.tenant_name ?? "Empresa"}</div><h1>Oportunidades</h1></div>
        <div className={styles.headerActions}>
          <label>Proceso comercial<select aria-label="Proceso comercial" value={pipelineId} onChange={e => setPipelineId(e.target.value)}>
            {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select></label>
          <button type="button" className="button" onClick={() => setReload(i => i + 1)} aria-label="Actualizar oportunidades"><RefreshCw size={16}/> Actualizar</button>
        </div>
      </header>
      {notice && <div className={"notice " + styles.notice} role="status">{notice}</div>}
      {!tenantId ? <div className="empty">Selecciona una empresa para ver sus oportunidades.</div> : loading ? <div className="loading">Cargando oportunidades…</div> : <>
        <section className="grid metrics" aria-label="Indicadores de oportunidades">
          <div className="metric"><div className="metric-label">Valor del proceso abierto</div><div className="metric-value">{money(openValue)}</div><div className="metric-sub">{open.length} oportunidades abiertas</div></div>
          <div className="metric"><div className="metric-label">Valor ponderado</div><div className="metric-value">{money(weighted)}</div><div className="metric-sub">Según probabilidades registradas</div></div>
          <div className="metric"><div className="metric-label">Acciones vencidas</div><div className="metric-value">{overdue}</div><div className="metric-sub">Con fecha de seguimiento anterior</div></div>
          <div className="metric"><div className="metric-label">Sin actividad reciente</div><div className="metric-value">{stale}</div><div className="metric-sub">7 días o sin actividad registrada</div></div>
        </section>
        <section style={{marginTop:20}} aria-label="Gestión del proceso comercial">
          <div className={styles.toolRow}>
            <div><h2>Tablero de ventas</h2><p className={styles.sectionIntro}>Cambia cada etapa con el selector; funciona también desde Android.</p></div>
            <button className="button primary" type="button" onClick={() => {setDraft({...blankDeal});setNewOpen(true);}} disabled={!visibleStages.some(s => stageStatus(s) === "open")}><Plus size={17}/> Nueva oportunidad</button>
          </div>
          <div className="toolbar">
            <label className={styles.search}><Search size={17}/><input aria-label="Buscar oportunidades" placeholder="Buscar por negocio, empresa o contacto" value={search} onChange={e => setSearch(e.target.value)}/></label>
          </div>
          <div className={styles.contextFilters} aria-label="Filtrar oportunidades vinculadas">
            <label>Empresa
              <select aria-label="Filtrar oportunidades por empresa" value={companyFilter} onChange={e=>{setCompanyFilter(e.target.value);setContactFilter("");}}>
                <option value="">Todas las empresas</option>{companies.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label>Contacto
              <select aria-label="Filtrar oportunidades por contacto" value={contactFilter} onChange={e=>setContactFilter(e.target.value)}>
                <option value="">Todos los contactos</option>{contacts.filter(c=>!companyFilter||c.company_id===companyFilter).map(c=><option value={c.id} key={c.id}>{c.display_name}</option>)}
              </select>
            </label>
            {(companyFilter||contactFilter)&&<button type="button" className="button" onClick={()=>{setCompanyFilter("");setContactFilter("");}}>Quitar filtros</button>}
          </div>
          {visibleStages.length === 0 ? <div className="card"><div className="empty"><strong>Proceso comercial sin etapas</strong><div>Configura las etapas desde la administración antes de crear oportunidades.</div></div></div> :
          <div className={styles.board} role="region" aria-label="Etapas de ventas">
            {visibleStages.map(stage => {
              const items = filtered.filter(o => o.stage_id === stage.id);
              return <section className={styles.column} key={stage.id}>
                <div className={styles.columnHead}><div><strong>{stage.name}</strong><small>{money(items.reduce((sum,o) => sum + Number(o.value || 0), 0))}</small></div><span className="pill">{items.length}</span></div>
                <div className={styles.columnContent}>
                  {items.map(o => <article key={o.id} className={styles.deal}>
                    <strong>{o.title}</strong>
                    <p className={styles.sectionIntro}>{o.company_id ? companyMap.get(o.company_id) ?? "Empresa" : o.contact_id ? contactMap.get(o.contact_id) ?? "Contacto" : "Sin empresa vinculada"}</p>
                    <div className={styles.dealMeta}><span>{money(Number(o.value),o.currency)}</span><span className="pill">{Math.round(Number(o.probability)*100)}%</span></div>
                    <p className={styles.sectionIntro}>{o.next_action ? "Próxima acción: " + o.next_action : "Sin seguimiento pendiente"}</p>
                    <div className={styles.dealControls}>
                      <label className={styles.stageLabel}>Etapa
                        <select value={o.stage_id} onChange={e => move(o, e.target.value)} disabled={movingId !== null} aria-label={"Etapa de " + o.title}>
                          {visibleStages.map(s => <option value={s.id} key={s.id}>{s.name}</option>)}
                        </select>
                      </label>
                      <button type="button" className="button" onClick={() => openFollowup(o)}>Programar seguimiento</button>
                    </div>
                  </article>)}
                  {items.length === 0 && <div className={styles.emptyColumn}>No hay oportunidades en esta etapa.</div>}
                </div>
              </section>;
            })}
          </div>}
        </section>
      </>}
      {newOpen && <div className={styles.dialog} role="presentation" onMouseDown={e => {if(e.target === e.currentTarget && !savingNew)setNewOpen(false);}}>
        <form role="dialog" aria-modal="true" aria-labelledby="create-deal-title" className={"card stack gap-16 " + styles.dialogBody} onSubmit={createDeal}>
          <div><div className="eyebrow">Gestión comercial</div><h2 id="create-deal-title">Nueva oportunidad</h2></div>
          <label>Nombre de la oportunidad<input required maxLength={180} value={draft.title} onChange={e => setDraft(v => ({...v,title:e.target.value}))} placeholder="Ej. Servicios de marketing mensual"/></label>
          <div className="form-grid">
            <label>Valor estimado en RD$<input type="number" min="0" step="0.01" inputMode="decimal" value={draft.value} onChange={e => setDraft(v => ({...v,value:e.target.value}))}/></label>
            <label>Fecha prevista de cierre<input type="date" value={draft.expectedClose} onChange={e => setDraft(v => ({...v,expectedClose:e.target.value}))}/></label>
            <label>Empresa<select aria-label="Empresa" value={draft.companyId} onChange={e => setDraft(v => ({...v,companyId:e.target.value,contactId:""}))}><option value="">Sin empresa</option>{companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <label>Contacto<select aria-label="Contacto" value={draft.contactId} onChange={e => setDraft(v => ({...v,contactId:e.target.value}))}><option value="">Sin contacto</option>{contacts.filter(c=>!draft.companyId||c.company_id===draft.companyId).map(c => <option key={c.id} value={c.id}>{c.display_name}</option>)}</select></label>
            <label>Origen<input maxLength={80} value={draft.source} onChange={e => setDraft(v => ({...v,source:e.target.value}))} placeholder="Ej. Referido, Instagram"/></label>
          </div>
          <p className={styles.sectionIntro}>Se registrará en la primera etapa abierta del proceso seleccionado.</p>
          <div className={styles.dialogActions}><button type="button" className="button" disabled={savingNew} onClick={() => setNewOpen(false)}>Cancelar</button><button className="button primary" disabled={savingNew}>{savingNew ? "Guardando…" : "Guardar oportunidad"}</button></div>
        </form>
      </div>}
      {selected && <div className={styles.dialog} role="presentation" onMouseDown={e => {if(e.target === e.currentTarget && !savingFollowup)setSelected(null);}}>
        <form role="dialog" aria-modal="true" aria-labelledby="followup-title" className={"card stack gap-16 " + styles.dialogBody} onSubmit={saveFollowup}>
          <div><div className="eyebrow">Seguimiento</div><h2 id="followup-title">{selected.title}</h2></div>
          <label>Próxima acción<input required maxLength={300} value={nextAction} onChange={e => setNextAction(e.target.value)} placeholder="Llamar para confirmar propuesta"/></label>
          <label>Fecha y hora<input type="datetime-local" value={nextActionAt} onChange={e => setNextActionAt(e.target.value)}/></label>
          <div className={styles.dialogActions}><button type="button" className="button" disabled={savingFollowup} onClick={() => setSelected(null)}>Cancelar</button><button className="button primary" disabled={savingFollowup}>{savingFollowup ? "Guardando…" : "Guardar seguimiento"}</button></div>
        </form>
      </div>}
    </main>
    <nav className="mobile-nav" aria-label="Navegación principal">
      {nav.slice(0,5).map(([key,label,Icon]) => <Link key={key} href={"/crm" + (key ? "/" + key : "")} aria-current={key === "revenue" ? "page" : undefined} className={key === "revenue" ? "active" : ""}><Icon size={19}/><span>{label}</span></Link>)}
    </nav>
  </div>;
}

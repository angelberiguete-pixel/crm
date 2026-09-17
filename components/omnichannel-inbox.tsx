"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Building2, CircleAlert, Inbox, Search, Target, UserRound } from "lucide-react";
import { supabase } from "@/lib/supabase";

type TenantRow = { tenant_id: string; is_active: boolean };
type Channel = { id: string; provider: string; name: string; status: string };
type Contact = { id: string; company_id: string | null; display_name: string; email: string | null; phone: string | null; whatsapp_phone: string | null; source: string | null; status: string };
type Company = { id: string; name: string };
type Opportunity = { id: string; title: string; value: number; currency: string; status: string; next_action: string | null; next_action_at: string | null };
type Conversation = { id: string; channel_id: string; contact_id: string | null; opportunity_id: string | null; subject: string | null; status: string; priority: string; assigned_to: string | null; unread_count: number; last_message_at: string | null; metadata: Record<string, unknown> };
type Message = { id: string; conversation_id: string; direction: string; sender_type: string; message_type: string; body: string | null; status: string; sent_at: string | null; delivered_at: string | null; read_at: string | null; created_at: string };

const when = new Intl.DateTimeFormat("es-DO", { dateStyle: "short", timeStyle: "short" });
const money = new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP", maximumFractionDigits: 0 });

export default function OmnichannelInbox() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const tenants = await supabase.rpc("list_my_tenants");
      if (tenants.error) { setError(tenants.error.message); setLoading(false); return; }
      const rows = (tenants.data ?? []) as TenantRow[];
      const active = rows.find((row) => row.is_active) ?? rows[0];
      if (!active) { setError("No hay un tenant activo para abrir Inbox."); setLoading(false); return; }
      if (!active.is_active) {
        const activate = await supabase.rpc("set_active_tenant", { p_tenant_id: active.tenant_id });
        if (activate.error) { setError(activate.error.message); setLoading(false); return; }
      }
      setTenantId(active.tenant_id);
    })();
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      setLoading(true); setError("");
      const [channelRes, conversationRes, contactRes, companyRes, opportunityRes] = await Promise.all([
        supabase.from("channels").select("id,provider,name,status").eq("tenant_id", tenantId).order("name"),
        supabase.from("conversations").select("id,channel_id,contact_id,opportunity_id,subject,status,priority,assigned_to,unread_count,last_message_at,metadata").eq("tenant_id", tenantId).order("last_message_at", { ascending: false, nullsFirst: false }).limit(200),
        supabase.from("contacts").select("id,company_id,display_name,email,phone,whatsapp_phone,source,status").eq("tenant_id", tenantId),
        supabase.from("companies").select("id,name").eq("tenant_id", tenantId),
        supabase.from("opportunities").select("id,title,value,currency,status,next_action,next_action_at").eq("tenant_id", tenantId),
      ]);
      const failed = [channelRes, conversationRes, contactRes, companyRes, opportunityRes].find((r) => r.error);
      if (failed?.error) setError(failed.error.message);
      setChannels((channelRes.data ?? []) as Channel[]);
      setConversations((conversationRes.data ?? []) as Conversation[]);
      setContacts((contactRes.data ?? []) as Contact[]);
      setCompanies((companyRes.data ?? []) as Company[]);
      setOpportunities((opportunityRes.data ?? []) as Opportunity[]);
      const first = (conversationRes.data?.[0]?.id as string | undefined) ?? null;
      setSelectedId((current) => current ?? first);
      setLoading(false);
    })();
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId || !selectedId) { setMessages([]); return; }
    (async () => {
      const result = await supabase.from("messages").select("id,conversation_id,direction,sender_type,message_type,body,status,sent_at,delivered_at,read_at,created_at").eq("tenant_id", tenantId).eq("conversation_id", selectedId).order("created_at", { ascending: true }).limit(500);
      if (result.error) setError(result.error.message);
      setMessages((result.data ?? []) as Message[]);
    })();
  }, [tenantId, selectedId]);

  const contactMap = useMemo(() => new Map(contacts.map((row) => [row.id, row])), [contacts]);
  const companyMap = useMemo(() => new Map(companies.map((row) => [row.id, row])), [companies]);
  const opportunityMap = useMemo(() => new Map(opportunities.map((row) => [row.id, row])), [opportunities]);
  const channelMap = useMemo(() => new Map(channels.map((row) => [row.id, row])), [channels]);
  const filtered = useMemo(() => conversations.filter((row) => {
    const contact = row.contact_id ? contactMap.get(row.contact_id) : null;
    const opportunity = row.opportunity_id ? opportunityMap.get(row.opportunity_id) : null;
    const haystack = `${row.subject ?? ""} ${contact?.display_name ?? ""} ${contact?.email ?? ""} ${contact?.phone ?? ""} ${opportunity?.title ?? ""}`.toLowerCase();
    return (!query || haystack.includes(query.toLowerCase())) && (status === "all" || row.status === status) && (!onlyUnread || row.unread_count > 0);
  }), [conversations, contactMap, opportunityMap, query, status, onlyUnread]);
  const selected = conversations.find((row) => row.id === selectedId) ?? null;
  const contact = selected?.contact_id ? contactMap.get(selected.contact_id) : null;
  const company = contact?.company_id ? companyMap.get(contact.company_id) : null;
  const opportunity = selected?.opportunity_id ? opportunityMap.get(selected.opportunity_id) : null;
  const channel = selected ? channelMap.get(selected.channel_id) : null;

  async function updateConversation(patch: Partial<Pick<Conversation, "status" | "priority" | "unread_count">>) {
    if (!tenantId || !selected) return;
    const before = conversations;
    setConversations((rows) => rows.map((row) => row.id === selected.id ? { ...row, ...patch } : row));
    const result = await supabase.from("conversations").update(patch).eq("tenant_id", tenantId).eq("id", selected.id);
    if (result.error) { setConversations(before); setError(result.error.message); }
  }

  if (loading) return <div className="loading">Preparando Inbox omnicanal…</div>;
  return <main className="content" style={{ maxWidth: 1500, margin: "0 auto" }}>
    <header className="topbar">
      <div><div className="eyebrow">CRM 360 · Comunicaciones</div><h1>Inbox omnicanal</h1><div className="muted">WhatsApp-first · email · formularios · social · web/chat</div></div>
      <Link className="button" href="/crm"><ArrowLeft size={14}/> Volver al CRM</Link>
    </header>
    {error && <div className="notice" style={{ marginBottom: 16 }}>{error}</div>}
    <section className="grid" style={{ gridTemplateColumns: "minmax(280px, 0.9fr) minmax(360px, 1.5fr) minmax(260px, .8fr)", gap: 12 }}>
      <div className="card" style={{ padding: 12 }}>
        <div className="stack gap-8">
          <label style={{ position: "relative" }}><Search size={15} style={{ position: "absolute", left: 10, top: 11 }}/><input aria-label="Buscar conversaciones" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar persona, deal, email…" style={{ paddingLeft: 32 }}/></label>
          <div style={{ display: "flex", gap: 8 }}><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">Todos</option><option value="open">Abiertos</option><option value="pending">Pendientes</option><option value="closed">Cerrados</option></select><button className={`button ${onlyUnread ? "primary" : ""}`} onClick={() => setOnlyUnread((v) => !v)}>No leídos</button></div>
        </div>
        <div className="stack gap-8" style={{ marginTop: 12 }}>
          {filtered.length === 0 && <div className="empty"><strong>Sin conversaciones</strong><div>No hay conversaciones que coincidan con estos filtros.</div></div>}
          {filtered.map((row) => { const c = row.contact_id ? contactMap.get(row.contact_id) : null; const ch = channelMap.get(row.channel_id); return <button key={row.id} onClick={() => setSelectedId(row.id)} className="card" style={{ textAlign: "left", padding: 12, cursor: "pointer", borderWidth: selectedId === row.id ? 2 : 1 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><strong>{c?.display_name ?? row.subject ?? "Conversación"}</strong>{row.unread_count > 0 && <span className="badge">{row.unread_count}</span>}</div><div className="muted">{ch?.provider ?? "canal"} · {row.priority}</div><small className="muted">{row.last_message_at ? when.format(new Date(row.last_message_at)) : "Sin mensajes"}</small></button>; })}
        </div>
      </div>
      <div className="card" style={{ minHeight: 620 }}>
        {!selected ? <div className="empty"><Inbox/><strong>Selecciona una conversación</strong><div>El historial y el contexto aparecerán aquí.</div></div> : <>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}><div><div className="eyebrow">{channel?.provider ?? "canal"} · {channel?.name ?? ""}</div><h2>{contact?.display_name ?? selected.subject ?? "Conversación"}</h2></div><div style={{ display: "flex", gap: 8 }}><select value={selected.priority} onChange={(e) => updateConversation({ priority: e.target.value })}><option value="low">Baja</option><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option></select><select value={selected.status} onChange={(e) => updateConversation({ status: e.target.value })}><option value="open">Abierta</option><option value="pending">Pendiente</option><option value="closed">Cerrada</option></select>{selected.unread_count > 0 && <button className="button" onClick={() => updateConversation({ unread_count: 0 })}>Marcar leído</button>}</div></div>
          <div className="stack gap-8" style={{ marginTop: 18, maxHeight: 470, overflowY: "auto" }}>{messages.length === 0 && <div className="empty"><strong>Sin mensajes todavía</strong><div>La conversación existe, pero aún no tiene historial registrado.</div></div>}{messages.map((msg) => <div key={msg.id} className="card" style={{ maxWidth: "82%", alignSelf: msg.direction === "outbound" ? "flex-end" : "flex-start", padding: 12 }}><div className="eyebrow">{msg.direction === "outbound" ? "Equipo" : "Contacto"} · {msg.message_type}</div><div>{msg.body || "[Mensaje sin texto]"}</div><small className="muted">{when.format(new Date(msg.sent_at ?? msg.created_at))} · {msg.status}{msg.read_at ? " · leído" : msg.delivered_at ? " · entregado" : ""}</small></div>)}</div>
          <div className="notice" style={{ marginTop: 16 }}>Envío externo permanece desactivado hasta que exista un conector oficial validado end-to-end. Ningún token se almacena en el navegador.</div>
        </>}
      </div>
      <aside className="stack gap-12">
        <div className="card"><div className="eyebrow"><UserRound size={13}/> Contacto</div><h3>{contact?.display_name ?? "Sin vincular"}</h3>{contact ? <div className="stack gap-8"><span>{contact.whatsapp_phone || contact.phone || "Sin teléfono"}</span><span>{contact.email || "Sin email"}</span><span className="muted">Fuente: {contact.source || "sin fuente"}</span></div> : <p className="muted">Vincula la conversación a un contacto para completar el contexto 360°.</p>}</div>
        <div className="card"><div className="eyebrow"><Building2 size={13}/> Empresa</div><h3>{company?.name ?? "Sin empresa"}</h3></div>
        <div className="card"><div className="eyebrow"><Target size={13}/> Oportunidad</div>{opportunity ? <><h3>{opportunity.title}</h3><strong>{opportunity.currency === "DOP" ? money.format(Number(opportunity.value)) : `${opportunity.currency} ${Number(opportunity.value).toLocaleString("es-DO")}`}</strong><p className="muted">{opportunity.status}</p><div className="notice"><strong>Próxima acción</strong><div>{opportunity.next_action || "No definida"}</div>{opportunity.next_action_at && <small>{when.format(new Date(opportunity.next_action_at))}</small>}</div></> : <p className="muted">Sin oportunidad vinculada.</p>}</div>
        <div className="card"><div className="eyebrow"><CircleAlert size={13}/> Atención</div><strong>{selected?.unread_count ?? 0} sin leer</strong><div className="muted">Prioridad {selected?.priority ?? "—"}</div></div>
      </aside>
    </section>
  </main>;
}

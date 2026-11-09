"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { BarChart3, CheckCircle2, ClipboardList, Mail, RefreshCw, ShieldCheck, Send, Users, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useActiveTenant } from "@/components/tenant-context";
import styles from "./crm-email-campaigns.module.css";

type Overview = {
  tenant_id: string; contacts: number; with_email: number; opted_in: number;
  suppressed: number; draft_campaigns: number; sent: number; delivered: number;
  opened: number; clicked: number; bounced: number; replied: number;
  provider_connected: boolean; sending_enabled: boolean;
};
type Campaign = { id: string; name: string; subject: string; preview_text: string; body_text: string; status: string; created_at: string };
type Contact = { id: string; display_name: string | null; email: string | null; source: string | null };
type Consent = { contact_id: string; status: string; source: string; evidence: string; verified_at: string | null };
type ConsentStatus = "unknown" | "opted_in" | "opted_out" | "bounced" | "complained";
type SenderPreferences = { display_name: string; outreach_address: string; personal_followup_address: string; delivery_status: string; sends_enabled: boolean };
const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const number = (v: number | undefined) => new Intl.NumberFormat("es-DO").format(v ?? 0);
const formatDate = (v: string) => new Date(v).toLocaleDateString("es-DO", { day: "2-digit", month: "short", year: "numeric" });
const demoBody = "Hola {{nombre}},\n\nSoy Ángel Berigüete. Ayudo a empresas a organizar consultas, cotizaciones y seguimientos con un CRM y herramientas de inteligencia artificial.\n\n¿Te interesaría una breve conversación para conocer cómo funciona?\n\nSi prefieres no recibir más comunicaciones, puedes solicitarlo respondiendo a este correo.\n\nÁngel Berigüete";

export default function CrmEmailCampaigns() {
  const tenant = useActiveTenant();
  const tenantId = tenant?.tenant_id ?? "";
  const allowed = ["owner", "admin"].includes(tenant?.membership_role ?? "") && tenant?.tenant_slug !== "family-power";
  const [overview, setOverview] = useState<Overview | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [consents, setConsents] = useState<Consent[]>([]);
  const [sender, setSender] = useState<SenderPreferences | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [version, setVersion] = useState(0);
  const [editingId, setEditingId] = useState("");
  const [name, setName] = useState("Prospección B2B · presentación");
  const [subject, setSubject] = useState("Una idea para mejorar el seguimiento comercial");
  const [previewText, setPreviewText] = useState("Una propuesta de automatización y atención comercial");
  const [bodyText, setBodyText] = useState(demoBody);
  const [query, setQuery] = useState("");
  const [selectedContact, setSelectedContact] = useState("");
  const [status, setStatus] = useState<ConsentStatus>("unknown");
  const [source, setSource] = useState("");
  const [evidence, setEvidence] = useState("");

  const refresh = useCallback(() => setVersion(v => v + 1), []);

  useEffect(() => {
    let live = true;
    setOverview(null); setCampaigns([]); setContacts([]); setConsents([]); setSender(null);
    setError(""); setLoading(true);
    if (!tenantId || !allowed) { setLoading(false); return () => { live = false; }; }
    void Promise.all([
      supabase.rpc("marketing_email_overview", { p_tenant_id: tenantId }),
      supabase.from("marketing_email_campaigns")
        .select("id,name,subject,preview_text,body_text,status,created_at")
        .eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(100),
      supabase.from("contacts")
        .select("id,display_name,email,source").eq("tenant_id", tenantId)
        .not("email", "is", null).order("created_at", { ascending: false }).limit(500),
      supabase.from("marketing_email_consents")
        .select("contact_id,status,source,evidence,verified_at")
        .eq("tenant_id", tenantId).limit(500),
      supabase.from("marketing_email_sender_preferences")
        .select("display_name,outreach_address,personal_followup_address,delivery_status,sends_enabled")
        .eq("tenant_id", tenantId).maybeSingle(),
    ]).then(([summary, campaignData, contactData, consentData, senderData]) => {
      if (!live) return;
      const failure = [summary, campaignData, contactData, consentData, senderData].find(x => x.error);
      if (failure?.error) {
        setError("No se pudo cargar el módulo de email. Verifica que la migración se haya aplicado: " + failure.error.message);
        return;
      }
      const value = summary.data as Overview;
      if (!value || value.tenant_id !== tenantId) {
        setError("La información recibida no corresponde a la empresa activa.");
        return;
      }
      setOverview(value);
      setCampaigns((campaignData.data ?? []) as Campaign[]);
      setContacts(((contactData.data ?? []) as Contact[]).filter(c => validEmail.test(c.email ?? "")));
      setConsents((consentData.data ?? []) as Consent[]);
      setSender((senderData.data as SenderPreferences | null) ?? null);
    }).catch(() => { if (live) setError("Error al consultar las campañas."); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [tenantId, allowed, version]);

  const consentMap = useMemo(() => new Map(consents.map(c => [c.contact_id, c])), [consents]);
  const visibleContacts = useMemo(() => contacts.filter(c =>
    (c.display_name ?? "").toLocaleLowerCase().includes(query.toLocaleLowerCase()) ||
    (c.email ?? "").toLocaleLowerCase().includes(query.toLocaleLowerCase())
  ).slice(0, 60), [contacts, query]);
  const chosen = contacts.find(c => c.id === selectedContact);

  function edit(c: Campaign) {
    setEditingId(c.id); setName(c.name); setSubject(c.subject);
    setPreviewText(c.preview_text); setBodyText(c.body_text);
    document.getElementById("email-campaign-editor")?.scrollIntoView({ behavior: "smooth" });
  }
  function newDraft() {
    setEditingId(""); setName("Prospección B2B · presentación");
    setSubject("Una idea para mejorar el seguimiento comercial");
    setPreviewText("Una propuesta de automatización y atención comercial");
    setBodyText(demoBody);
  }

  async function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tenantId || !allowed || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const payload = { name: name.trim(), subject: subject.trim(), preview_text: previewText.trim(), body_text: bodyText.trim() };
      const result = editingId
        ? await supabase.from("marketing_email_campaigns").update(payload)
            .eq("tenant_id", tenantId).eq("id", editingId).eq("status", "draft").select("id").single()
        : await supabase.from("marketing_email_campaigns").insert({ ...payload, tenant_id: tenantId })
            .select("id").single();
      if (result.error) { setError(result.error.message); return; }
      setNotice("Borrador guardado en el CRM. No se envió ningún correo.");
      if (!editingId) setEditingId(result.data.id);
      refresh();
    } catch { setError("No se pudo guardar el borrador."); }
    finally { setBusy(false); }
  }

  function selectContact(id: string) {
    setSelectedContact(id);
    const c = consentMap.get(id);
    setStatus((c?.status as ConsentStatus | undefined) ?? "unknown");
    setSource(c?.source ?? "");
    setEvidence(c?.evidence ?? "");
  }

  async function saveConsent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tenantId || !selectedContact || !allowed || busy) return;
    if (status === "opted_in" && (source.trim().length < 3 || evidence.trim().length < 8)) {
      setError("Para autorizar email marketing debes registrar el origen y una evidencia comprobable.");
      return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await supabase.from("marketing_email_consents").upsert({
        tenant_id: tenantId, contact_id: selectedContact, status,
        source: source.trim(), evidence: evidence.trim(),
        verified_at: status === "opted_in" ? new Date().toISOString() : null,
      }, { onConflict: "tenant_id,contact_id" });
      if (result.error) { setError(result.error.message); return; }
      setNotice(status === "opted_in"
        ? "Autorización documentada. El envío sigue desactivado hasta conectar el proveedor."
        : "Preferencia guardada. Se respetará en la selección de destinatarios.");
      refresh();
    } catch { setError("No se pudo guardar la preferencia."); }
    finally { setBusy(false); }
  }

  if (!allowed) return <main className={styles.page}><h1>Acceso restringido</h1><p>Solo propietarios y administradores pueden preparar campañas de correo para su empresa.</p><Link href="/crm">Volver al CRM</Link></main>;

  const kpis = [
    ["Contactos con email", overview?.with_email, "En esta empresa"],
    ["Autorizados para campañas", overview?.opted_in, "Con evidencia registrada"],
    ["Excluidos", overview?.suppressed, "Bajas, rebotes y quejas"],
    ["Entregados", overview?.delivered, "Eventos verificados del proveedor"],
    ["Aperturas", overview?.opened, "Indicador aproximado"],
    ["Clics", overview?.clicked, "Acciones en enlaces"],
    ["Respuestas", overview?.replied, "Pendiente de sincronizar bandeja"],
    ["Rebotes", overview?.bounced, "Correos que no llegaron"],
  ] as const;

  return <main className={styles.page}>
    <header className={styles.header}>
      <div>
        <div className={styles.eyebrow}><Mail size={17}/> CANAL DE CORREO · {tenant?.tenant_name}</div>
        <h1>Campañas de email</h1>
        <p>Prepara campañas, gestiona autorizaciones y consulta resultados asociados a tu empresa, sin listas paralelas.</p>
      </div>
      <div className={styles.headerActions}>
        <Link href="/crm/marketing">Marketing</Link>
        <Link href="/crm/inbox">Conversaciones</Link>
        <button type="button" onClick={refresh} disabled={loading}><RefreshCw size={15}/> Actualizar</button>
      </div>
    </header>

    <section className={styles.statusBox} aria-label="Estado de conexión">
      <div><ShieldCheck size={20}/><strong>Modo seguro: preparación de campañas</strong></div>
      <p>Proveedor recomendado: Brevo. No hay cuenta remitente autenticada ni API de envío conectada. Los borradores no se distribuyen hasta verificar dominio, destinatarios y mecanismo de baja.</p>
      <div className={styles.statusActions}><a href="https://app.brevo.com/" target="_blank" rel="noopener noreferrer">Configurar Brevo</a><span>Envío masivo: desactivado</span></div>
    </section>

    <section className={styles.panel} aria-label="Identidades de correo comercial">
      <h2>Correos comerciales seleccionados</h2>
      {sender ? <>
        <p><strong>Contacto comercial:</strong> {sender.outreach_address}</p>
        <p><strong>Seguimiento personal:</strong> {sender.personal_followup_address}</p>
        <p className={styles.hint}>Ambas direcciones son preferencias administrativas. Que estén conectadas a ChatGPT no significa que Gmail esté conectado a Empresia. No se alternarán para aumentar límites ni se enviarán campañas desde estas direcciones por Brevo.</p>
      </> : <p className={styles.hint}>Todavía no hay correos comerciales configurados para esta empresa.</p>}
      <p className={styles.hint}>Campañas masivas: pendiente de dominio propio autenticado, proveedor conectado y audiencia autorizada. Envío: {sender?.sends_enabled ? "Requiere verificación" : "desactivado"}.</p>
    </section>

    {error && <p role="alert" className={styles.error}>{error}</p>}
    {notice && <p role="status" className={styles.success}>{notice}</p>}
    {loading ? <p role="status">Verificando datos y autorizaciones…</p> : <>
      <section className={styles.metrics} aria-label="Indicadores reales de email">
        {kpis.map(([label, value, hint]) => <div className={styles.metric} key={label}><span>{label}</span><strong>{number(value)}</strong><small>{hint}</small></div>)}
      </section>

      <div className={styles.columns}>
        <section className={styles.panel} id="email-campaign-editor">
          <div className={styles.panelHeader}><h2><ClipboardList size={20}/> Editor de campaña</h2><button type="button" onClick={newDraft}>Nueva</button></div>
          <form onSubmit={saveDraft} className={styles.form}>
            <label>Nombre interno<input required minLength={3} maxLength={120} value={name} onChange={e => setName(e.target.value)}/></label>
            <label>Asunto<input required minLength={3} maxLength={180} value={subject} onChange={e => setSubject(e.target.value)}/></label>
            <label>Texto de vista previa<input maxLength={240} value={previewText} onChange={e => setPreviewText(e.target.value)}/></label>
            <label>Mensaje en texto plano<textarea required minLength={20} maxLength={15000} rows={11} value={bodyText} onChange={e => setBodyText(e.target.value)}/></label>
            <p className={styles.hint}>Texto sugerido editable. Completa información real del remitente, dirección comercial, mecanismo de baja y revisión legal antes del envío. Las variables de ejemplo no se sustituyen automáticamente.</p>
            <button className={styles.primary} type="submit" disabled={busy}><CheckCircle2 size={16}/>{busy ? "Guardando…" : editingId ? "Guardar cambios" : "Crear borrador"}</button>
          </form>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}><h2><Send size={20}/> Campañas guardadas</h2><span>{campaigns.length}</span></div>
          {campaigns.length === 0 ? <p className={styles.empty}>No hay campañas todavía. Crea la primera a la izquierda.</p> :
            <div className={styles.campaignList}>{campaigns.map(c => <article className={styles.campaign} key={c.id}>
              <div><strong>{c.name}</strong><small>{c.subject}</small><span>Creada: {formatDate(c.created_at)} · {c.status === "draft" ? "Borrador sin enviar" : c.status}</span></div>
              {c.status === "draft" && <button type="button" onClick={() => edit(c)}>Editar</button>}
            </article>)}</div>}
          <div className={styles.panelDivider}/>
          <h3><BarChart3 size={18}/> Resultados y trazabilidad</h3>
          <p className={styles.hint}>Se medirán enviados, entregas, aperturas, clics, rebotes y bajas mediante eventos confirmados de Brevo. Una apertura no prueba que el mensaje fue leído; las respuestas requerirán conectar una bandeja de entrada. Una venta solo se contará cuando el CRM registre la oportunidad ganada y el cobro correspondiente.</p>
          <div className={styles.miniStats}><span>Enviados <strong>{number(overview?.sent)}</strong></span><span>Entregados <strong>{number(overview?.delivered)}</strong></span><span>Clics <strong>{number(overview?.clicked)}</strong></span></div>
          <p className={styles.hint}>No se registran métricas ficticias ni resultados de pruebas como ventas.</p>
        </section>
      </div>

      <section className={styles.panel}>
        <div className={styles.panelHeader}><h2><Users size={20}/> Audiencia y autorizaciones</h2><span>{number(overview?.opted_in)} con autorización documentada</span></div>
        <p>Revisamos los contactos ya existentes en el CRM. Si no hay evidencia de autorización para campañas, su estado permanece desconocido. Cada empresa mantiene su propio registro de consentimientos y bajas.</p>
        <div className={styles.audienceGrid}>
          <div>
            <label className={styles.searchLabel}>Buscar contacto<input type="search" value={query} placeholder="Nombre o correo" onChange={e => setQuery(e.target.value)}/></label>
            <div className={styles.contactList}>
              {visibleContacts.length === 0 && <p className={styles.empty}>No hay contactos con email que coincidan.</p>}
              {visibleContacts.map(c => <button key={c.id} type="button" onClick={() => selectContact(c.id)}
                className={selectedContact === c.id ? styles.selectedContact : styles.contact}>
                <span><strong>{c.display_name || "Sin nombre"}</strong><small>{c.email}</small></span>
                <em>{({ opted_in: "Autorizado", opted_out: "Baja", bounced: "Rebote", complained: "Queja", unknown: "Sin verificar" } as Record<string,string>)[consentMap.get(c.id)?.status ?? "unknown"]}</em>
              </button>)}
            </div>
            <small className={styles.hint}>Muestra como máximo 60 contactos por búsqueda; no crea ni exporta una lista nueva.</small>
          </div>
          <div className={styles.consentEditor}>
            <h3>Preferencia de comunicación</h3>
            {!chosen ? <p className={styles.empty}>Selecciona un contacto para documentar su autorización o solicitud de baja.</p> :
            <form onSubmit={saveConsent} className={styles.form}>
              <strong>{chosen.display_name || chosen.email}</strong>
              <small>{chosen.email}</small>
              <label>Estado<select value={status} onChange={e => setStatus(e.target.value as ConsentStatus)}>
                <option value="unknown">Sin verificar</option>
                <option value="opted_in">Autorización comprobada</option>
                <option value="opted_out">No desea recibir correos</option>
                <option value="bounced">Correo rebotado</option>
                <option value="complained">Reportó spam</option>
              </select></label>
              <label>Origen<input value={source} onChange={e => setSource(e.target.value)} maxLength={200} placeholder="Formulario, contrato, cliente existente…"/></label>
              <label>Evidencia<textarea rows={4} maxLength={1000} value={evidence} onChange={e => setEvidence(e.target.value)} placeholder="Fecha, formulario, documento, enlace o descripción verificable"/></label>
              {status === "opted_in" && <p className={styles.hint}>Solo marca autorización comprobada si tienes una base válida y evidencia real del permiso del destinatario.</p>}
              <button type="submit" className={styles.primary} disabled={busy}><ShieldCheck size={16}/> Guardar preferencia</button>
            </form>}
          </div>
        </div>
      </section>
      <div className={styles.footer}><XCircle size={16}/> No se ha activado el envío. Próximos pasos: autenticación SPF/DKIM/DMARC, dominio remitente, API del proveedor, webhook autenticado y sincronización de respuestas.</div>
    </>}
  </main>;
}

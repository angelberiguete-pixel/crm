"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowUpRight, MessageCircle, RefreshCw, FlaskConical } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { matchKeywords } from "@/lib/openreply/keyword-matcher";
import type { OpenReplySnapshot, OpenReplyStats } from "@/lib/openreply-contract";
import styles from "./openreply-automation-panel.module.css";

const errors: Record<string, string> = {
  authentication_required: "Tu sesión venció. Vuelve a iniciar sesión.",
  tenant_admin_required: "Selecciona esta empresa con una cuenta de propietario o administrador.",
  authorization_unavailable: "No pudimos comprobar tus permisos. Intenta de nuevo.",
  configuration_invalid: "La conexión necesita una revisión de configuración.",
  provider_key_rejected: "OpenReply rechazó la clave de consulta. Puede haber vencido o sido revocada.",
  provider_rate_limited: "OpenReply alcanzó su límite de consultas. Espera un minuto antes de actualizar.",
  provider_timeout: "OpenReply tardó demasiado en responder. Intenta de nuevo.",
  campaign_not_found: "La campaña ya no está disponible para esta empresa.",
};
type BridgeStatus = {
  tenant_id: string;
  routes: Array<{ id: string; is_enabled: boolean; verified_at: string | null }>;
  received_events: number;
  draft_quotes: number;
  last_received_at: string | null;
};

export default function OpenReplyAutomationPanel({ tenantId }: { tenantId: string }) {
  const [snapshot, setSnapshot] = useState<OpenReplySnapshot | null>(null);
  const [stats, setStats] = useState<OpenReplyStats | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [keywords, setKeywords] = useState("PRECIO, CATÁLOGO, COTIZACIÓN");
  const [comment, setComment] = useState("Hola, quiero una cotización 🙌");
  const [wholeWord, setWholeWord] = useState(true);
  const [tested, setTested] = useState(false);
  const [bridge, setBridge] = useState<BridgeStatus | null>(null);
  const [bridgeLoading, setBridgeLoading] = useState(true);
  const result = useMemo(() => matchKeywords(comment, keywords.split(",").map(k => k.trim()).filter(Boolean), wholeWord), [comment, keywords, wholeWord]);

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    setLoading(true); setError(""); setStats(null);
    if (!campaignId) setSnapshot(null);
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!alive) return;
      if (!session) throw new Error("authentication_required");
      const params = new URLSearchParams({ tenantId });
      if (campaignId) params.set("campaignId", campaignId);
      const response = await fetch("/api/integrations/openreply?" + params, {
        headers: { Authorization: "Bearer " + session.access_token },
        cache: "no-store", signal: controller.signal,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "provider_unavailable");
      if (payload.tenantId !== tenantId) throw new Error("provider_response_invalid");
      if (!alive) return;
      if (campaignId) setStats((payload as OpenReplySnapshot).stats ?? null);
      else setSnapshot(payload as OpenReplySnapshot);
    })().catch((e: unknown) => {
      if (alive) setError(e instanceof Error ? errors[e.message] ?? "No se pudo consultar OpenReply. La conexión no se ha verificado." : "No se pudo consultar OpenReply.");
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; controller.abort(); };
  }, [tenantId, revision, campaignId]);

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    setBridge(null); setBridgeLoading(true);
    (async () => {
      const { data, error: statusError } = await supabase.rpc("openreply_bridge_status", { p_tenant_id: tenantId }).abortSignal(controller.signal);
      if (!alive || statusError || !data || data.tenant_id !== tenantId || !Array.isArray(data.routes)
        || !Number.isSafeInteger(data.received_events) || !Number.isSafeInteger(data.draft_quotes)) return;
      setBridge(data as BridgeStatus);
    })().catch(() => {}).finally(() => { if (alive) setBridgeLoading(false); });
    return () => { alive = false; controller.abort(); };
  }, [tenantId, revision]);

  const connected = snapshot?.state === "connected_readonly";
  function test(e: FormEvent) { e.preventDefault(); setTested(true); }
  return <section className={styles.panel} aria-label="Automatización de Instagram con OpenReply">
    <div className={styles.header}>
      <div><div className={styles.eyebrow}>INSTAGRAM · OPENREPLY</div><h2>De un comentario a una conversación</h2>
        <p>Consulta tus campañas y prueba las palabras que activan una respuesta.</p></div>
      <span className={styles.badge}>{loading ? "Consultando…" : error ? "Consulta pendiente" : connected ? "API de campañas verificada" : "Sin conectar"}</span>
    </div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    <div className={styles.columns}>
      <div className={styles.column}>
        <div className={styles.row}><h3><MessageCircle size={18} /> Campañas de Instagram</h3>
          <button type="button" disabled={loading} className={styles.smallButton} onClick={() => { setCampaignId(null); setRevision(v => v + 1); }}><RefreshCw size={14} /> Actualizar campañas</button></div>
        {!connected && !loading && !error && <div className={styles.empty}>
          <strong>OpenReply todavía no está conectado a esta empresa.</strong>
          <p>Para operar necesita su instalación, una cuenta profesional de Instagram autorizada y una clave de consulta vinculada a este negocio.</p>
          <p>Puedes probar las palabras clave aquí mientras se completa la conexión.</p>
        </div>}
        {connected && <>
          <p className={styles.note}>Esta conexión consulta campañas y resultados. La creación y activación se realizan en OpenReply.</p>
          {snapshot?.campaigns?.length === 0 && <p className={styles.empty}>La API respondió correctamente. No hay campañas en este espacio de trabajo.</p>}
          <div className={styles.campaigns}>{snapshot?.campaigns?.map(c => <article key={c.id} className={styles.campaign}>
            <div className={styles.row}><strong>{c.name}</strong><span className={styles.tag}>{c.isActive ? "Activa en OpenReply" : "Pausada en OpenReply"}</span></div>
            <p>{c.keywords.length ? c.keywords.join(" · ") : "Sin palabras específicas"}</p>
            <button type="button" className={styles.smallButton} disabled={loading} aria-pressed={campaignId === c.id} onClick={() => { setStats(null); setCampaignId(c.id); setRevision(v => v + 1); }}>Ver resultados de {c.name}</button>
          </article>)}</div>
          <p className={styles.note}>Se muestran hasta 100 campañas. Una campaña activa no confirma la entrega de mensajes.</p>
          {snapshot?.dashboardUrl && <a className={styles.link} href={snapshot.dashboardUrl} target="_blank" rel="noopener noreferrer">Gestionar en OpenReply <ArrowUpRight size={15} /></a>}
        </>}
        {stats && <div className={styles.stats} role="region" aria-label="Resultados de la campaña">
          {([["Enviados", stats.sent], ["Fallidos", stats.failed], ["Pendientes", stats.pending], ["Omitidos", stats.skipped], ["Solicitudes a enlaces", stats.rawClicks]] as const).map(([label, value]) => <div key={label}><strong>{value.toLocaleString("es-DO")}</strong><span>{label}</span></div>)}
          <p>Las solicitudes a enlaces incluyen vistas previas y clics repetidos. No representan personas únicas ni ventas.</p>
        </div>}
      </div>
      <form className={styles.column} onSubmit={test} aria-label="Probador de palabras clave">
        <h3><FlaskConical size={18} /> Prueba antes de activar</h3>
        <label>Palabras clave, separadas por comas<input maxLength={2000} value={keywords} onChange={e => { setKeywords(e.target.value); setTested(false); }} required /></label>
        <label>Comentario de prueba<textarea rows={3} maxLength={4000} value={comment} onChange={e => { setComment(e.target.value); setTested(false); }} required /></label>
        <label className={styles.checkbox}><input type="checkbox" checked={wholeWord} onChange={e => { setWholeWord(e.target.checked); setTested(false); }} /> Coincidir con palabras completas</label>
        <button type="submit" className={styles.primary}>Probar coincidencia</button>
        <p className={styles.note}>La prueba usa el motor de palabras clave de OpenReply. No guarda datos ni envía mensajes.</p>
        {tested && <div className={styles.result} role="status">{result.matched ? <>Coincidencia: <strong>{result.matchedKeyword}</strong></> : "Sin coincidencia. Este comentario no activaría estas palabras clave."}</div>}
      </form>
    </div>
    <div className={styles.next}>
      <strong>Conversaciones, prospectos y seguimiento</strong>
      {bridgeLoading ? <p>Comprobando la conexión comercial de esta empresa…</p> : !bridge ?
        <p>No se pudo verificar la conexión comercial. Actualiza o solicita revisar su instalación y tus permisos.</p> : <>
        <p>{bridge.routes.some(r => r.is_enabled && r.verified_at) ? "Cuenta vinculada al receptor comercial." : "Pendiente de autorizar Instagram y verificar la cuenta de esta empresa."} La recepción de eventos no confirma por sí sola la entrega de mensajes en Instagram.</p>
        <div className={styles.stats} aria-label="Eventos comerciales recibidos">
          <div><strong>{bridge.received_events.toLocaleString("es-DO")}</strong><span>Eventos recibidos</span></div>
          <div><strong>{bridge.draft_quotes.toLocaleString("es-DO")}</strong><span>Borradores creados</span></div>
          <p>{bridge.last_received_at ? "Último evento: " + new Date(bridge.last_received_at).toLocaleString("es-DO") : "Todavía no hay eventos recibidos para esta empresa."}</p>
        </div>
      </>}
      <p>Al responder el cliente, el puente registra la conversación, el prospecto y una tarea. Una solicitud de cotización solo crea un borrador cuando la campaña tiene un producto aprobado y conserva su precio e inventario válidos. El envío requiere revisión humana.</p>
      <div className={styles.links}><Link href="/crm/inbox">Conversaciones</Link><Link href="/crm/contacts">Prospectos</Link><Link href="/crm/quotations">Cotizaciones</Link><Link href="/crm/tasks">Seguimientos</Link></div>
    </div>
  </section>;
}

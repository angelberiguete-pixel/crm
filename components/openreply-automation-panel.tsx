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
      <strong>Próxima conexión: de la conversación a la venta</strong>
      <p>El registro automático de prospectos, las cotizaciones y el seguimiento serán el siguiente paso al conectar las conversaciones al CRM. Por ahora puedes consultar campañas y probar palabras clave.</p>
      <div className={styles.links}><Link href="/crm/inbox">Conversaciones</Link><Link href="/crm/automations">Flujos del CRM</Link><Link href="/crm/marketing">Resultados comerciales</Link></div>
    </div>
  </section>;
}

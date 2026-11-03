"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ClipboardCheck, RefreshCw, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useActiveTenant } from "@/components/tenant-context";
import {
  EVIDENCE_FIELDS, EVIDENCE_SOURCES, evidenceStatus, validateContactEvidenceDraft,
} from "@/lib/contact-evidence";

type Contact = { id: string; display_name: string };
type Evidence = {
  id: string; contact_id: string; field_key: string; claim_text: string;
  source_kind: string; source_reference: string | null;
  source_excerpt: string | null; created_at: string;
};
type Review = {
  evidence_id: string; decision: "verified" | "rejected";
  note: string | null; reviewed_at: string;
};

export default function CrmContactEvidence() {
  const tenant = useActiveTenant();
  const tenantId = tenant?.tenant_id ?? null;
  const currentTenantRef = useRef(tenantId);
  currentTenantRef.current = tenantId;
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [contactId, setContactId] = useState("");
  const [fieldKey, setFieldKey] = useState("job_title");
  const [sourceKind, setSourceKind] = useState("manual");
  const [claim, setClaim] = useState("");
  const [reference, setReference] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [selectedReview, setSelectedReview] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    setContacts([]); setEvidence([]); setReviews([]); setContactId("");
    setSelectedReview(null); setReviewNote(""); setError(""); setNotice("");
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) { setLoading(false); return; }
    let alive = true;
    setLoading(true); setError("");
    (async () => {
      const [c, e, r] = await Promise.all([
        supabase.from("contacts").select("id,display_name")
          .eq("tenant_id", tenantId).order("display_name").limit(300),
        supabase.from("crm_contact_evidence")
          .select("id,contact_id,field_key,claim_text,source_kind,source_reference,source_excerpt,created_at")
          .eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(100),
        supabase.from("crm_contact_evidence_reviews")
          .select("evidence_id,decision,note,reviewed_at").eq("tenant_id", tenantId)
          .order("reviewed_at", { ascending: false }).limit(150),
      ]);
      if (!alive || currentTenantRef.current !== tenantId) return;
      if (c.error || e.error || r.error) {
        setError("No fue posible consultar las evidencias. Comprueba el permiso de administrador y que la migración esté aplicada.");
      } else {
        setContacts((c.data ?? []) as Contact[]);
        setEvidence((e.data ?? []) as Evidence[]);
        setReviews((r.data ?? []) as Review[]);
      }
      setLoading(false);
    })().catch(() => {
      if (alive && currentTenantRef.current === tenantId) {
        setError("No se pudo cargar el registro de evidencias."); setLoading(false);
      }
    });
    return () => { alive = false; };
  }, [tenantId, reload]);

  const decisions = useMemo(
    () => new Map(reviews.map(review => [review.evidence_id, review])),
    [reviews],
  );
  const contactNames = useMemo(
    () => new Map(contacts.map(contact => [contact.id, contact.display_name])),
    [contacts],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tenantId || busy) return;
    const invalid = validateContactEvidenceDraft({
      contactId, fieldKey, claim, sourceKind, reference, excerpt,
    });
    if (invalid) { setError(invalid); return; }
    const scopedTenant = tenantId;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await supabase.from("crm_contact_evidence").insert({
        tenant_id: scopedTenant, contact_id: contactId, field_key: fieldKey,
        claim_text: claim.trim(), source_kind: sourceKind,
        source_reference: reference.trim() || null, source_excerpt: excerpt.trim() || null,
      });
      if (result.error) throw result.error;
      if (currentTenantRef.current !== scopedTenant) return;
      setClaim(""); setReference(""); setExcerpt("");
      setNotice("Dato registrado como NO VERIFICADO. No se modificó la ficha del cliente.");
      setReload(value => value + 1);
    } catch (cause) {
      if (currentTenantRef.current === scopedTenant) {
        setError("No se pudo registrar: " + (cause instanceof Error ? cause.message : "Error de permisos."));
      }
    } finally {
      if (currentTenantRef.current === scopedTenant) setBusy(false);
    }
  }

  async function decide(id: string, decision: "verified" | "rejected") {
    if (!tenantId || busy || decisions.has(id)) return;
    if (decision === "verified" && reviewNote.trim().length < 8) {
      setError("Explica en al menos 8 caracteres cómo comprobaste este dato.");
      return;
    }
    const scopedTenant = tenantId;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await supabase.from("crm_contact_evidence_reviews").insert({
        tenant_id: scopedTenant, evidence_id: id, decision,
        note: reviewNote.trim() || null,
      });
      if (response.error) throw response.error;
      if (currentTenantRef.current !== scopedTenant) return;
      setSelectedReview(null); setReviewNote("");
      setNotice("Decisión humana guardada. El CRM no cambió datos ni envió mensajes.");
      setReload(value => value + 1);
    } catch (cause) {
      if (currentTenantRef.current === scopedTenant) {
        setError("No se pudo guardar la revisión: " + (cause instanceof Error ? cause.message : "Error de permisos."));
      }
    } finally {
      if (currentTenantRef.current === scopedTenant) setBusy(false);
    }
  }

  return (
    <main className="content">
      <header className="topbar">
        <div>
          <div className="eyebrow">Gestión empresarial · Control de IA</div>
          <h1>Evidencias de contactos</h1>
        </div>
        <div className="top-actions">
          <Link className="button" href={tenant?.tenant_slug === "family-power" ? "/crm/arm" : "/crm/employees"}>
            Volver a agentes
          </Link>
          <button className="button" type="button" onClick={() => setReload(value => value + 1)}>
            <RefreshCw size={16}/> Actualizar
          </button>
        </div>
      </header>
      <div className="notice"><ShieldCheck size={17}/>
        Solo propietarios y administradores de esta empresa. Las evidencias son propuestas; verificar una
        no altera el contacto, no habilita una integración y no envía mensajes.
      </div>
      {error && <div className="notice" role="alert">{error}</div>}
      {notice && <div className="notice" role="status">{notice}</div>}
      {loading ? <div className="loading">Cargando evidencias…</div> : (
        <div className="stack gap-12">
          <section className="card">
            <h2>Registrar información para revisión</h2>
            <p className="muted">Incluye la procedencia. No utilices datos inventados ni consideres una respuesta IA como evidencia suficiente.</p>
            <form onSubmit={event => void submit(event)} className="stack gap-12">
              <label>Contacto
                <select value={contactId} onChange={event => setContactId(event.target.value)} required>
                  <option value="">Seleccionar contacto</option>
                  {contacts.map(contact => <option key={contact.id} value={contact.id}>{contact.display_name}</option>)}
                </select>
              </label>
              <label>Dato a comprobar
                <select value={fieldKey} onChange={event => setFieldKey(event.target.value)}>
                  {EVIDENCE_FIELDS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </label>
              <label>Dato propuesto
                <textarea value={claim} onChange={event => setClaim(event.target.value)}
                  minLength={3} maxLength={1200} rows={3} required/>
              </label>
              <label>Tipo de fuente
                <select value={sourceKind} onChange={event => setSourceKind(event.target.value)}>
                  {EVIDENCE_SOURCES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </label>
              <label>Referencia o URL de la fuente (opcional)
                <input value={reference} onChange={event => setReference(event.target.value)}
                  maxLength={500} placeholder="Documento, mensaje, dirección web o referencia concreta"/>
              </label>
              <label>Fragmento observado (opcional)
                <textarea value={excerpt} onChange={event => setExcerpt(event.target.value)}
                  rows={2} maxLength={1000}/>
              </label>
              <button type="submit" className="button primary" disabled={busy || !contacts.length}>
                Registrar sin verificar
              </button>
            </form>
            {!contacts.length && <p className="muted">No hay contactos disponibles para esta empresa.</p>}
          </section>
          <section className="card" aria-label="Historial y revisión de evidencias">
            <h2><ClipboardCheck size={17}/> Revisiones</h2>
            {!evidence.length && <p className="muted">Todavía no hay evidencias registradas.</p>}
            {evidence.map(item => {
              const review = decisions.get(item.id);
              return <article key={item.id} className="stack gap-12" style={{borderTop:"1px solid var(--border)",paddingTop:16,marginTop:16}}>
                <div><strong>{contactNames.get(item.contact_id) ?? "Contacto"}</strong>
                  {" · "}{EVIDENCE_FIELDS.find(([key]) => key === item.field_key)?.[1] ?? item.field_key}
                </div>
                <p>{item.claim_text}</p>
                <p className="muted">Fuente: {item.source_kind}
                  {item.source_reference ? " · " + item.source_reference : ""}</p>
                {item.source_excerpt && <blockquote>{item.source_excerpt}</blockquote>}
                <p className="muted">{evidenceStatus(review?.decision ?? null)}
                  {" · "}{new Date(review?.reviewed_at ?? item.created_at).toLocaleString("es-DO")}</p>
                {review?.note && <p className="muted">Revisión: {review.note}</p>}
                {!review && (selectedReview === item.id ? (
                  <div className="stack gap-12">
                    <label>Motivo de revisión
                      <textarea value={reviewNote} maxLength={1000} rows={2}
                        onChange={event => setReviewNote(event.target.value)}
                        placeholder="Cómo se verificó o por qué se rechaza"/>
                    </label>
                    <div className="top-actions">
                      <button type="button" className="button primary" disabled={busy}
                        onClick={() => void decide(item.id,"verified")}>Verificar</button>
                      <button type="button" className="button" disabled={busy}
                        onClick={() => void decide(item.id,"rejected")}>Rechazar</button>
                      <button type="button" className="button" disabled={busy}
                        onClick={() => setSelectedReview(null)}>Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="button" disabled={busy}
                    onClick={() => { setSelectedReview(item.id); setReviewNote(""); }}>
                    Revisar evidencia
                  </button>
                ))}
              </article>;
            })}
          </section>
        </div>
      )}
    </main>
  );
}

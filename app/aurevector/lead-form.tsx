"use client";

import { FormEvent, useState } from "react";
import styles from "./aurevector.module.css";

const ENDPOINT = "https://ygipjqgyreeahslzorik.supabase.co/functions/v1/aurevector-lead-capture";

type Status = { kind: "idle" | "sending" | "success" | "error"; message?: string };

export default function LeadForm() {
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status.kind === "sending") return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setStatus({ kind: "sending" });

    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: data.get("full_name"),
          company: data.get("company"),
          email: data.get("email"),
          whatsapp: data.get("whatsapp"),
          selected_plan: data.get("selected_plan"),
          website: data.get("website"),
          sector: data.get("sector"),
          challenge: data.get("challenge"),
          company_website_check: data.get("company_website_check"),
          started_at: startedAt
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) throw new Error(payload?.message || "No pudimos registrar la solicitud.");
      form.reset();
      setStartedAt(Date.now());
      setStatus({ kind: "success", message: payload.message || "Solicitud recibida. Te contactaremos para revisar el sistema comercial." });
    } catch (error) {
      setStatus({ kind: "error", message: error instanceof Error ? error.message : "No pudimos registrar la solicitud." });
    }
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <div className={styles.twoFields}>
        <label>Nombre completo<input name="full_name" autoComplete="name" minLength={2} maxLength={120} required /></label>
        <label>Empresa<input name="company" autoComplete="organization" maxLength={160} /></label>
      </div>
      <div className={styles.twoFields}>
        <label>Correo<input name="email" type="email" autoComplete="email" maxLength={180} required /></label>
        <label>WhatsApp<input name="whatsapp" type="tel" autoComplete="tel" maxLength={40} placeholder="809-000-0000" required /></label>
      </div>
      <div className={styles.twoFields}>
        <label>Plan de interés
          <select name="selected_plan" defaultValue="">
            <option value="">Quiero recomendación / Growth Audit</option>
            <option value="essential">AUREVECTOR Essential — US$80/mes</option>
            <option value="growth">AUREVECTOR Growth — US$460/mes</option>
            <option value="scale">AUREVECTOR Scale — US$800/mes</option>
          </select>
        </label>
        <label>Sector<input name="sector" maxLength={120} placeholder="Clínica, servicios, inmobiliaria…" /></label>
      </div>
      <label>Sitio web o Instagram<input name="website" type="text" maxLength={240} placeholder="tuempresa.com" /></label>
      <label>¿Qué quieres mejorar o qué se está perdiendo hoy?
        <textarea name="challenge" rows={5} minLength={10} maxLength={1500} placeholder="Ej.: recibimos consultas por WhatsApp, pero muchas no reciben seguimiento después del primer contacto…" required />
      </label>
      <label className={styles.honeypot} aria-hidden="true">No completar<input name="company_website_check" tabIndex={-1} autoComplete="off" /></label>
      <button className={styles.submit} type="submit" disabled={status.kind === "sending"}>
        {status.kind === "sending" ? "Registrando solicitud…" : "Solicitar evaluación"}
      </button>
      <p className={styles.consent}>Enviar este formulario no activa ningún servicio ni cargo. AUREVECTOR te contactará para validar alcance y encaje.</p>
      {status.kind === "success" && <div className={styles.success} role="status">{status.message}</div>}
      {status.kind === "error" && <div className={styles.error} role="alert">{status.message}</div>}
    </form>
  );
}

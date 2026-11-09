"use client";

import { useEffect, useState, type FormEvent } from "react";
import styles from "./empresia-landing.module.css";

const ENDPOINT = "https://ygipjqgyreeahslzorik.supabase.co/functions/v1/look-social-media-lead-capture";
type FormState = "idle" | "submitting" | "success" | "error";
const sectors = ["Energía e inversores", "Servicios técnicos", "Salud y clínicas", "Inmobiliaria", "Automotriz", "Comercio", "Restaurantes", "Otro"];

export default function EmpresiaDemoForm() {
  const [state, setState] = useState<FormState>("idle");
  const [message, setMessage] = useState("");
  const [startedAt, setStartedAt] = useState(0);
  const [attribution, setAttribution] = useState<Record<string,string>>({});

  useEffect(() => {
    setStartedAt(Date.now());
    const query = new URLSearchParams(window.location.search);
    const values: Record<string,string> = {};
    for(const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
      values[key] = (query.get(key) ?? "").slice(0,120);
    }
    setAttribution(values);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "submitting" || !startedAt) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const contactPermission = data.get("consent") === "on";
    if (!contactPermission) {
      setMessage("Necesitamos tu autorización para responder a esta solicitud.");
      setState("error"); return;
    }
    setState("submitting"); setMessage("");
    try {
      const request = {
        full_name: data.get("full_name"),
        company: data.get("company"),
        email: data.get("email"),
        whatsapp: data.get("whatsapp"),
        sector: data.get("sector"),
        website: data.get("website"),
        challenge: data.get("challenge"),
        selected_plan: "",
        consent: true,
        company_website_check: data.get("company_website_check"),
        started_at: startedAt,
        attribution,
      };
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error("No pudimos registrar la solicitud. Intenta nuevamente o escríbenos por correo.");
      form.reset(); setState("success");
      setMessage("Recibimos tu solicitud. Revisaremos el contexto de tu negocio para responderte personalmente.");
      setStartedAt(Date.now());
    } catch(error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "No se pudo completar el registro.");
    }
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <div className={styles.formTwo}>
        <label>Nombre y apellido <input required name="full_name" autoComplete="name" minLength={2} maxLength={120} placeholder="Tu nombre" /></label>
        <label>Empresa <input required name="company" autoComplete="organization" maxLength={160} placeholder="Nombre del negocio" /></label>
      </div>
      <div className={styles.formTwo}>
        <label>Correo de contacto <input required name="email" type="email" autoComplete="email" maxLength={180} placeholder="nombre@empresa.com" /></label>
        <label>WhatsApp <input name="whatsapp" type="tel" autoComplete="tel" maxLength={40} placeholder="+1 809 000 0000" /></label>
      </div>
      <div className={styles.formTwo}>
        <label>Sector <select name="sector" defaultValue="" required><option value="" disabled>Selecciona</option>{sectors.map(s=><option key={s} value={s}>{s}</option>)}</select></label>
        <label>Sitio web o Instagram (opcional)<input name="website" maxLength={240} placeholder="tuempresa.com" /></label>
      </div>
      <label>¿Qué proceso comercial te gustaría mejorar?
        <textarea name="challenge" required minLength={10} maxLength={1500} rows={4}
          placeholder="Ej.: recibimos consultas por WhatsApp pero se quedan sin cotizar o dar seguimiento."/>
      </label>
      <div aria-hidden="true" className={styles.trap}><label>Sitio web de confirmación<input name="company_website_check" tabIndex={-1} autoComplete="off"/></label></div>
      <label className={styles.permission}>
        <input type="checkbox" name="consent" required/>
        <span>Autorizo a Empresia a contactarme por correo o teléfono para responder a esta solicitud de evaluación. Esto no me suscribe automáticamente a campañas promocionales.</span>
      </label>
      <button type="submit" className={styles.formButton} disabled={state === "submitting" || !startedAt}>
        {state === "submitting" ? "Registrando solicitud…" : "Solicitar evaluación gratuita"}
      </button>
      {state !== "idle" && state !== "submitting" && <p role={state === "error" ? "alert" : "status"} className={state === "error" ? styles.formError : styles.formSuccess}>{message}</p>}
      <p className={styles.privacy}>Sin pago ni registro de usuario. El envío no activa automáticamente un contrato, suscripción ni mensajes de marketing.</p>
    </form>
  );
}

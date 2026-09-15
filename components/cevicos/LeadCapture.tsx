"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const MAKE_HOOK = "https://hook.us2.make.com/6eii88v3svujk6rbss9hihxxdjsjbesq";

export default function LeadCapture({ referralCode }: { referralCode?: string }) {
  const router = useRouter();
  const ref = useMemo(() => (referralCode || "").trim().toUpperCase(), [referralCode]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!ref) return;
    const key = `cevicos_click_${ref}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    const sessionId = crypto.randomUUID();
    void supabase.rpc("track_land_sales_click", {
      p_referral_code: ref,
      p_session_id: sessionId,
      p_source_url: window.location.href,
    });
  }, [ref]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const currentForm = e.currentTarget;
    const form = new FormData(currentForm);
    const name = String(form.get("name") || "").trim();
    const phone = String(form.get("phone") || "").trim();
    const email = String(form.get("email") || "").trim();
    const company = String(form.get("company") || "").trim();
    const use = String(form.get("use") || "").trim();
    const budget = String(form.get("budget") || "").trim();
    const notes = String(form.get("notes") || "").trim();

    setBusy(true);
    setMessage("");
    const { data, error } = await supabase.rpc("register_land_lead", {
      p_referral_code: ref || null,
      p_buyer_name: name,
      p_buyer_phone: phone,
      p_buyer_email: email,
      p_buyer_company: company || null,
      p_desired_use: use || null,
      p_budget: budget || null,
      p_notes: notes || null,
      p_source_url: window.location.href,
    });
    if (error) {
      setBusy(false);
      return setMessage(error.message);
    }

    const leadId = typeof data === "string" ? data : String(data || "");
    const payload = new URLSearchParams({
      event: "buyer_lead",
      lead_id: leadId,
      name,
      phone,
      email,
      company,
      use,
      budget,
      referral_code: ref,
      ficha_url: `${window.location.origin}/Ficha_812_Tareas_Cevicos.pdf`,
      source_url: window.location.href,
    });
    fetch(MAKE_HOOK, { method: "POST", mode: "no-cors", body: payload }).catch(() => undefined);

    currentForm.reset();
    setBusy(false);
    router.push(`/cevicos/gracias${leadId ? `?lead=${encodeURIComponent(leadId)}` : ""}`);
  }

  return <form onSubmit={submit} style={{display:"grid",gap:12,padding:24,borderRadius:20,background:"#fff",border:"1px solid #e2ddcf",boxShadow:"0 14px 40px rgba(23,51,41,.08)"}}>
    <div style={{fontWeight:900,fontSize:20}}>Solicitar ficha comercial</div>
    <div style={{fontSize:13,color:"#64766f",lineHeight:1.55}}>Al enviar tus datos pasarás a una página de confirmación con acceso inmediato al PDF. Tu solicitud también quedará registrada para seguimiento comercial.</div>
    {ref && <div style={{fontSize:12,color:"#6a7d75"}}>Código de corredor: <strong>{ref}</strong></div>}
    <input name="name" required placeholder="Nombre completo" style={input}/>
    <input name="phone" required placeholder="WhatsApp / teléfono" style={input}/>
    <input name="email" type="email" required placeholder="Correo electrónico" style={input}/>
    <input name="company" placeholder="Empresa (opcional)" style={input}/>
    <input name="use" placeholder="Uso o proyecto previsto" style={input}/>
    <input name="budget" placeholder="Presupuesto aproximado" style={input}/>
    <textarea name="notes" rows={3} placeholder="Cuéntanos qué necesitas" style={input}/>
    <label style={{display:"flex",gap:8,alignItems:"flex-start",fontSize:12,color:"#65776f",lineHeight:1.45}}><input name="privacy" type="checkbox" required style={{width:"auto",marginTop:3}}/><span>Acepto que mis datos se usen para atender esta solicitud y darle seguimiento comercial relacionado con esta propiedad.</span></label>
    {message && <div style={{fontSize:13,color:"#9b2c2c"}}>{message}</div>}
    <button disabled={busy} style={{border:0,borderRadius:14,padding:"14px 18px",fontWeight:900,background:"#173329",color:"#fff",display:"inline-flex",gap:8,justifyContent:"center",alignItems:"center",cursor:"pointer"}}>{busy ? "Registrando…" : <>Solicitar ficha <Send size={16}/></>}</button>
    <small style={{color:"#71827b",lineHeight:1.5}}>La solicitud no constituye oferta, reserva ni aceptación contractual. Toda operación queda sujeta a verificación legal, registral, catastral y técnica.</small>
  </form>;
}

const input: React.CSSProperties = {width:"100%",boxSizing:"border-box",border:"1px solid #d8d5cc",borderRadius:12,padding:"12px 13px",font:"inherit",background:"#fbfaf7"};

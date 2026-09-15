"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Send } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function LeadCapture({ referralCode }: { referralCode?: string }) {
  const ref = useMemo(() => (referralCode || "").trim().toUpperCase(), [referralCode]);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!ref) return;
    const key = `cevicos_click_${ref}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    const sessionId = crypto.randomUUID();
    supabase.rpc("track_land_sales_click", {
      p_referral_code: ref,
      p_session_id: sessionId,
      p_source_url: window.location.href,
    });
  }, [ref]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setMessage("");
    const { error } = await supabase.rpc("register_land_lead", {
      p_referral_code: ref || null,
      p_buyer_name: String(form.get("name") || ""),
      p_buyer_phone: String(form.get("phone") || ""),
      p_buyer_email: String(form.get("email") || "") || null,
      p_buyer_company: String(form.get("company") || "") || null,
      p_desired_use: String(form.get("use") || "") || null,
      p_budget: String(form.get("budget") || "") || null,
      p_notes: String(form.get("notes") || "") || null,
      p_source_url: window.location.href,
    });
    setBusy(false);
    if (error) return setMessage(error.message);
    setSent(true);
    e.currentTarget.reset();
  }

  if (sent) return <div style={{padding:24,borderRadius:18,background:"#edf5ef",border:"1px solid #cfe1d5",display:"flex",gap:12,alignItems:"center"}}><CheckCircle2/><div><strong>Solicitud registrada</strong><div style={{marginTop:4,color:"#587068"}}>Tu interés quedó asociado al canal que te trajo a esta propiedad.</div></div></div>;

  return <form onSubmit={submit} style={{display:"grid",gap:12,padding:24,borderRadius:20,background:"#fff",border:"1px solid #e2ddcf",boxShadow:"0 14px 40px rgba(23,51,41,.08)"}}>
    <div style={{fontWeight:900,fontSize:20}}>Solicitar información</div>
    {ref && <div style={{fontSize:12,color:"#6a7d75"}}>Código de corredor: <strong>{ref}</strong></div>}
    <input name="name" required placeholder="Nombre completo" style={input}/>
    <input name="phone" required placeholder="WhatsApp / teléfono" style={input}/>
    <input name="email" type="email" placeholder="Correo electrónico" style={input}/>
    <input name="company" placeholder="Empresa (opcional)" style={input}/>
    <input name="use" placeholder="Uso o proyecto previsto" style={input}/>
    <input name="budget" placeholder="Presupuesto aproximado" style={input}/>
    <textarea name="notes" rows={3} placeholder="Cuéntanos qué necesitas" style={input}/>
    {message && <div style={{fontSize:13,color:"#9b2c2c"}}>{message}</div>}
    <button disabled={busy} style={{border:0,borderRadius:14,padding:"14px 18px",fontWeight:900,background:"#173329",color:"#fff",display:"inline-flex",gap:8,justifyContent:"center",alignItems:"center",cursor:"pointer"}}>{busy ? "Registrando…" : <>Enviar solicitud <Send size={16}/></>}</button>
    <small style={{color:"#71827b",lineHeight:1.5}}>La solicitud no constituye oferta, reserva ni aceptación contractual. Toda operación queda sujeta a verificación legal y documental.</small>
  </form>;
}

const input: React.CSSProperties = {width:"100%",boxSizing:"border-box",border:"1px solid #d8d5cc",borderRadius:12,padding:"12px 13px",font:"inherit",background:"#fbfaf7"};

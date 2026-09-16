"use client";

import { FormEvent, useState } from "react";
import { Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LeadCapture() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

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
    const timeframe = String(form.get("timeframe") || "").trim();
    const notes = String(form.get("notes") || "").trim();
    const fullPurchase = form.get("full_purchase") === "on";

    if (!fullPurchase) return setMessage("Confirma que entiendes que la oferta actual corresponde a la venta completa de las 812 tareas.");

    const qualificationNotes = [
      "Alcance: compra completa de las 812 tareas",
      timeframe ? `Plazo estimado: ${timeframe}` : "",
      notes ? `Nota del interesado: ${notes}` : "",
    ].filter(Boolean).join(" | ");

    setBusy(true);
    setMessage("");
    const { data, error } = await supabase.rpc("register_land_lead", {
      p_referral_code: null,
      p_buyer_name: name,
      p_buyer_phone: phone,
      p_buyer_email: email,
      p_buyer_company: company || null,
      p_desired_use: use || null,
      p_budget: budget || null,
      p_notes: qualificationNotes || null,
      p_source_url: window.location.href,
    });
    if (error) {
      setBusy(false);
      return setMessage(error.message);
    }

    const leadId = typeof data === "string" ? data : String(data || "");
    if (leadId) {
      supabase.functions.invoke("land-sales-notify", { body: { lead_id: leadId } }).catch(() => undefined);
    }

    currentForm.reset();
    setBusy(false);
    router.push(`/cevicos/gracias${leadId ? `?lead=${encodeURIComponent(leadId)}` : ""}`);
  }

  return <form onSubmit={submit} style={{display:"grid",gap:12,padding:24,borderRadius:20,background:"#fff",border:"1px solid #e2ddcf",boxShadow:"0 14px 40px rgba(23,51,41,.08)"}}>
    <div style={{fontWeight:900,fontSize:20}}>Solicitar ficha comercial</div>
    <div style={{fontSize:13,color:"#64766f",lineHeight:1.55}}>Atendemos directamente a compradores interesados en la propiedad completa. Tus datos quedarán en el CRM para seguimiento.</div>

    <input name="name" required placeholder="Nombre completo" style={input}/>
    <input name="phone" required placeholder="WhatsApp / teléfono" style={input}/>
    <input name="email" type="email" required placeholder="Correo electrónico" style={input}/>
    <input name="company" placeholder="Empresa (opcional)" style={input}/>

    <select name="budget" required defaultValue="" style={input}>
      <option value="" disabled>Rango aproximado de inversión</option>
      <option value="Menos de RD$40 millones">Menos de RD$40 millones</option>
      <option value="RD$40–55 millones">RD$40–55 millones</option>
      <option value="RD$55–65 millones">RD$55–65 millones</option>
      <option value="RD$65 millones o más">RD$65 millones o más</option>
      <option value="Prefiero conversarlo">Prefiero conversarlo</option>
    </select>

    <input name="use" required placeholder="¿Qué uso o proyecto contempla para la propiedad?" style={input}/>

    <select name="timeframe" required defaultValue="" style={input}>
      <option value="" disabled>¿En qué plazo desea decidir?</option>
      <option value="0–30 días">0–30 días</option>
      <option value="31–60 días">31–60 días</option>
      <option value="61–90 días">61–90 días</option>
      <option value="Más de 90 días">Más de 90 días</option>
      <option value="Solo estoy evaluando">Solo estoy evaluando</option>
    </select>

    <label style={{display:"flex",gap:8,alignItems:"flex-start",fontSize:12,color:"#445d54",lineHeight:1.45,padding:"10px 12px",border:"1px solid #d8d5cc",borderRadius:12,background:"#fbfaf7"}}>
      <input name="full_purchase" type="checkbox" required style={{width:"auto",marginTop:3}}/>
      <span>Entiendo que la oferta actual corresponde a la <strong>venta completa de las aproximadamente 812 tareas</strong>.</span>
    </label>

    <textarea name="notes" rows={3} placeholder="Pregunta o comentario adicional (opcional)" style={input}/>

    <label style={{display:"flex",gap:8,alignItems:"flex-start",fontSize:12,color:"#65776f",lineHeight:1.45}}><input name="privacy" type="checkbox" required style={{width:"auto",marginTop:3}}/><span>Acepto que mis datos se usen para atender esta solicitud y darle seguimiento comercial relacionado con esta propiedad.</span></label>

    {message && <div style={{fontSize:13,color:"#9b2c2c"}}>{message}</div>}
    <button disabled={busy} style={{border:0,borderRadius:14,padding:"14px 18px",fontWeight:900,background:"#173329",color:"#fff",display:"inline-flex",gap:8,justifyContent:"center",alignItems:"center",cursor:"pointer"}}>{busy ? "Registrando…" : <>Solicitar ficha <Send size={16}/></>}</button>
    <small style={{color:"#71827b",lineHeight:1.5}}>La solicitud no constituye oferta, reserva ni aceptación contractual. Esta web no procesa depósitos ni pagos. Toda operación queda sujeta a verificación legal, registral, catastral y técnica.</small>
  </form>;
}

const input: React.CSSProperties = {width:"100%",boxSizing:"border-box",border:"1px solid #d8d5cc",borderRadius:12,padding:"12px 13px",font:"inherit",background:"#fbfaf7"};

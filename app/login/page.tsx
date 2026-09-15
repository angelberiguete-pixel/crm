"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login"|"signup"|"reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => { supabase.auth.getSession().then(({data,error}) => { if(error)setMessage(error.message);else if (data.session) router.replace("/revenue-command-center"); }).catch(()=>setMessage("No se pudo comprobar la sesión. Intenta de nuevo.")); }, [router]);

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setMessage("");
    try {
      if(mode === "reset") { const result=await supabase.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin+"/reset-password"});if(result.error)throw result.error;setMessage("Si el correo está registrado, recibirás un enlace para recuperar tu acceso.");return; }
      const result = mode === "login"
        ? await supabase.auth.signInWithPassword({email:email.trim(), password})
        : await supabase.auth.signUp({email:email.trim(), password,options:{emailRedirectTo:window.location.origin+"/login"}});
      if(result.error)throw result.error;
      if(result.data.session)router.replace("/revenue-command-center");else setMessage("Revisa tu correo para confirmar tu cuenta.");
    } catch(e) { setMessage((e as Error).message||"No se pudo completar el acceso."); } finally { setBusy(false); }
  }

  return <main className="auth-shell">
    <section className="auth-panel">
      <div className="eyebrow">AUREVECTOR · CRM</div>
      <h1>{mode==="reset"?"Recupera tu acceso":"Tu operación comercial, conectada."}</h1>
      <p className="muted">Gestiona empresas, contactos, oportunidades y próximos pasos desde tu espacio AUREVECTOR.</p>
      <form onSubmit={submit} className="stack gap-16">
        <label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email" /></label>
        {mode!=="reset"&&<label>Contraseña<input type="password" minLength={8} value={password} onChange={e=>setPassword(e.target.value)} required autoComplete={mode === "login" ? "current-password" : "new-password"}/></label>}
        {message && <div role="status" className="notice">{message}</div>}
        <button className="button primary" disabled={busy}>{busy ? "Procesando…" : mode === "login" ? "Entrar" : mode==="reset"?"Enviar enlace":"Crear cuenta"}</button>
      </form>
      <button disabled={busy} type="button" className="text-button" onClick={()=>{setMode(mode === "login" ? "signup" : "login"); setMessage("");}}>
        {mode === "login" ? "¿Primera vez? Crear cuenta" : "Ya tengo cuenta"}
      </button>
      {mode==="login"&&<div><button disabled={busy} className="text-button" onClick={()=>{setMode("reset");setMessage("")}}>Olvidé mi contraseña</button></div>}
    </section>
  </main>;
}

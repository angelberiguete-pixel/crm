"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password,setPassword]=useState("");
  const [confirm,setConfirm]=useState("");
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const [ready,setReady]=useState(false);

  useEffect(()=>{
    supabase.auth.getSession().then(({data})=>{
      setReady(Boolean(data.session));
      if(!data.session) setMessage("Abre esta página desde el enlace de recuperación que recibiste por correo.");
    });
    const {data:{subscription}}=supabase.auth.onAuthStateChange((event,session)=>{
      if(event==="PASSWORD_RECOVERY" || session) setReady(true);
    });
    return ()=>subscription.unsubscribe();
  },[]);

  async function submit(e:FormEvent){
    e.preventDefault();
    setMessage("");
    if(password.length<8) return setMessage("La contraseña debe tener al menos 8 caracteres.");
    if(password!==confirm) return setMessage("Las contraseñas no coinciden.");
    setBusy(true);
    const {error}=await supabase.auth.updateUser({password});
    setBusy(false);
    if(error) return setMessage(error.message);
    setMessage("Contraseña actualizada. Entrando al Super Admin…");
    const access=await supabase.rpc("platform_current_access");
    const value=(access.data??{}) as {is_platform_admin?:boolean};
    router.replace(value.is_platform_admin?"/platform-admin":"/crm");
  }

  return <main className="auth-shell">
    <section className="auth-panel">
      <div className="eyebrow">Look Social Media · CRM</div>
      <h1>Crear nueva contraseña</h1>
      <p className="muted">Este formulario solo funciona después de abrir el enlace seguro enviado por correo.</p>
      <form onSubmit={submit} className="stack gap-16">
        <label>Nueva contraseña<input type="password" minLength={8} value={password} onChange={e=>setPassword(e.target.value)} required autoComplete="new-password" disabled={!ready} /></label>
        <label>Confirmar contraseña<input type="password" minLength={8} value={confirm} onChange={e=>setConfirm(e.target.value)} required autoComplete="new-password" disabled={!ready} /></label>
        {message && <div className="notice">{message}</div>}
        <button className="button primary" disabled={busy||!ready}>{busy?"Guardando…":"Guardar contraseña"}</button>
      </form>
    </section>
  </main>;
}

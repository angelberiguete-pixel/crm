"use client";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { supabase, getAuthLinkError, isPasswordRecoverySession } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const router=useRouter();
  const [password,setPassword]=useState(""),[confirm,setConfirm]=useState("");
  const [message,setMessage]=useState("Validando enlace de recuperación…"),[busy,setBusy]=useState(false),[ready,setReady]=useState(false),[changed,setChanged]=useState(false);
  useEffect(()=>{
    let alive=true;
    async function validate(session:Session|null) {
      const linkError=getAuthLinkError();
      if(linkError || !isPasswordRecoverySession(session)) {
        if(alive){setReady(false);setMessage(linkError||"Abre esta página desde un enlace de recuperación válido enviado a tu correo.");}
        return;
      }
      const result=await supabase.auth.getUser(session!.access_token);
      if(!alive)return;
      setReady(!result.error&&Boolean(result.data.user));
      setMessage(result.error?"La sesión de recuperación venció. Solicita un enlace nuevo.":"");
    }
    const {data:{subscription}}=supabase.auth.onAuthStateChange((event,session)=>{
      if(event==="PASSWORD_RECOVERY") void validate(session);
      if(event==="SIGNED_OUT") setReady(false);
    });
    supabase.auth.getSession().then(({data})=>validate(data.session)).catch(()=>{if(alive)setMessage("No se pudo validar el enlace. Intenta nuevamente.");});
    return ()=>{alive=false;subscription.unsubscribe();};
  },[]);

  async function closeSessions() {
    // Revoke other sessions first: an SDK logout error may remove the local
    // session, which would make an unauthenticated retry a misleading success.
    const result=await supabase.auth.signOut({scope:"others"});
    if(result.error){setMessage("Contraseña actualizada. No pudimos cerrar las sesiones anteriores; pulsa Cerrar sesiones y continuar para reintentar.");return;}
    const local=await supabase.auth.signOut({scope:"local"});
    if(local.error){setMessage("Las sesiones anteriores están cerradas. Intenta nuevamente para cerrar esta sesión.");return;}
    router.replace("/login?reset=done");
  }
  async function submit(event:FormEvent) {
    event.preventDefault();
    if(busy || (!ready&&!changed))return;
    if(!changed && password.length<8)return setMessage("La contraseña debe tener al menos 8 caracteres.");
    if(!changed && password!==confirm)return setMessage("Las contraseñas no coinciden.");
    setBusy(true);setMessage("");
    try {
      if(!changed){
        const result=await supabase.auth.updateUser({password});
        if(result.error){setMessage(result.error.message);return;}
        setChanged(true);setReady(false);setPassword("");setConfirm("");
      }
      await closeSessions();
    }catch{setMessage("No se pudo completar la operación. Intenta nuevamente.");}
    finally{setBusy(false);}
  }
  return <main className="auth-shell"><section className="auth-panel">
    <div className="eyebrow">LOOK SOCIAL MEDIA CRM</div><h1>Crear nueva contraseña</h1>
    <p className="muted">Valida el enlace de recuperación para actualizar tu contraseña y cerrar las sesiones anteriores.</p>
    <form onSubmit={submit} className="stack gap-16">
      {!changed&&<><label>Nueva contraseña<input type="password" minLength={8} value={password} onChange={event=>setPassword(event.target.value)} required autoComplete="new-password" disabled={!ready||busy}/></label>
      <label>Confirmar contraseña<input type="password" minLength={8} value={confirm} onChange={event=>setConfirm(event.target.value)} required autoComplete="new-password" disabled={!ready||busy}/></label></>}
      {message&&<div className="notice" role="status">{message}</div>}
      <button className="button primary" disabled={busy||(!ready&&!changed)}>{busy?"Guardando…":changed?"Cerrar sesiones y continuar":"Guardar contraseña"}</button>
    </form><Link className="text-button" href="/login">Volver al inicio de sesión</Link>
  </section></main>;
}

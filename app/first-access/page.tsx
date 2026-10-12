"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type ActivationPhase = "checking" | "ready" | "invalid" | "saving" | "finished";

/**
 * Owner-only, one-time initial password flow.
 * An unguessable, short-lived ticket is delivered out of band in the URL
 * fragment. It is NOT an authentication credential until exchanged server-side
 * for a Supabase recovery token. No service credentials reach this component.
 */
export default function FirstAccessPage() {
  const router=useRouter();
  const [phase,setPhase]=useState<ActivationPhase>("checking");
  const [message,setMessage]=useState("Validando tu activación de propietario…");
  const [password,setPassword]=useState("");
  const [confirm,setConfirm]=useState("");

  useEffect(()=>{
    let alive=true;
    async function activate(){
      const ticket=new URLSearchParams(window.location.hash.slice(1)).get("ticket");
      window.history.replaceState(null,"","/first-access");
      if(!ticket || !/^[A-Za-z0-9_-]{40,80}$/.test(ticket)){
        if(alive){setPhase("invalid");setMessage("Este enlace de activación no es válido. Solicita un nuevo acceso seguro.");}
        return;
      }
      try {
        const result=await fetch("https://ygipjqgyreeahslzorik.supabase.co/functions/v1/owner-initial-password",{
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({ticket}),
          cache:"no-store",
        });
        const payload=(await result.json()) as {token_hash?:string;owner_id?:string;error?:string};
        if(!result.ok || !payload.token_hash || !payload.owner_id) throw new Error(payload.error||"No se pudo emitir tu activación.");
        const proof=await supabase.auth.verifyOtp({token_hash:payload.token_hash,type:"recovery"});
        if(proof.error || !proof.data.user || proof.data.user.id!==payload.owner_id){
          throw new Error("No se pudo validar la identidad del propietario. El enlace ya no puede reutilizarse.");
        }
        const access=await supabase.rpc("platform_current_access");
        if(access.error || !(access.data as {is_platform_admin?:boolean}|null)?.is_platform_admin){
          await supabase.auth.signOut({scope:"local"});
          throw new Error("Esta cuenta no tiene permisos de administrador de plataforma.");
        }
        if(alive){setMessage("");setPhase("ready");}
      } catch(error){
        if(alive){setPhase("invalid");setMessage(error instanceof Error?error.message:"No se pudo completar la activación.");}
      }
    }
    void activate();
    return ()=>{alive=false};
  },[]);

  async function finish(event:FormEvent){
    event.preventDefault();
    if(phase!=="ready")return;
    if(password.length<12){setMessage("Elige una contraseña de al menos 12 caracteres.");return;}
    if(password!==confirm){setMessage("Las contraseñas no coinciden.");return;}
    setPhase("saving");setMessage("");
    try {
      const result=await supabase.auth.updateUser({password});
      if(result.error)throw new Error(result.error.message);
      setPassword("");setConfirm("");
      setPhase("finished");
      // We do not claim all sessions were closed if global revocation fails.
      const closed=await supabase.auth.signOut({scope:"others"});
      if(closed.error)setMessage("Contraseña creada. No se pudieron cerrar las otras sesiones; revísalo más adelante.");
      router.replace("/platform-admin");
    }catch(error){
      setMessage(error instanceof Error?error.message:"No se pudo guardar la contraseña.");
      setPhase("ready");
    }
  }

  return <main className="auth-shell"><section className="auth-panel">
    <div className="eyebrow">LOOK SOCIAL MEDIA CRM · Propietario</div>
    <h1>Crear mi contraseña</h1>
    <p className="muted">Activación privada de un solo uso. Tu contraseña se guarda directamente mediante Supabase Auth y nunca pasa por este chat.</p>
    {phase==="checking"&&<div className="notice" role="status">{message}</div>}
    {phase==="invalid"&&<><div className="notice" role="alert">{message}</div><Link className="text-button" href="/login">Ir a iniciar sesión</Link></>}
    {(phase==="ready"||phase==="saving")&&<form className="stack gap-16" onSubmit={finish}>
      <label>Nueva contraseña<input autoComplete="new-password" type="password" minLength={12} required value={password} disabled={phase==="saving"} onChange={e=>setPassword(e.target.value)}/></label>
      <label>Confirmar contraseña<input autoComplete="new-password" type="password" minLength={12} required value={confirm} disabled={phase==="saving"} onChange={e=>setConfirm(e.target.value)}/></label>
      {message&&<div className="notice" role="alert">{message}</div>}
      <button type="submit" className="button primary" disabled={phase==="saving"}>{phase==="saving"?"Guardando…":"Crear contraseña y entrar"}</button>
    </form>}
    {phase==="finished"&&<div className="notice" role="status">Contraseña creada. Abriendo tu panel de Super Admin…</div>}
  </section></main>;
}

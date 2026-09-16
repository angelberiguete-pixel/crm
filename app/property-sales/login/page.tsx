"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

const ADMIN_EMAIL="angeljavierberiguetelazala@gmail.com";

export default function PropertySalesLoginPage(){
  return <Suspense fallback={<main className="auth-shell"><section className="auth-panel"><div className="eyebrow">Proyecto 812 · Cevicos</div><h1>Cargando acceso…</h1><p className="muted">Preparando el portal privado.</p></section></main>}><LoginContent/></Suspense>;
}

function LoginContent(){
  const router=useRouter();
  const search=useSearchParams();
  const recoveryMode=search.get("recovery")==="1";
  const [mode,setMode]=useState<"login"|"recover"|"new-password">(recoveryMode?"new-password":"login");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");

  useEffect(()=>{
    if(recoveryMode) return;
    supabase.auth.getSession().then(({data})=>{if(data.session) router.replace("/property-sales");});
  },[router,recoveryMode]);

  async function login(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    const f=new FormData(e.currentTarget);
    const emailValue=String(f.get("email")||"").trim().toLowerCase();
    if(emailValue!==ADMIN_EMAIL){
      setMessage("Este portal está cerrado a terceros. Por el momento solo está habilitado el acceso del Administrador Total.");
      return;
    }
    setBusy(true); setMessage("");
    const result=await supabase.auth.signInWithPassword({email:emailValue,password:String(f.get("password")||"")});
    setBusy(false);
    if(result.error){
      const text=result.error.message.toLowerCase();
      if(text.includes("rate")||text.includes("429")||text.includes("too many")) return setMessage("Se alcanzó temporalmente el límite de intentos. Espera alrededor de un minuto y prueba una sola vez. También puedes usar recuperación de contraseña.");
      return setMessage("No pudimos iniciar sesión. Verifica la contraseña o usa recuperación de acceso.");
    }
    router.replace("/property-sales");
  }

  async function recover(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    const f=new FormData(e.currentTarget);
    const emailValue=String(f.get("email")||"").trim().toLowerCase();
    if(emailValue!==ADMIN_EMAIL){
      setMessage("La recuperación está habilitada únicamente para el Administrador Total.");
      return;
    }
    setBusy(true); setMessage("");
    const redirectTo=`${window.location.origin}/property-sales/login?recovery=1`;
    const {error}=await supabase.auth.resetPasswordForEmail(emailValue,{redirectTo});
    setBusy(false);
    if(error){
      const text=error.message.toLowerCase();
      if(text.includes("rate")||text.includes("429")) return setMessage("Se alcanzó temporalmente el límite de correos. Espera unos minutos y vuelve a solicitarlo una sola vez.");
      return setMessage(error.message);
    }
    setMessage("Te enviamos un enlace de recuperación al correo del Administrador Total.");
  }

  async function setNewPassword(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    const f=new FormData(e.currentTarget);
    const p=String(f.get("password")||"");
    const c=String(f.get("confirm")||"");
    if(p!==c) return setMessage("Las contraseñas no coinciden.");
    setBusy(true); setMessage("");
    const {error}=await supabase.auth.updateUser({password:p});
    setBusy(false);
    if(error) return setMessage(error.message);
    setMessage("Contraseña actualizada. Ya puedes entrar al panel administrativo.");
    setTimeout(()=>router.replace("/property-sales"),700);
  }

  return <main className="auth-shell"><section className="auth-panel">
    <div className="eyebrow">Proyecto 812 · Cevicos</div>
    <div style={{display:"inline-block",margin:"8px 0",padding:"6px 10px",borderRadius:999,background:"#173329",color:"#efd28a",fontWeight:900,fontSize:12}}>ADMINISTRADOR TOTAL</div>
    <h1>{mode==="recover"?"Recuperar acceso":mode==="new-password"?"Crear nueva contraseña":"Acceso privado"}</h1>
    <p className="muted">{mode==="recover"?"La recuperación está limitada al correo administrativo autorizado.":mode==="new-password"?"Define una nueva contraseña para tu cuenta administrativa.":"La comercialización está temporalmente centralizada. No se aceptan registros de brokers ni vendedores externos."}</p>

    {mode==="login"&&<form onSubmit={login} className="stack gap-16"><label>Correo<input name="email" type="email" required autoComplete="email" value={ADMIN_EMAIL} readOnly/></label><label>Contraseña<input name="password" type="password" minLength={8} required autoComplete="current-password"/></label>{message&&<div className="notice">{message}</div>}<button className="button primary" disabled={busy}>{busy?"Entrando…":"Entrar como Administrador Total"}</button><button type="button" className="text-button" onClick={()=>{setMode("recover");setMessage("");}}>No recuerdo mi contraseña</button></form>}

    {mode==="recover"&&<form onSubmit={recover} className="stack gap-16"><label>Correo<input name="email" type="email" required autoComplete="email" value={ADMIN_EMAIL} readOnly/></label>{message&&<div className="notice">{message}</div>}<button className="button primary" disabled={busy}>{busy?"Enviando…":"Enviar enlace de recuperación"}</button></form>}

    {mode==="new-password"&&<form onSubmit={setNewPassword} className="stack gap-16"><label>Nueva contraseña<input name="password" type="password" minLength={8} required autoComplete="new-password"/></label><label>Confirmar contraseña<input name="confirm" type="password" minLength={8} required autoComplete="new-password"/></label>{message&&<div className="notice">{message}</div>}<button className="button primary" disabled={busy}>{busy?"Guardando…":"Guardar nueva contraseña"}</button></form>}

    <div style={{display:"grid",gap:8,marginTop:16}}>
      {mode!=="login"&&mode!=="new-password"&&<button type="button" className="text-button" onClick={()=>{setMode("login");setMessage("");}}>Volver al acceso</button>}
      <Link href="/cevicos" className="text-button" style={{textAlign:"center",textDecoration:"none"}}>Volver a la propiedad</Link>
    </div>
    <p className="muted" style={{fontSize:12,lineHeight:1.5,marginTop:18}}>Esta web no recibe pagos, depósitos ni reservas. El CRM se utiliza para seguimiento de compradores, visitas, ofertas y cierre bajo control administrativo.</p>
  </section></main>;
}

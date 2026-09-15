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
  const adminMode=search.get("admin")==="1";
  const recoveryMode=search.get("recovery")==="1";
  const [mode,setMode]=useState<"login"|"seller"|"recover"|"new-password">(recoveryMode?"new-password":"login");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [email,setEmail]=useState(adminMode?ADMIN_EMAIL:"");

  useEffect(()=>{
    if(recoveryMode) return;
    supabase.auth.getSession().then(({data})=>{if(data.session) router.replace("/property-sales");});
  },[router,recoveryMode]);

  async function login(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    const f=new FormData(e.currentTarget);
    setBusy(true); setMessage("");
    const result=await supabase.auth.signInWithPassword({email:String(f.get("email")||"").trim(),password:String(f.get("password")||"")});
    setBusy(false);
    if(result.error){
      const text=result.error.message.toLowerCase();
      if(text.includes("rate")||text.includes("429")||text.includes("too many")) return setMessage("Se alcanzó temporalmente el límite de intentos. Espera alrededor de un minuto y prueba una sola vez. También puedes usar recuperación de contraseña.");
      return setMessage("No pudimos iniciar sesión. Verifica correo y contraseña o usa recuperación de acceso.");
    }
    router.replace("/property-sales");
  }

  async function registerSeller(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    const f=new FormData(e.currentTarget);
    setBusy(true); setMessage("");
    const emailValue=String(f.get("email")||"").trim().toLowerCase();
    const password=String(f.get("password")||"");
    const {data,error}=await supabase.functions.invoke("land-sales-register",{body:{
      email:emailValue,
      password,
      full_name:String(f.get("name")||"").trim(),
      company:String(f.get("company")||"").trim()||null,
      phone:String(f.get("phone")||"").trim()||null,
    }});
    if(error || data?.error){
      setBusy(false);
      const text=String(data?.message||error?.message||"");
      if(data?.error==="account_exists") return setMessage("Ya existe una cuenta con ese correo. Ve a Iniciar sesión o usa recuperación de contraseña.");
      return setMessage(text||"No fue posible crear la cuenta.");
    }
    const signIn=await supabase.auth.signInWithPassword({email:emailValue,password});
    setBusy(false);
    if(signIn.error){setMessage("La cuenta fue creada correctamente, pero no pudimos abrir la sesión automáticamente. Pulsa ‘Ya tengo cuenta’ e inicia sesión con el correo y contraseña que acabas de crear.");return;}
    router.replace("/property-sales");
  }

  async function recover(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    const f=new FormData(e.currentTarget);
    const emailValue=String(f.get("email")||"").trim();
    setBusy(true); setMessage("");
    const redirectTo=`${window.location.origin}/property-sales/login?recovery=1`;
    const {error}=await supabase.auth.resetPasswordForEmail(emailValue,{redirectTo});
    setBusy(false);
    if(error){
      const text=error.message.toLowerCase();
      if(text.includes("rate")||text.includes("429")) return setMessage("Se alcanzó temporalmente el límite de correos. Espera unos minutos y vuelve a solicitarlo una sola vez.");
      return setMessage(error.message);
    }
    setMessage("Te enviamos un enlace de recuperación. Abre ese correo y vuelve a esta página desde el botón del mensaje.");
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
    setMessage("Contraseña actualizada. Ya puedes entrar a tu panel.");
    setTimeout(()=>router.replace("/property-sales"),700);
  }

  return <main className="auth-shell"><section className="auth-panel">
    <div className="eyebrow">Proyecto 812 · Cevicos</div>
    {adminMode&&<div style={{display:"inline-block",margin:"8px 0",padding:"6px 10px",borderRadius:999,background:"#173329",color:"#efd28a",fontWeight:900,fontSize:12}}>ADMINISTRADOR TOTAL</div>}
    <h1>{mode==="seller"?"Registro de broker / vendedor":mode==="recover"?"Recuperar acceso":mode==="new-password"?"Crear nueva contraseña":"Acceso al Sales Command Center"}</h1>
    <p className="muted">{mode==="seller"?"La cuenta se crea confirmada para que puedas iniciar sesión sin depender de un correo de verificación. El administrador aprobará la actividad comercial y asignará tu comisión.":mode==="recover"?"Escribe el correo de tu cuenta y recibirás un enlace para restablecer la contraseña.":mode==="new-password"?"Define una nueva contraseña para tu cuenta.":"Administradores y brokers autorizados ingresan desde aquí."}</p>

    {mode==="login"&&<form onSubmit={login} className="stack gap-16"><label>Correo<input name="email" type="email" required autoComplete="email" value={email} readOnly={adminMode} onChange={e=>setEmail(e.target.value)}/></label><label>Contraseña<input name="password" type="password" minLength={8} required autoComplete="current-password"/></label>{message&&<div className="notice">{message}</div>}<button className="button primary" disabled={busy}>{busy?"Entrando…":"Entrar"}</button><button type="button" className="text-button" onClick={()=>{setMode("recover");setMessage("");}}>No recuerdo mi contraseña</button></form>}

    {mode==="seller"&&<form onSubmit={registerSeller} className="stack gap-16"><label>Nombre completo<input name="name" required/></label><label>Empresa / inmobiliaria<input name="company"/></label><label>WhatsApp<input name="phone"/></label><label>Correo<input name="email" type="email" required autoComplete="email"/></label><label>Contraseña<input name="password" type="password" minLength={8} required autoComplete="new-password"/></label><label style={{display:"flex",gap:8,alignItems:"flex-start"}}><input name="terms" type="checkbox" required style={{width:"auto",marginTop:4}}/><span>Acepto que la atribución y comisión dependen del registro válido del comprador, mi estado de aprobación y el acuerdo de corretaje aplicable.</span></label>{message&&<div className="notice">{message}</div>}<button className="button primary" disabled={busy}>{busy?"Creando…":"Crear cuenta de broker"}</button></form>}

    {mode==="recover"&&<form onSubmit={recover} className="stack gap-16"><label>Correo<input name="email" type="email" required autoComplete="email" defaultValue={email}/></label>{message&&<div className="notice">{message}</div>}<button className="button primary" disabled={busy}>{busy?"Enviando…":"Enviar enlace de recuperación"}</button></form>}

    {mode==="new-password"&&<form onSubmit={setNewPassword} className="stack gap-16"><label>Nueva contraseña<input name="password" type="password" minLength={8} required autoComplete="new-password"/></label><label>Confirmar contraseña<input name="confirm" type="password" minLength={8} required autoComplete="new-password"/></label>{message&&<div className="notice">{message}</div>}<button className="button primary" disabled={busy}>{busy?"Guardando…":"Guardar nueva contraseña"}</button></form>}

    <div style={{display:"grid",gap:8,marginTop:16}}>
      {mode!=="login"&&mode!=="new-password"&&<button type="button" className="text-button" onClick={()=>{setMode("login");setMessage("");}}>Ya tengo cuenta</button>}
      {mode==="login"&&!adminMode&&<button type="button" className="text-button" onClick={()=>{setMode("seller");setMessage("");}}>Quiero vender el terreno / solicitar acceso</button>}
      <Link href="/cevicos" className="text-button" style={{textAlign:"center",textDecoration:"none"}}>Volver a la propiedad</Link>
    </div>
    <p className="muted" style={{fontSize:12,lineHeight:1.5,marginTop:18}}>Si un broker no puede entrar después de recuperar su contraseña, el Administrador Total dispone de una herramienta interna para asignar una contraseña temporal y restablecer el acceso sin modificar su atribución ni comisión.</p>
  </section></main>;
}

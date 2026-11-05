"use client";
import Image from "next/image";
import Link from "next/link";
import {useEffect,useState,type FormEvent} from "react";
import {supabase} from "@/lib/supabase";
import styles from "../login/family-login.module.css";

type Result={ok?:boolean;error?:string;message?:string};
export default function FamilyPowerOwnerActivation(){
  const [ticket,setTicket]=useState("");
  const [loaded,setLoaded]=useState(false);
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [confirm,setConfirm]=useState("");
  const [busy,setBusy]=useState(false);
  const [done,setDone]=useState(false);
  const [error,setError]=useState("");
  useEffect(()=>{
    const code=new URLSearchParams(window.location.hash.slice(1)).get("ticket")??"";
    window.history.replaceState(null,"",window.location.pathname);
    setTicket(/^[a-f0-9]{64}$/.test(code)?code:"");
    setLoaded(true);
  },[]);
  async function activate(e:FormEvent){
    e.preventDefault();
    if(busy||!ticket)return;
    if(password.length<12||password.length>128){setError("Elige una contraseña de 12 a 128 caracteres.");return;}
    if(password!==confirm){setError("Las contraseñas no coinciden.");return;}
    setBusy(true);setError("");
    try{
      const result=await supabase.functions.invoke("family-power-owner-setup",{
        body:{action:"claim",ticket,email:email.trim().toLowerCase(),password}
      });
      const data=(result.data??{}) as Result;
      if(result.error||!data.ok){
        setError("No se pudo activar este acceso. Comprueba que el código sea reciente y solicita otro al responsable si es necesario.");
        return;
      }
      setDone(true);setTicket("");setPassword("");setConfirm("");
    }catch{setError("No se pudo completar la activación. Consulta al responsable.");}
    finally{setBusy(false);}
  }
  return <main className={styles.page}>
    <div className={styles.glow} aria-hidden="true"/>
    <div className={styles.layout}>
      <header className={styles.intro}>
        <div className={styles.logo}>
          <Image src="/client-brands/family-power/logo-negativo-sin-fondo.svg" width={620} height={240}
            alt="Family Power — Energía alternativa sin límites" unoptimized priority/>
        </div>
        <p className={styles.eyebrow}>Activación privada · Propietario</p>
        <h1>Tu empresa, tu acceso.</h1>
        <p>Establece personalmente la contraseña de tu cuenta propietaria. No tienes que compartirla con Look Social Media ni recibir un correo de verificación.</p>
        <div className={styles.features}>
          <span>Acceso exclusivo a Family Power</span>
          <span>Código temporal entregado en persona por el administrador autorizado</span>
        </div>
      </header>
      <section className={styles.panel} aria-label="Crear contraseña del propietario">
        <div className={styles.panelTop}>FAMILY POWER · PRIMER ACCESO</div>
        {done?<><h2>Tu acceso está listo</h2>
          <p>Ya puedes iniciar sesión con el correo autorizado y la contraseña que acabas de crear.</p>
          <Link className={styles.submit} href="/family-power/login">Entrar al CRM de Family Power</Link>
          <p className={styles.invite}>Conserva tu contraseña de forma privada. Si no tienes acceso al correo, la recuperación deberá hacerse presencialmente con el responsable autorizado.</p>
        </>:<>
          <h2>Crear mi contraseña</h2>
          <p>El administrador debe comprobar tu identidad y entregarte el enlace durante la reunión. El correo será tu identificador de entrada; este proceso no comprueba la propiedad de la bandeja de correo.</p>
          <form className={styles.form} onSubmit={activate}>
            {!ticket&&<div className={styles.notice} role="status">Antes de crear tu contraseña, el administrador de Look Social Media debe verificar tu identidad y darte un código privado de activación. No hay registro público.</div>}
            <label htmlFor="fp-owner-ticket">Código privado de activación</label>
            <input id="fp-owner-ticket" type="password" required minLength={64} maxLength={64}
              autoComplete="off" spellCheck={false} value={ticket}
              onChange={e=>setTicket(e.target.value.trim().toLowerCase())}
              placeholder="Código temporal entregado por el administrador"/>
            <label htmlFor="fp-owner-email">Correo de acceso autorizado</label>
            <input id="fp-owner-email" autoComplete="username" type="email" required maxLength={254}
              value={email} onChange={e=>setEmail(e.target.value)} placeholder="correo de acceso"/>
            <label htmlFor="fp-owner-password">Mi nueva contraseña (mínimo 12 caracteres)</label>
            <input id="fp-owner-password" type="password" required minLength={12} maxLength={128}
              autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/>
            <label htmlFor="fp-owner-confirm">Confirmar mi contraseña</label>
            <input id="fp-owner-confirm" type="password" required minLength={12} maxLength={128}
              autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)}/>
            {error&&<div className={styles.notice} role="alert">{error}</div>}
            <button className={styles.submit} type="submit" disabled={busy||!loaded||!ticket}>
              {busy?"Creando acceso seguro…":"Crear contraseña y activar mi cuenta"}
            </button>
          </form>
          <div className={styles.invite}>Si no utilizas correo electrónico, el acceso se puede preparar con un identificador bajo control de la empresa. No uses la dirección de una persona ajena: los mensajes de recuperación podrían llegarle.</div>
        </>}
      </section>
    </div>
    <footer className={styles.footer}>Family Power · Portal privado de propietario</footer>
  </main>;
}

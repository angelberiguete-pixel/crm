"use client";
import Image from "next/image";
import Link from "next/link";
import {useState,type FormEvent} from "react";
import {supabase} from "@/lib/supabase";
import styles from "../login/family-login.module.css";

export default function FamilyPowerRegistration(){
  const [fullName,setFullName]=useState("");
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [busy,setBusy]=useState(false);
  const [done,setDone]=useState(false);
  const [error,setError]=useState("");
  async function submit(e:FormEvent){
    e.preventDefault();
    if(busy)return;
    const name=fullName.trim().replace(/\s+/g," ");
    if(name.length<3||name.length>120||name.split(" ").length<2){
      setError("Escribe tu nombre y apellido completos.");return;
    }
    if(password.length<12||password.length>128){
      setError("Tu contraseña debe tener entre 12 y 128 caracteres.");return;
    }
    setError("");setBusy(true);
    try{
      const result=await supabase.auth.signUp({
        email:email.trim().toLowerCase(),
        password,
        options:{data:{full_name:name,registration_source:"family-power"}}
      });
      if(result.error){
        setError("No pudimos registrar la solicitud. Verifica los datos o utiliza otro correo.");return;
      }
      // Database trigger queues an access request; neither signup nor metadata confers a tenant role.
      setDone(true);setPassword("");
      if(result.data.session)window.location.assign("/family-power/login");
    }catch{setError("No se pudo completar el registro. Inténtalo nuevamente.");}
    finally{setBusy(false);}
  }
  return <main className={styles.page} data-client-register="family-power">
    <div className={styles.glow} aria-hidden="true"/>
    <div className={styles.layout}>
      <header className={styles.intro}>
        <div className={styles.logo}>
          <Image src="/client-brands/family-power/logo-negativo.svg" width={620} height={240}
            alt="Family Power — Energía alternativa sin límites" priority unoptimized/>
        </div>
        <p className={styles.eyebrow}>Family Power · Registro privado</p>
        <h1>Comienza con tu cuenta.</h1>
        <p>Crea tus propias credenciales de acceso. Tu solicitud será revisada desde la administración central antes de habilitar los permisos de propietario.</p>
        <div className={styles.features}>
          <span>Tu correo será tu usuario de acceso</span>
          <span>Solo el administrador central puede aprobar tu solicitud</span>
        </div>
      </header>
      <section className={styles.panel} aria-label="Registro de propietario Family Power">
        <div className={styles.panelTop}>FAMILY POWER · SOLICITAR ACCESO</div>
        {done?<div role="status">
          <h2>Solicitud recibida</h2>
          <p>Si se requiere confirmar tu correo, revisa tu bandeja de entrada. Tu acceso a Family Power permanecerá pendiente hasta que la administración central lo apruebe.</p>
          <Link className={styles.submit} href="/family-power/login">Ir a iniciar sesión</Link>
        </div>:<>
          <h2>Crea tu cuenta</h2>
          <p>Usarás este correo y esta contraseña para entrar cada vez que tu acceso esté autorizado.</p>
          <form className={styles.form} onSubmit={submit}>
            <label htmlFor="fp-register-name">Nombre completo</label>
            <input id="fp-register-name" type="text" required minLength={3} maxLength={120}
              autoComplete="name" value={fullName} onChange={e=>setFullName(e.target.value)}
              placeholder="Nombre y apellido"/>
            <label htmlFor="fp-register-email">Correo electrónico</label>
            <input id="fp-register-email" type="email" required maxLength={254}
              autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}
              placeholder="correo@empresa.com"/>
            <label htmlFor="fp-register-password">Crea tu contraseña</label>
            <input id="fp-register-password" type="password" required minLength={12} maxLength={128}
              autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}
              placeholder="Mínimo 12 caracteres"/>
            {error&&<div role="alert" className={styles.notice}>{error}</div>}
            <button type="submit" className={styles.submit} disabled={busy}>
              {busy?"Registrando solicitud…":"Solicitar registro"}
            </button>
          </form>
          <div className={styles.invite}>
            El registro no habilita automáticamente el CRM. Si ya tienes cuenta,
            <Link className={styles.ownerRegistrationLink} href="/family-power/login">Inicia sesión aquí</Link>.
          </div>
        </>}
      </section>
    </div>
    <footer className={styles.footer}>Family Power · Energía alternativa sin límites</footer>
  </main>;
}

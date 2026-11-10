"use client";
import Image from "next/image";
import Link from "next/link";
import {useState,type FormEvent} from "react";
import {supabase} from "@/lib/supabase";
import {authEmailActionMessage} from "@/lib/auth-entry-feedback";
import styles from "../login/family-login.module.css";

const RESERVED_OWNER_EMAIL="familypower1@hotmail.com";
const FAMILY_TENANT_SLUG="family-power";

export default function FamilyPowerRegistration(){
  const [fullName,setFullName]=useState("");
  const [email,setEmail]=useState(RESERVED_OWNER_EMAIL);
  const [password,setPassword]=useState("");
  const [busy,setBusy]=useState(false);
  const [done,setDone]=useState(false);
  const [error,setError]=useState("");
  const [resending,setResending]=useState(false);
  const [mailNotice,setMailNotice]=useState("");
  async function resendConfirmation(){
    if(resending)return;
    setResending(true);setMailNotice("");
    try{
      const {error:sendError}=await supabase.auth.resend({
        type:"signup",
        email:RESERVED_OWNER_EMAIL,
        options:{emailRedirectTo:new URL("/family-power/login",window.location.origin).toString()}
      });
      if(sendError)setMailNotice(authEmailActionMessage(sendError.code));
      else setMailNotice("Solicitamos otro correo de confirmación. Comprueba Recibidos y Correo no deseado.");
    }catch{setMailNotice("No pudimos solicitar el correo. Inténtalo más tarde.");}
    finally{setResending(false);}
  }
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
    if(email.trim().toLowerCase()!==RESERVED_OWNER_EMAIL){
      setError("El registro de propietario está reservado al correo aprobado por Empresia.");return;
    }
    setError("");setBusy(true);
    try{
      const result=await supabase.auth.signUp({
        email:RESERVED_OWNER_EMAIL,
        password,
        options:{
          emailRedirectTo:new URL("/family-power/login",window.location.origin).toString(),
          data:{full_name:name,registration_source:"family-power"}
        }
      });
      if(result.error){
        setError(result.error.code==="user_already_exists"
          ?"Esta cuenta ya existe. Entra al portal o recupera su contraseña."
          :"No pudimos completar el registro. Si ya creaste la cuenta, utiliza el inicio de sesión.");return;
      }
      setPassword("");
      // Owner role is granted server-side only after the reserved mailbox is verified.
      if(result.data.session){
        const identity=await supabase.auth.getUser();
        if(!identity.error &&
           identity.data.user?.email?.trim().toLowerCase()===RESERVED_OWNER_EMAIL &&
           identity.data.user.email_confirmed_at){
          const membership=await supabase.rpc("list_my_tenants");
          const family=Array.isArray(membership.data)
            ? membership.data.find(t=>t.tenant_slug===FAMILY_TENANT_SLUG &&
              t.membership_role==="owner")
            : null;
          if(!membership.error && family){
            const selected=await supabase.rpc("set_active_tenant",{p_tenant_id:family.tenant_id});
            if(!selected.error){window.location.assign("/crm");return;}
          }
        }
      }
      setDone(true);
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
        <p>Crea tus propias credenciales de acceso. El correo propietario ya está autorizado. Verifica tu dirección si el sistema lo solicita y podrás entrar al CRM sin aprobación manual.</p>
        <div className={styles.features}>
          <span>Tu correo será tu usuario de acceso</span>
          <span>Permisos de propietario activados al confirmar la identidad</span>
        </div>
      </header>
      <section className={styles.panel} aria-label="Registro de propietario Family Power">
        <div className={styles.panelTop}>FAMILY POWER · ALTA DE PROPIETARIO</div>
        {done?<div role="status">
          <h2>Cuenta creada</h2>
          <p>La cuenta de {RESERVED_OWNER_EMAIL} necesita confirmar su correo antes de acceder al CRM. Abre el enlace enviado por Supabase. No se necesita una segunda aprobación manual.</p>
          <button type="button" className={styles.recovery} disabled={resending}
            onClick={()=>void resendConfirmation()}>
            {resending?"Solicitando correo…":"Reenviar correo de confirmación"}
          </button>
          {mailNotice&&<div role="status" className={styles.notice}>{mailNotice}</div>}
          <Link className={styles.submit} href="/family-power/login">Entrar después de confirmar</Link>
        </div>:<>
          <h2>Crea tu cuenta</h2>
          <p>Usa el único correo autorizado para crear el acceso propietario de Family Power.</p>
          <form className={styles.form} onSubmit={submit}>
            <label htmlFor="fp-register-name">Nombre completo</label>
            <input id="fp-register-name" type="text" required minLength={3} maxLength={120}
              autoComplete="name" value={fullName} onChange={e=>setFullName(e.target.value)}
              placeholder="Nombre y apellido"/>
            <label htmlFor="fp-register-email">Correo electrónico</label>
            <input id="fp-register-email" type="email" required maxLength={254}
              autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}
              readOnly aria-describedby="fp-email-note" placeholder={RESERVED_OWNER_EMAIL}/>
            <small id="fp-email-note">Correo de propietario reservado previamente por Empresia.</small>
            <label htmlFor="fp-register-password">Crea tu contraseña</label>
            <input id="fp-register-password" type="password" required minLength={12} maxLength={128}
              autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}
              placeholder="Mínimo 12 caracteres"/>
            {error&&<div role="alert" className={styles.notice}>{error}</div>}
            <button type="submit" className={styles.submit} disabled={busy}>
              {busy?"Creando cuenta…":"Crear cuenta de propietario"}
            </button>
          </form>
          <div className={styles.invite}>
            El acceso solo se habilita cuando se confirma la identidad del correo reservado. Si ya tienes cuenta,
            <Link className={styles.ownerRegistrationLink} href="/family-power/login">inicia sesión aquí</Link>.
          </div>
        </>}
      </section>
    </div>
    <footer className={styles.footer}>Family Power · Energía alternativa sin límites</footer>
  </main>;
}

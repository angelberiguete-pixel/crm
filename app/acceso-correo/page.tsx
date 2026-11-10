"use client";

import Link from "next/link";
import Image from "next/image";
import {useEffect,useState,type FormEvent} from "react";
import {useRouter} from "next/navigation";
import {supabase,getAuthLinkError} from "@/lib/supabase";
import {authEmailActionMessage} from "@/lib/auth-entry-feedback";

/** Mailbox ownership is verified by Supabase Auth. This page never assigns roles. */
export default function EmailAccessPage(){
 const router=useRouter();
 const [email,setEmail]=useState("");
 const [busy,setBusy]=useState(false);
 const [checking,setChecking]=useState(true);
 const [notice,setNotice]=useState("");

 useEffect(()=>{
  let active=true;
  async function verifyExistingSession(){
   const authError=getAuthLinkError();
   if(authError){if(active)setNotice(authError);setChecking(false);return;}
   try{
    const {data,error}=await supabase.auth.getSession();
    if(error||!data.session){if(active)setChecking(false);return;}
    const user=await supabase.auth.getUser();
    if(!active)return;
    if(user.error||!user.data.user){setChecking(false);return;}
    const access=await supabase.rpc("platform_current_access");
    if(!active)return;
    if(access.error){setNotice("Tu sesión está activa, pero no pudimos comprobar el permiso de administrador. Intenta de nuevo.");setChecking(false);return;}
    const isAdmin=(access.data as {is_platform_admin?:boolean}|null)?.is_platform_admin;
    router.replace(isAdmin?"/platform-admin":"/crm");
   }catch{if(active){setChecking(false);setNotice("No pudimos verificar tu sesión. Revisa tu conexión.");}}
  }
  void verifyExistingSession();
  return ()=>{active=false;};
 },[router]);

 async function submit(event:FormEvent){
  event.preventDefault();
  if(busy)return;
  const normalized=email.trim().toLowerCase();
  if(!normalized){setNotice("Introduce tu correo registrado.");return;}
  setBusy(true);setNotice("");
  try{
   const {error}=await supabase.auth.signInWithOtp({
    email:normalized,
    options:{
     shouldCreateUser:false,
     emailRedirectTo:new URL("/login",window.location.origin).toString()
    }
   });
   if(error)setNotice(authEmailActionMessage(error.code));
   else setNotice("Si la cuenta existe, enviamos un enlace seguro. Revisa Recibidos y Spam y abre el enlace más reciente desde este teléfono. No necesitas volver a introducir tu contraseña.");
  }catch{setNotice("No pudimos solicitar el enlace. Revisa tu conexión e inténtalo nuevamente.");}
  finally{setBusy(false);}
 }
 return <main className="auth-shell">
   <section className="auth-panel">
    <Image src="/empresia-logo.svg" alt="Empresia" width={220} height={55} priority unoptimized/>
    <p className="eyebrow">Acceso seguro · Empresia</p>
    <h1>Entrar con mi correo</h1>
    <p className="muted">No necesitas la contraseña anterior. Te enviaremos un enlace seguro a tu correo de Empresia para comprobar que la cuenta es tuya.</p>
    <form onSubmit={submit} className="stack gap-16">
     <label htmlFor="email-login-address">Correo de la cuenta
      <input id="email-login-address" name="email" type="email" required autoComplete="email" value={email}
        onChange={e=>setEmail(e.target.value)} placeholder="tu-correo@empresa.com"/>
     </label>
     <button className="button primary" type="submit" disabled={busy||checking}>
      {busy?"Solicitando enlace…":checking?"Comprobando sesión…":"Enviar enlace de acceso"}
     </button>
    </form>
    {notice&&<p role="status" className="notice">{notice}</p>}
    <p className="muted">Esta opción solo permite entrar a cuentas existentes y mantiene los permisos actuales.</p>
    <Link className="text-button" href="/login">Volver al inicio de sesión</Link>
   </section>
  </main>;
}

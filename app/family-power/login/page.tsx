"use client";

import Image from "next/image";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {useCallback,useEffect,useState,type FormEvent} from "react";
import {LockKeyhole,LogIn,ShieldCheck,UsersRound} from "lucide-react";
import {supabase} from "@/lib/supabase";
import {notifyTenantContextChanged} from "@/lib/tenant-context-events";
import {familyPowerMembership,FAMILY_POWER_SLUG} from "@/lib/family-power-access";
import styles from "./family-login.module.css";

type TenantAccess={
 tenant_id:string;tenant_slug:string;tenant_name:string;membership_role:string;is_active:boolean;
};

/** Family Power is a branded doorway, not a separate identity store.
 * The backend's list_my_tenants + set_active_tenant + CRM permission gate
 * are the authority. A logo or URL never grants any tenant access.
 */
export default function FamilyPowerLogin(){
 const router=useRouter();
 const [email,setEmail]=useState("");
 const [password,setPassword]=useState("");
 const [busy,setBusy]=useState(false);
 const [checking,setChecking]=useState(true);
 const [resetting,setResetting]=useState(false);
 const [message,setMessage]=useState("");
 const [otherSession,setOtherSession]=useState(false);

 const authorize=useCallback(async(newSignIn:boolean)=>{
   // Never rely on the email domain, query strings, or client-side role labels.
   const list=await supabase.rpc("list_my_tenants");
   if(list.error){setMessage("No pudimos verificar tu autorización. Vuelve a intentar.");return;}
   const access=familyPowerMembership(list.data as TenantAccess[]|null);
   if(!access){
     if(newSignIn)await supabase.auth.signOut({scope:"local"});
     setMessage("Esta cuenta no tiene acceso autorizado a Family Power. Solicita una invitación a su administrador.");
     setOtherSession(!newSignIn);
     return;
   }
   const selected=await supabase.rpc("set_active_tenant",{p_tenant_id:access.tenant_id});
   if(selected.error){
     setMessage("No pudimos activar tu empresa. Comunícate con el administrador.");
     return;
   }
   notifyTenantContextChanged();
   router.replace("/crm");
 },[router]);

 useEffect(()=>{
   let mounted=true;
   // Read URL only for a harmless fixed success notice, never for a redirect.
   if(new URLSearchParams(window.location.search).get("reset")==="done")
     setMessage("Contraseña actualizada. Entra con tus nuevas credenciales.");
   void supabase.auth.getSession().then(async({data})=>{
     if(!mounted)return;
     if(data.session)await authorize(false);
   }).catch(()=>{if(mounted)setMessage("No pudimos comprobar la sesión actual.");})
     .finally(()=>{if(mounted)setChecking(false);});
   return()=>{mounted=false;};
 },[authorize]);

 async function signIn(e:FormEvent){
   e.preventDefault();
   if(busy||checking)return;
   setBusy(true);setMessage("");setOtherSession(false);
   try{
     const identity=email.trim().toLowerCase();
     const username=/^[a-z][a-z0-9._-]{2,31}$/.test(identity);
     if(!identity.includes("@")&&!username){setMessage("Introduce un usuario autorizado o un correo válido.");return;}
     const loginEmail=username?`family-power.${identity}@login.looksocialmedia.invalid`:identity;
     const result=await supabase.auth.signInWithPassword({email:loginEmail,password});
     if(result.error||!result.data.session){
       setMessage("No pudimos iniciar sesión. Revisa tu usuario y contraseña.");return;
     }
     await authorize(true);
   }catch{setMessage("No se pudo completar el acceso seguro. Inténtalo nuevamente.");}
   finally{setBusy(false);}
 }
 async function recover(){
   const target=email.trim();
   if(!target||!target.includes("@"))return setMessage("Las cuentas con usuario sin correo recuperan el acceso a través del administrador de Look Social Media.");
   if(resetting)return;
   setResetting(true);setMessage("");
   try{
     const result=await supabase.auth.resetPasswordForEmail(target,{
       // The existing recovery flow stays shared and secure; no extra allowlisted URL.
       redirectTo:"https://crm-revenue-os.vercel.app/reset-password",
     });
     if(result.error)setMessage("No pudimos procesar la solicitud. Intenta nuevamente.");
     else setMessage("Si la cuenta existe, recibirás instrucciones de recuperación en el correo registrado.");
   }catch{setMessage("No se pudo procesar la recuperación.");}
   finally{setResetting(false);}
 }
 return <main className={styles.page} data-client-login={FAMILY_POWER_SLUG}>
   <div className={styles.glow} aria-hidden="true"/>
   <div className={styles.layout}>
     <header className={styles.intro}>
       <div className={styles.logo}>
         <Image src="/client-brands/family-power/logo-negativo.svg"
           width={620} height={240} alt="Family Power — Energía alternativa sin límites"
           priority unoptimized/>
       </div>
       <p className={styles.eyebrow}>Portal privado de gestión</p>
       <h1>Tu empresa, en control.</h1>
       <p>Gestiona clientes, cotizaciones, instalaciones y ventas desde un solo lugar.</p>
       <div className={styles.features}>
         <span><ShieldCheck size={17}/> Acceso por invitación</span>
         <span><UsersRound size={17}/> Dueño, administradores y vendedores</span>
       </div>
     </header>
     <section className={styles.panel} aria-label="Acceso privado de Family Power">
       <div className={styles.panelTop}><LockKeyhole size={19}/><span>Family Power · Acceso seguro</span></div>
       <h2>Bienvenido a tu espacio</h2>
       <p>Inicia sesión con el usuario aprobado por el administrador o con tu correo registrado.</p>
       {otherSession&&<div className={styles.sessionNote}>
         Si estabas trabajando en otra empresa, puedes regresar a tu <Link href="/crm">CRM habitual</Link>.
       </div>}
       <form onSubmit={signIn} className={styles.form}>
         <label htmlFor="family-email">Nombre de usuario o correo</label>
         <input id="family-email" name="email" type="text" required
           autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)}
           placeholder="usuario autorizado"/>
         <label htmlFor="family-password">Contraseña</label>
         <input id="family-password" name="password" type="password" required minLength={8}
           autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}
           placeholder="Introduce tu contraseña"/>
         {message&&<div role="status" className={styles.notice}>{message}</div>}
         <button className={styles.submit} type="submit" disabled={busy||checking}>
           {busy||checking?"Verificando acceso…":<><LogIn size={18}/> Entrar a Family Power</>}
         </button>
       </form>
       <button type="button" className={styles.recovery} disabled={resetting}
         onClick={()=>void recover()}>{resetting?"Enviando instrucciones…":"¿Olvidaste tu contraseña?"}</button>
       <div className={styles.invite}>Los accesos se crean exclusivamente desde la administración. No hay registro público.</div>
     </section>
   </div>
   <footer className={styles.footer}>Family Power · Portal privado · Tecnología de Look Digital Staff</footer>
 </main>;
}

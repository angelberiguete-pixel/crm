"use client";

import {useEffect,useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import Image from "next/image";
import {supabase} from "@/lib/supabase";

/**
 * Punto de entrada público de Empresia.
 * /crm es una vista de la empresa activa: nunca sirve como puerta global
 * para el propietario, pues podría mostrar Family Power u otro cliente.
 * Las autorizaciones vienen exclusivamente de Supabase, no de la URL.
 */
export default function AccesoCrmPage(){
  const router=useRouter();
  const [error,setError]=useState("");
  useEffect(()=>{
    let alive=true;
    // Abrir desde Empresia no debe heredar la intención de inicio de sesión Family Power.
    try{window.sessionStorage.removeItem("crm:login-intent");}catch{}
    void (async()=>{
      try{
        const session=await supabase.auth.getSession();
        if(!alive)return;
        if(session.error){setError("No se pudo comprobar tu sesión de manera segura.");return;}
        if(!session.data.session){router.replace("/login");return;}
        const access=await supabase.rpc("platform_current_access");
        if(!alive)return;
        if(access.error){
          setError("La sesión está iniciada, pero no pudimos verificar tu nivel de acceso. Vuelve a intentarlo.");
          return;
        }
        const isPlatformAdmin=(access.data as {is_platform_admin?:boolean}|null)?.is_platform_admin===true;
        router.replace(isPlatformAdmin?"/platform-admin":"/crm");
      }catch{
        if(alive)setError("No se pudo verificar el acceso. Comprueba tu conexión e intenta nuevamente.");
      }
    })();
    return()=>{alive=false;};
  },[router]);

  return <main className="auth-shell">
    <section className="auth-panel">
      <span className="look-brand-logo look-brand-logo--login"><Image src="/empresia-logo.svg" alt="Empresia" width={220} height={55} priority unoptimized/></span>
      <div className="eyebrow">Empresia · Acceso seguro</div>
      <h1>Entrar al CRM</h1>
      {error?<><p role="alert" className="notice">{error}</p>
        <Link className="button primary" href="/login">Iniciar sesión</Link>
        <Link className="button" href="/empresia">Volver al sitio</Link>
      </>:<p role="status" className="muted">Comprobando tu acceso a la plataforma…</p>}
    </section>
  </main>;
}

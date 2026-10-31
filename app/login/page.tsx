"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import BrandLogo from "@/components/brand-logo";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [clientSlug,setClientSlug]=useState<string|null>(null);
  const [ready,setReady]=useState(false);

  async function routeAuthenticatedUser(slug?:string|null) {
    if(slug){
      // No superadmin menu or tenant switch in this login session.
      const all=await supabase.rpc("list_my_tenants");
      if(all.error){setMessage("No se pudo verificar a qué empresa pertenece tu cuenta.");return;}
      const choice=((all.data??[]) as Array<{tenant_id:string;tenant_slug:string}>)
        .find(t=>t.tenant_slug===slug);
      if(!choice){
        await supabase.auth.signOut();
        setMessage("Esta cuenta no tiene acceso autorizado a la empresa seleccionada.");
        return;
      }
      const selected=await supabase.rpc("set_active_tenant",{p_tenant_id:choice.tenant_id});
      if(selected.error){setMessage("No se pudo activar este negocio. "+selected.error.message);return;}
      const lock=await supabase.rpc("crm_lock_client_portal",{p_tenant_id:choice.tenant_id});
      if(lock.error){setMessage("No se pudo aislar esta sesión. "+lock.error.message);return;}
      router.replace("/crm");return;
    }
    const access = await supabase.rpc("platform_current_access");
    if(access.error){setMessage("La sesión es válida, pero no pudimos comprobar tu acceso. Intenta entrar nuevamente.");return;}
    const value = (access.data ?? {}) as { is_platform_admin?: boolean };
    router.replace(value.is_platform_admin ? "/platform-admin" : "/crm");
  }

  useEffect(() => {
    const params=new URLSearchParams(window.location.search);
    const raw=params.get("empresa")??"";
    const company=/^[a-z0-9-]{2,64}$/.test(raw)?raw:null;
    setClientSlug(company);
    if(params.get("reset")==="done")setMessage("Contraseña actualizada y sesiones anteriores cerradas. Inicia sesión con tu nueva contraseña.");
    void supabase.auth.getSession().then(async ({data})=>{
      if(company){
        // Opening the client sign-in is an explicit session boundary:
        // prevent an existing global JWT from silently opening a client.
        if(data.session)await supabase.auth.signOut();
        setReady(true);
        return;
      }
      setReady(true);
      if(data.session)await routeAuthenticatedUser();
    }).catch(()=>setReady(true));
    // routeAuthenticatedUser intentionally depends only on router/supabase singleton.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function requestPasswordReset() {
    const target = email.trim();
    if (!target) return setMessage("Escribe tu correo para enviarte el enlace de recuperación.");
    setResetBusy(true);
    setMessage("");
    const redirectTo = "https://crm-revenue-os.vercel.app/reset-password";
    const { error } = await supabase.auth.resetPasswordForEmail(target, { redirectTo });
    setResetBusy(false);
    if (error) return setMessage(error.message);
    setMessage("Te enviamos un enlace para establecer una nueva contraseña. Revisa tu correo.");
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    const result = mode === "login"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (result.error) return setMessage(result.error.message);
    if (result.data.session) await routeAuthenticatedUser(clientSlug);
    else setMessage("Cuenta creada. Revisa tu correo si la confirmación está habilitada.");
  }

  if(!ready)return <main className="auth-shell"><section className="auth-panel">Preparando inicio de sesión seguro…</section></main>;
  const isFamilyPower=clientSlug==="family-power";
  return <main className="auth-shell">
    <section className="auth-panel">
      {isFamilyPower?<div style={{display:"flex",justifyContent:"center",padding:15,background:"#101828",borderRadius:16}}>
        <Image src="/client-brands/family-power/logo-negativo-sin-fondo.svg"
          alt="Family Power" width={210} height={122} unoptimized priority/>
      </div>:clientSlug?<div className="tenant-loading-initials" aria-label={"Inicio de sesión de "+clientSlug}>
        {clientSlug.split("-").slice(0,2).map(x=>x.charAt(0).toUpperCase()).join("")}
      </div>:<BrandLogo size="login"/>}
      <div className="eyebrow">{clientSlug?"Acceso exclusivo de empresa":"Acceso seguro al CRM"}</div>
      <h1>{isFamilyPower?"Iniciar sesión · Family Power":clientSlug?"Iniciar sesión de la empresa":"Iniciar sesión"}</h1>
      <p className="muted">{clientSlug
        ?"Cada persona accede con sus propias credenciales. Al entrar verás únicamente esta empresa y los módulos correspondientes a tu rol; para cambiar de empresa tendrás que salir."
        :"Cada empresa y cada vendedor accede a su propio espacio de trabajo. El administrador de plataforma gestiona a sus clientes por separado."}</p>
      <form onSubmit={submit} className="stack gap-16">
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></label>
        <label>Contraseña<input type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete={mode === "login" ? "current-password" : "new-password"} /></label>
        {message && <div className="notice">{message}</div>}
        <button className="button primary" disabled={busy}>{busy ? "Procesando…" : mode === "login" ? "Entrar" : "Crear cuenta"}</button>
      </form>
      {mode === "login" && <button type="button" className="text-button" disabled={resetBusy} onClick={requestPasswordReset}>{resetBusy ? "Enviando…" : "Olvidé mi contraseña"}</button>}
      {!clientSlug&&<button type="button" className="text-button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMessage(""); }}>
        {mode === "login" ? "¿Primera vez? Crear cuenta" : "Ya tengo cuenta"}
      </button>}
    </section>
  </main>;
}

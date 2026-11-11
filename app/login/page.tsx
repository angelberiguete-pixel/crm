"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Image from "next/image";
import Link from "next/link";
import {authEmailActionMessage,authSignInMessage} from "@/lib/auth-entry-feedback";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [emailLinkBusy, setEmailLinkBusy] = useState(false);

  async function routeAuthenticatedUser() {
    const next = new URLSearchParams(window.location.search).get("next");
    if (next && /^\/empresia\/(checkout|mis-compras)(\?|$)/.test(next)) {
      router.replace(next);
      return;
    }
    const access = await supabase.rpc("platform_current_access");
    if(access.error){setMessage("La sesión es válida, pero no pudimos comprobar tu acceso. Intenta entrar nuevamente.");return;}
    const value = (access.data ?? {}) as { is_platform_admin?: boolean };
    router.replace(value.is_platform_admin ? "/platform-admin" : "/crm");
  }

  useEffect(() => {
    if(new URLSearchParams(window.location.search).get("reset")==="done") setMessage("Contraseña actualizada y sesiones anteriores cerradas. Inicia sesión con tu nueva contraseña.");
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) await routeAuthenticatedUser();
    });
    // routeAuthenticatedUser intentionally depends only on router/supabase singleton.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function requestEmailLogin() {
    const target=email.trim().toLowerCase();
    if (!target) return setMessage("Introduce primero tu correo para recibir un enlace de acceso seguro.");
    if (emailLinkBusy) return;
    setEmailLinkBusy(true);
    setMessage("");
    try {
      const { error }=await supabase.auth.signInWithOtp({
        email: target,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: new URL("/login", window.location.origin).toString()
        }
      });
      if(error) setMessage(authEmailActionMessage(error.code));
      else setMessage("Si este correo tiene una cuenta activa, recibirás un enlace de acceso. Revisa Recibidos y Spam, y ábrelo desde el mismo navegador.");
    }catch{
      setMessage("No se pudo solicitar el enlace. Inténtalo nuevamente.");
    }finally{
      setEmailLinkBusy(false);
    }
  }
  async function requestPasswordReset() {
    const target = email.trim();
    if (!target) return setMessage("Escribe tu correo para enviarte el enlace de recuperación.");
    setResetBusy(true);
    setMessage("");
    const redirectTo = new URL("/reset-password",window.location.origin).toString();
    const { error } = await supabase.auth.resetPasswordForEmail(target, { redirectTo });
    setResetBusy(false);
    if (error) return setMessage(authEmailActionMessage(error.code));
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
    if (result.error) return setMessage(mode === "login" ? authSignInMessage(result.error.code) : authEmailActionMessage(result.error.code));
    if (result.data.session) await routeAuthenticatedUser();
    else setMessage("Cuenta creada. Revisa tu correo si la confirmación está habilitada.");
  }

  return <main className="auth-shell">
    <section className="auth-panel">
      <span className="look-brand-logo look-brand-logo--login"><Image src="/empresia-logo.svg" alt="Empresia" width={220} height={55} priority unoptimized/></span>
      <div className="eyebrow">Acceso seguro al CRM</div>
      <h1>Iniciar sesión</h1>
      <p className="muted">Cada empresa y cada vendedor accede a su propio espacio de trabajo. El administrador de plataforma gestiona a sus clientes por separado.</p>
      <p className="muted">Entra con tu correo y contraseña. El enlace por email es opcional, solo si lo necesitas para recuperar el acceso.</p>
      <form onSubmit={submit} className="stack gap-16">
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></label>
        <label>Contraseña<input type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete={mode === "login" ? "current-password" : "new-password"} /></label>
        {message && <div className="notice">{message}</div>}
        <button className="button primary" disabled={busy}>{busy ? "Procesando…" : mode === "login" ? "Entrar" : "Crear cuenta"}</button>
      </form>
      {mode === "login" && <>
        <button type="button" className="button" disabled={emailLinkBusy||resetBusy} onClick={requestEmailLogin}>
          {emailLinkBusy ? "Enviando enlace…" : "Entrar sin contraseña por correo"}
        </button>
        <p className="muted">Si no recuerdas tu contraseña, te enviaremos un enlace de acceso a tu correo verificado. No crea otra cuenta ni cambia tus permisos.</p>
        <button type="button" className="text-button" disabled={resetBusy||emailLinkBusy} onClick={requestPasswordReset}>
          {resetBusy ? "Enviando…" : "Olvidé mi contraseña"}
        </button>
      </>}
      <Link href="/family-power/login" className="text-button">¿Acceso de Family Power? Entrar a su portal</Link>
      <button type="button" className="text-button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMessage(""); }}>
        {mode === "login" ? "¿Primera vez? Crear cuenta" : "Ya tengo cuenta"}
      </button>
    </section>
  </main>;
}

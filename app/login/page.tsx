"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import BrandLogo from "@/components/brand-logo";
import { describeAuthIssue } from "@/lib/auth-error";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [resetBusy, setResetBusy] = useState(false);

  async function routeAuthenticatedUser() {
    const access = await supabase.rpc("platform_current_access");
    if(access.error){setMessage("La sesión se abrió, pero no pudimos comprobar los permisos de tu cuenta. "+describeAuthIssue(access.error));return;}
    const value = (access.data ?? {}) as { is_platform_admin?: boolean };
    router.replace(value.is_platform_admin ? "/platform-admin" : "/crm");
  }

  useEffect(() => {
    if(new URLSearchParams(window.location.search).get("reset")==="done") setMessage("Contraseña actualizada y sesiones anteriores cerradas. Inicia sesión con tu nueva contraseña.");
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (error) return setMessage(describeAuthIssue(error));
      if (data.session) await routeAuthenticatedUser();
    }).catch(error => setMessage(describeAuthIssue(error)));
    // routeAuthenticatedUser intentionally depends only on router/supabase singleton.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function requestPasswordReset() {
    const target = email.trim();
    if (!target) return setMessage("Escribe tu correo para enviarte el enlace de recuperación.");
    setResetBusy(true);
    setMessage("");
    const redirectTo = "https://crm-revenue-os.vercel.app/reset-password";
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(target, { redirectTo });
      if (error) return setMessage(describeAuthIssue(error));
      setMessage("Si existe una cuenta con ese correo, recibirás instrucciones para restablecer el acceso.");
    } catch(error) {
      setMessage(describeAuthIssue(error));
    } finally {
      setResetBusy(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const result = mode === "login"
        ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
        : await supabase.auth.signUp({ email: email.trim(), password });
      if (result.error) return setMessage(describeAuthIssue(result.error));
      if (result.data.session) await routeAuthenticatedUser();
      else setMessage("Revisa tu correo para continuar si está habilitada la confirmación.");
    } catch(error) {
      setMessage(describeAuthIssue(error));
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth-shell">
    <section className="auth-panel">
      <BrandLogo size="login"/>
      <div className="eyebrow">Acceso seguro al CRM</div>
      <h1>Iniciar sesión</h1>
      <p className="muted">Cada empresa y cada vendedor accede a su propio espacio de trabajo. El administrador de plataforma gestiona a sus clientes por separado.</p>
      <form onSubmit={submit} className="stack gap-16">
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></label>
        <label>Contraseña<input type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete={mode === "login" ? "current-password" : "new-password"} /></label>
        {message && <div className="notice" role="status" aria-live="polite">{message}</div>}
        <button className="button primary" disabled={busy || resetBusy}>{busy ? "Procesando…" : mode === "login" ? "Entrar" : "Crear cuenta"}</button>
      </form>
      {mode === "login" && <button type="button" className="text-button" disabled={resetBusy} onClick={requestPasswordReset}>{resetBusy ? "Enviando…" : "Olvidé mi contraseña"}</button>}
      <button type="button" className="text-button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMessage(""); }}>
        {mode === "login" ? "¿Primera vez? Crear cuenta" : "Ya tengo cuenta"}
      </button>
    </section>
  </main>;
}

"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import BrandLogo from "@/components/brand-logo";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasOpenSession, setHasOpenSession] = useState(false);
  const [message, setMessage] = useState("");
  const [resetBusy, setResetBusy] = useState(false);

  async function routeAuthenticatedUser() {
    // The database, never a URL/email/localStorage value, determines platform ownership.
    const access = await supabase.rpc("platform_current_access");
    if (access.error) {
      setMessage("La sesión es válida, pero no pudimos comprobar tus permisos. Intenta nuevamente.");
      return;
    }
    const value = (access.data ?? {}) as { is_platform_admin?: boolean };
    try { window.sessionStorage.removeItem("crm:login-intent"); } catch { /* Storage is optional. */ }
    router.replace(value.is_platform_admin ? "/mis-empresas" : "/crm");
  }

  useEffect(() => {
    let active = true;
    if (new URLSearchParams(window.location.search).get("reset") === "done") {
      setMessage("Contraseña actualizada. Inicia sesión con tu nueva contraseña.");
    }
    const checkSession = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!active) return;
      if (error) {
        setMessage("No pudimos comprobar la sesión actual. Puedes volver a iniciar sesión.");
      } else if (data.session) {
        const access = await supabase.rpc("platform_current_access");
        if (!active) return;
        if (access.error) {
          setHasOpenSession(true);
          setMessage("No pudimos comprobar tus permisos. Cierra la sesión actual e inicia nuevamente.");
        } else if ((access.data as { is_platform_admin?: boolean } | null)?.is_platform_admin) {
          // Platform owners enter their portfolio, not whichever client was last active.
          router.replace("/mis-empresas");
          return;
        } else {
          // A platform owner working inside a client has a server-side, session-bound
          // client lock. Never bypass it or silently redirect back into that client.
          setHasOpenSession(true);
          setMessage("Ya hay una sesión de empresa abierta. Para volver a la administración general, cierra esa sesión y entra con tu cuenta de propietario.");
        }
      }
      setCheckingSession(false);
    };
    void checkSession().catch(() => {
      if (active) {
        setMessage("No pudimos comprobar la sesión. Intenta iniciar sesión nuevamente.");
        setCheckingSession(false);
      }
    });
    return () => { active = false; };
  }, [router]);

  async function closeCurrentSession() {
    if (busy) return;
    setBusy(true);
    const { error } = await supabase.auth.signOut({ scope: "local" });
    setBusy(false);
    if (error) {
      setMessage("No pudimos cerrar la sesión de empresa. Intenta nuevamente.");
      return;
    }
    try { window.sessionStorage.removeItem("crm:login-intent"); } catch { /* Storage is optional. */ }
    setHasOpenSession(false);
    setMessage("Sesión anterior cerrada. Ahora inicia sesión para acceder a la administración que corresponda a tu cuenta.");
  }

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
    if (busy || checkingSession) return;
    setBusy(true);
    setMessage("");
    const result = mode === "login"
      ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
      : await supabase.auth.signUp({ email: email.trim(), password });
    setBusy(false);
    if (result.error) return setMessage(result.error.message);
    setHasOpenSession(false);
    if (result.data.session) await routeAuthenticatedUser();
    else setMessage("Cuenta creada. Revisa tu correo si la confirmación está habilitada.");
  }

  return <main className="auth-shell">
    <section className="auth-panel">
      <BrandLogo size="login"/>
      <div className="eyebrow">Acceso seguro al CRM multiempresa</div>
      <h1>Iniciar sesión</h1>
      <p className="muted">El propietario administra todas las empresas desde Mis empresas. Cada cliente y sus vendedores acceden únicamente a su propio espacio y permisos.</p>
      {message && <div className="notice" role="status">{message}</div>}
      {hasOpenSession && <div className="stack gap-12">
        <button type="button" className="button" disabled={busy || checkingSession} onClick={() => router.replace("/crm")}>Continuar en la empresa actual</button>
        <button type="button" className="button primary" disabled={busy || checkingSession} onClick={() => void closeCurrentSession()}>{busy ? "Cerrando sesión…" : "Cerrar sesión de empresa para entrar como propietario"}</button>
      </div>}
      <form onSubmit={submit} className="stack gap-16">
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></label>
        <label>Contraseña<input type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete={mode === "login" ? "current-password" : "new-password"} /></label>
        <button className="button primary" disabled={busy || checkingSession}>{busy || checkingSession ? "Comprobando sesión…" : mode === "login" ? "Entrar" : "Crear cuenta"}</button>
      </form>
      {mode === "login" && <button type="button" className="text-button" disabled={resetBusy} onClick={() => void requestPasswordReset()}>{resetBusy ? "Enviando…" : "Olvidé mi contraseña"}</button>}
      <button type="button" className="text-button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMessage(""); }}>
        {mode === "login" ? "¿Primera vez? Crear cuenta" : "Ya tengo cuenta"}
      </button>
    </section>
  </main>;
}

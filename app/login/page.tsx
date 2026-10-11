"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

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
    const value = (access.data ?? {}) as { is_platform_admin?: boolean };
    router.replace(value.is_platform_admin ? "/platform-admin" : "/crm");
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) await routeAuthenticatedUser();
    });
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
    if (result.data.session) await routeAuthenticatedUser();
    else setMessage("Cuenta creada. Revisa tu correo si la confirmación está habilitada.");
  }

  return <main className="auth-shell">
    <section className="auth-panel">
      <div className="eyebrow">Look Social Media · CRM</div>
      <h1>Iniciar sesión</h1>
      <p className="muted">Una sola plataforma para Super Admin, dueños de negocio, administradores, gerentes, vendedores y usuarios autorizados.</p>
      <form onSubmit={submit} className="stack gap-16">
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></label>
        <label>Contraseña<input type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete={mode === "login" ? "current-password" : "new-password"} /></label>
        {message && <div className="notice">{message}</div>}
        <button className="button primary" disabled={busy}>{busy ? "Procesando…" : mode === "login" ? "Entrar" : "Crear cuenta"}</button>
      </form>
      {mode === "login" && <button type="button" className="text-button" disabled={resetBusy} onClick={requestPasswordReset}>{resetBusy ? "Enviando…" : "Olvidé mi contraseña"}</button>}
      <button type="button" className="text-button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMessage(""); }}>
        {mode === "login" ? "¿Primera vez? Crear cuenta" : "Ya tengo cuenta"}
      </button>
    </section>
  </main>;
}

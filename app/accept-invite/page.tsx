"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, KeyRound } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function AcceptInvitePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Validando tu invitación…");

  useEffect(() => {
    let alive = true;
    (async () => {
      let session = (await supabase.auth.getSession()).data.session;
      if (!session && typeof window !== "undefined") {
        const code = new URLSearchParams(window.location.search).get("code");
        if (code) {
          const exchanged = await supabase.auth.exchangeCodeForSession(code);
          session = exchanged.data.session;
        }
      }
      if (!alive) return;
      setAuthenticated(Boolean(session));
      setReady(true);
      setMessage(session ? "Invitación validada. Activa tu acceso al workspace." : "No encontramos una sesión válida. Abre de nuevo el enlace más reciente que recibiste por email.");
    })();

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      if (session) {
        setAuthenticated(true);
        setReady(true);
        setMessage("Invitación validada. Activa tu acceso al workspace.");
      }
    });
    return () => { alive = false; data.subscription.unsubscribe(); };
  }, []);

  async function accept(e: FormEvent) {
    e.preventDefault();
    if (!authenticated) return;
    setBusy(true);
    setMessage("");

    if (password) {
      if (password.length < 8) {
        setBusy(false);
        setMessage("La contraseña debe tener al menos 8 caracteres.");
        return;
      }
      if (password !== confirm) {
        setBusy(false);
        setMessage("Las contraseñas no coinciden.");
        return;
      }
      const changed = await supabase.auth.updateUser({ password });
      if (changed.error) {
        setBusy(false);
        setMessage(changed.error.message);
        return;
      }
    }

    const accepted = await supabase.rpc("accept_my_tenant_invites");
    setBusy(false);
    if (accepted.error) {
      setMessage(accepted.error.message);
      return;
    }
    const result = (accepted.data ?? {}) as { tenant_id?: string | null; activated?: number };
    if (!result.tenant_id) {
      setMessage("Tu cuenta está activa, pero no encontramos una invitación pendiente para un workspace.");
      return;
    }
    router.replace("/crm");
  }

  return <main className="auth-shell">
    <section className="auth-panel">
      <div className="eyebrow">Look Social Media CRM</div>
      <h1>Aceptar invitación</h1>
      <p className="muted">Tu acceso estará limitado al negocio y a los módulos autorizados por tu rol.</p>

      {!ready ? <div className="notice">Validando enlace…</div> : authenticated ? <form className="stack gap-16" onSubmit={accept}>
        <div className="notice"><CheckCircle2 size={15} /> Enlace válido. Puedes continuar con tu cuenta actual o establecer una contraseña para futuros inicios de sesión.</div>
        <label>Nueva contraseña <span className="muted">(opcional si ya tienes una)</span><input type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /></label>
        {password && <label>Confirmar contraseña<input type="password" minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required /></label>}
        {message && <div className="notice">{message}</div>}
        <button className="button primary" disabled={busy}><KeyRound size={15} /> {busy ? "Activando…" : "Activar acceso al CRM"}</button>
      </form> : <>
        <div className="notice">{message}</div>
        <button className="button primary" onClick={() => router.replace("/login")}>Ir al inicio de sesión</button>
      </>}
    </section>
  </main>;
}

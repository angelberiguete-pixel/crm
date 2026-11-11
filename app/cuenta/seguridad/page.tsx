"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";

export default function AccountSecurityPage() {
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data, error }) => {
      if (!active) return;
      setAuthenticated(!error && Boolean(data.user));
      setEmail(error ? "" : (data.user?.email ?? ""));
    }).catch(() => {
      if (active) setMessage("No fue posible comprobar tu sesión. Inténtalo nuevamente.");
    }).finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, []);

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !authenticated) return;
    setMessage("");
    setSuccess(false);
    if (password.length < 12) {
      setMessage("La contraseña debe tener al menos 12 caracteres.");
      return;
    }
    if (password !== confirmation) {
      setMessage("Las contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    try {
      // Updates only the currently authenticated Supabase Auth user.
      // No tenant roles, permissions, or membership records are modified.
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setMessage(error.code === "reauthentication_needed"
          ? "Por seguridad, Supabase requiere confirmar otra vez tu identidad antes de cambiar la contraseña. Utiliza la recuperación de contraseña de la página de acceso."
          : "No se pudo guardar la contraseña. Revisa los requisitos e inténtalo nuevamente.");
        return;
      }
      setPassword("");
      setConfirmation("");
      setSuccess(true);
      setMessage("Contraseña guardada. La próxima vez podrás entrar con tu correo y contraseña desde /login, sin solicitar un enlace por correo.");
    } catch {
      setMessage("Ocurrió un problema al guardar la contraseña. Inténtalo nuevamente.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth-shell"><section className="auth-panel">
    <div className="eyebrow">EMPRESIA · MI CUENTA</div>
    <h1>Acceso con contraseña</h1>
    <p className="muted">Configura o cambia la contraseña de tu cuenta. Esto permite entrar sin pedir un enlace por correo cada vez.</p>
    {checking ? <p role="status">Comprobando sesión…</p> : !authenticated
      ? <div className="stack gap-16">
          <p className="notice" role="status">{message || "Inicia sesión para configurar tu contraseña. Si hoy solo accedes con un enlace por correo, úsalo una última vez."}</p>
          <Link className="button primary" href="/login">Ir a iniciar sesión</Link>
        </div>
      : <form className="stack gap-16" onSubmit={savePassword}>
          <p className="muted">Cuenta: <strong>{email}</strong></p>
          <label>Nueva contraseña
            <input type="password" autoComplete="new-password" minLength={12} required value={password} onChange={event => setPassword(event.target.value)} disabled={busy}/>
          </label>
          <label>Confirmar nueva contraseña
            <input type="password" autoComplete="new-password" minLength={12} required value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={busy}/>
          </label>
          {message && <p className={success ? "notice" : "notice"} role="status">{message}</p>}
          <button className="button primary" type="submit" disabled={busy}>{busy ? "Guardando…" : "Guardar contraseña"}</button>
        </form>}
    <p className="muted">La sesión se conserva en este navegador mientras siga siendo válida. Si cierras sesión, borras los datos del navegador o utilizas uno diferente, tendrás que volver a identificarte.</p>
    <Link className="text-button" href="/crm">Volver al CRM</Link>
  </section></main>;
}

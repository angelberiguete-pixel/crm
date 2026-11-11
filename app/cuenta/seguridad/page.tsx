"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";

export default function AccountSecurityPage() {
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [email, setEmail] = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

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

  async function requestRecovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (recoveryBusy) return;
    const address = recoveryEmail.trim().toLowerCase();
    if (!address) return setMessage("Introduce tu correo registrado.");
    setRecoveryBusy(true);
    setMessage("");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(address, {
        redirectTo: new URL("/reset-password", window.location.origin).toString()
      });
      if (error) {
        setMessage("No fue posible solicitar la recuperación. Comprueba el correo e inténtalo nuevamente.");
        return;
      }
      setMessage("Si el correo está registrado, recibirás un enlace de recuperación. Ábrelo una sola vez para establecer tu contraseña permanente; después entra directamente con correo y contraseña.");
    } catch {
      setMessage("No pudimos enviar la recuperación. Revisa tu conexión e inténtalo nuevamente.");
    } finally {
      setRecoveryBusy(false);
    }
  }

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !authenticated) return;
    setMessage("");
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
          <p className="muted">No tienes una sesión activa en este navegador. Si el inicio de sesión rechaza tu contraseña, recupérala una sola vez aquí.</p>
          <form className="stack gap-16" onSubmit={requestRecovery}>
            <label>Correo de tu cuenta
              <input type="email" autoComplete="email" required value={recoveryEmail} onChange={event => setRecoveryEmail(event.target.value)} disabled={recoveryBusy}/>
            </label>
            <button className="button primary" type="submit" disabled={recoveryBusy}>{recoveryBusy ? "Enviando…" : "Recuperar contraseña una sola vez"}</button>
          </form>
          {message && <p className="notice" role="status">{message}</p>}
          <Link className="button" href="/login">Ya tengo mi contraseña · Iniciar sesión</Link>
        </div>
      : <form className="stack gap-16" onSubmit={savePassword}>
          <p className="muted">Cuenta: <strong>{email}</strong></p>
          <label>Nueva contraseña
            <input type="password" autoComplete="new-password" minLength={12} required value={password} onChange={event => setPassword(event.target.value)} disabled={busy}/>
          </label>
          <label>Confirmar nueva contraseña
            <input type="password" autoComplete="new-password" minLength={12} required value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={busy}/>
          </label>
          {message && <p className="notice" role="status">{message}</p>}
          <button className="button primary" type="submit" disabled={busy}>{busy ? "Guardando…" : "Guardar contraseña"}</button>
        </form>}
    <p className="muted">La sesión se conserva en este navegador mientras siga siendo válida. Si cierras sesión, borras los datos del navegador o utilizas uno diferente, tendrás que volver a identificarte.</p>
    <Link className="text-button" href="/crm">Volver al CRM</Link>
  </section></main>;
}

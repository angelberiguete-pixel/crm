/**
 * Keep Supabase/Auth failures understandable without echoing raw backend messages,
 * request internals, credentials, or tenant data into the login screen.
 */
export function describeAuthIssue(error: unknown): string {
  const value = (error && typeof error === "object") ? error as { message?: unknown; code?: unknown; name?: unknown; status?: unknown } : {};
  const message = typeof value.message === "string" ? value.message : (typeof error === "string" ? error : "");
  const code = typeof value.code === "string" ? value.code : "";
  const name = typeof value.name === "string" ? value.name : "";
  const status = typeof value.status === "number" ? value.status : null;

  if (/failed to fetch|fetch failed|network request failed|networkerror|load failed|connection refused|econnrefused|timed? out|request timeout/i.test(message) ||
      /^(AuthRetryableFetchError|AuthUnknownError)$/.test(name) && /fetch|network/i.test(message) ||
      /^(request_timeout|network_error)$/.test(code) || status === 0) {
    return "No se pudo conectar al servicio de acceso del CRM. Tus credenciales no han sido verificadas. Comprueba la conexión e inténtalo más tarde; si persiste, el administrador debe revisar Supabase.";
  }

  if (code === "invalid_credentials" || /invalid login credentials/i.test(message)) {
    return "El correo o la contraseña no son correctos. Revisa los datos o utiliza la recuperación de contraseña.";
  }

  if (code === "email_not_confirmed" || /email not confirmed/i.test(message)) {
    return "La cuenta todavía no tiene confirmado su correo. Revisa el mensaje de confirmación.";
  }

  if (status === 429 || code === "over_request_rate_limit") {
    return "Se han realizado demasiados intentos. Inténtalo después de un momento.";
  }

  return "No fue posible completar la operación de acceso. Inténtalo de nuevo o solicita una revisión técnica.";
}

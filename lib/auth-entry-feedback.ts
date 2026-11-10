/** Safe, actionable sign-in messages. No server internals or password disclosure. */
export function authSignInMessage(code:string|undefined|null):string{
  switch(code){
    case "email_not_confirmed":
      return "Tu cuenta ya está registrada, pero falta confirmar el correo electrónico. Abre el mensaje de verificación antes de iniciar sesión.";
    case "invalid_credentials":
      return "El correo o la contraseña no coinciden. Comprueba los datos o utiliza «¿Olvidaste tu contraseña?» para recuperar el acceso.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
    case "request_timeout":
    case "too_many_requests":
      return "Se alcanzó el límite temporal de intentos. Espera unos minutos antes de volver a intentarlo.";
    default:
      return "No pudimos iniciar sesión. Revisa tu conexión y vuelve a intentarlo.";
  }
}

export function authEmailActionMessage(code:string|undefined|null):string{
  switch(code){
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
    case "too_many_requests":
      return "Por seguridad, el servicio limita el envío de correos. Revisa el último mensaje recibido o inténtalo más tarde.";
    default:
      return "No pudimos enviar el mensaje. Verifica el correo o inténtalo nuevamente.";
  }
}

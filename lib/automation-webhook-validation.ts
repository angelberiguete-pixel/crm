/**
 * Client-side guidance for webhook configuration in the visual editor.
 * This is not an SSRF security boundary. The server-side executor MUST separately
 * enforce DNS/IP restrictions, allowed integrations, tenant permissions and egress.
 */
export function validateWebhookDraftUrl(value: string): string | null {
  const raw=value.trim();
  if (!raw) return "Introduce una dirección HTTPS para este webhook.";
  if (raw.length>2048) return "La dirección del webhook es demasiado larga.";
  let parsed: URL;
  try { parsed=new URL(raw); }
  catch { return "La dirección del webhook no tiene un formato válido."; }
  if (parsed.protocol!=="https:") return "Utiliza HTTPS. No se admiten direcciones HTTP ni otros protocolos.";
  if (parsed.username || parsed.password) return "No incluyas usuarios ni contraseñas dentro de la dirección.";
  if (parsed.port && parsed.port!=="443") return "El webhook debe utilizar el puerto HTTPS estándar.";
  if (parsed.hash) return "Elimina el fragmento (#) de la dirección del webhook.";
  const host=parsed.hostname.toLowerCase().replace(/\.$/,"");
  if (!host.includes(".") || host==="localhost" || host.endsWith(".localhost")
    || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".test")
    || host.endsWith(".invalid") || host.endsWith(".example")
    || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.startsWith("[")
  ) return "Usa un dominio público HTTPS, no una dirección local o una IP.";
  for(const key of parsed.searchParams.keys()){
    if (/^(?:password|pass|token|api_?key|secret|access_?key|authorization)$/i.test(key))
      return "No coloques tokens o claves secretas en la URL del webhook.";
  }
  return null;
}

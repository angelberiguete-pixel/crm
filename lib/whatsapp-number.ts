/**
 * Digits-only destination for wa.me. WhatsApp links must include country code,
 * but Dominican phone numbers are commonly saved as local 809/829/849.
 * This function creates a link target only; it NEVER sends a message.
 */
export function normalizeWhatsAppNumber(input:string|null|undefined):string|null {
  if(!input)return null;
  const raw=input.trim();
  if(!raw)return null;
  const digits=raw.replace(/\D/g,"");
  const international=digits.startsWith("00")?digits.slice(2):digits;
  if(/^(809|829|849)\d{7}$/.test(international))return "1"+international;
  // Validate basic E.164 shape (without +) for already international numbers.
  if(!/^[1-9]\d{7,14}$/.test(international))return null;
  return international;
}

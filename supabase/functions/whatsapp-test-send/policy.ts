// A narrow first real-send path: manual test only to a recipient whitelisted in
// the server environment. Broad customer conversations require verified inbound
// webhooks, opt-in records, templates and separate approval before activation.
export function validateTestWhatsAppDraft(
  body: unknown, requestId: unknown, phoneNumberId: unknown,
  testRecipient: unknown, tenantId: unknown,
): string | null {
  if (typeof tenantId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) return "tenant_invalid";
  if (typeof requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) return "request_id_invalid";
  if (typeof body !== "string" || !body.trim() || body.trim().length > 1000) return "message_invalid";
  if (typeof phoneNumberId !== "string" || !/^\d{6,25}$/.test(phoneNumberId)) return "phone_number_id_not_configured";
  if (typeof testRecipient !== "string" || !/^[1-9]\d{7,14}$/.test(testRecipient)) return "test_recipient_not_configured";
  return null;
}

export function hasVerifiedWhatsAppChannel(
  channel: unknown, expectedPhoneId: string,
): boolean {
  if (!channel || typeof channel !== "object") return false;
  const c = channel as {status?:unknown;provider?:unknown;external_account_id?:unknown;settings?:unknown};
  if (c.status !== "connected" || c.provider !== "whatsapp" || c.external_account_id !== expectedPhoneId) return false;
  if (!c.settings || typeof c.settings !== "object") return false;
  const s = c.settings as {connection_verified?:unknown};
  return s.connection_verified === true;
}

export function metaWhatsAppPayload(to: string, body: string) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { preview_url: false, body: body.trim() },
  };
}

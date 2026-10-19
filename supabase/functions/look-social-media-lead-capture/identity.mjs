/**
 * Lead identity for the public contact form.
 * Existing email dedupe keys are deliberately retained for backward compatibility.
 * Phone-only contacts must not all share the same "landing:" key.
 */
export function leadIdentity(email, whatsapp) {
  const normalizedEmail = String(email ?? "").trim().toLowerCase();
  if (normalizedEmail) {
    return {
      dedupeKey: `landing:${normalizedEmail}`,
      lookup: { column: "email", value: normalizedEmail },
    };
  }

  const normalizedPhone = String(whatsapp ?? "").replace(/[^0-9+]/g, "");
  if (!normalizedPhone) throw new Error("lead_identity_missing");
  return {
    dedupeKey: `landing:phone:${normalizedPhone}`,
    lookup: { column: "whatsapp_phone", value: normalizedPhone },
  };
}

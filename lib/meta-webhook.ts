/**
 * Parsing and signature verification for Meta webhooks.
 * Pure helpers only: no HTTP endpoint, provider credentials, tenant lookup, persistence,
 * or automated delivery is enabled by importing this file.
 *
 * IMPORTANT: the receiving server MUST verify the X-Hub-Signature-256 over the exact
 * raw body bytes before it parses or persists any event. The account identifier in
 * a provider payload is not proof of tenant ownership.
 */
export type MetaInboundEvent = {
  provider: "whatsapp" | "instagram" | "messenger" | "facebook_lead_ads";
  kind: "message" | "message_echo" | "delivery_status" | "leadgen";
  accountId: string;
  externalId: string;
  idempotencyKey: string;
  participantId: string | null;
  timestamp: number | null;
  text: string | null;
  details: Record<string, string>;
};

const MAX_BYTES = 1024 * 1024;
const asRecord = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
const asArray = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const asString = (v: unknown): string =>
  typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "";
const asTimestamp = (v: unknown): number | null => {
  const n = Number(v);
  return v !== null && v !== undefined && v !== "" && Number.isFinite(n) && n > 0 ? n : null;
};
const field = (v: Record<string, unknown> | null, name: string): string => asString(v?.[name]);

function makeEvent(
  provider: MetaInboundEvent["provider"], kind: MetaInboundEvent["kind"],
  accountId: string, externalId: string, participantId: string | null,
  timestamp: number | null, text: string | null, details: Record<string, string> = {},
): MetaInboundEvent | null {
  if (!accountId || !externalId) return null;
  return {
    provider, kind, accountId, externalId,
    idempotencyKey: [provider, kind, accountId, externalId].join(":"),
    participantId, timestamp, text, details,
  };
}

/** Missing/malformed signatures and empty secrets MUST fail closed. */
export async function verifyMetaWebhookSignature(
  body: string | Uint8Array, signature: string | null, appSecret: string,
): Promise<boolean> {
  if (!appSecret || !signature || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  const bytes = typeof body === "string" ? new TextEncoder().encode(body) : body;
  if (!bytes.length || bytes.length > MAX_BYTES) return false;
  const digest = new Uint8Array(32);
  for (let i = 0; i < digest.length; i++) digest[i] = parseInt(signature.slice(7 + i * 2, 9 + i * 2), 16);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  return crypto.subtle.verify("HMAC", key, digest, bytes);
}

/**
 * Normalize event identities without inferring a tenant or creating leads.
 * A verified callback still needs a server-owned mapping of WABA/Page/IG account
 * to the authorized tenant, UNIQUE idempotency, opt-in checks and a worker queue.
 */
export function parseMetaWebhookEvents(body: string | Uint8Array): MetaInboundEvent[] {
  const bytes = typeof body === "string" ? new TextEncoder().encode(body) : body;
  if (!bytes.length || bytes.length > MAX_BYTES) throw new Error("meta_webhook_body_size_invalid");
  let payload: unknown;
  try { payload = JSON.parse(typeof body === "string" ? body : new TextDecoder("utf-8", { fatal: true }).decode(body)); }
  catch { throw new Error("meta_webhook_json_invalid"); }
  const root = asRecord(payload);
  const object = field(root, "object");
  if (!["whatsapp_business_account", "instagram", "page"].includes(object)) return [];
  const result: MetaInboundEvent[] = [];
  for (const rawEntry of asArray(root?.entry).slice(0, 100)) {
    const entry = asRecord(rawEntry);
    if (!entry) continue;
    const entryId = field(entry, "id");
    if (object === "whatsapp_business_account") {
      for (const rawChange of asArray(entry.changes).slice(0, 100)) {
        const change = asRecord(rawChange);
        if (field(change, "field") !== "messages") continue;
        const value = asRecord(change?.value);
        const meta = asRecord(value?.metadata);
        const accountId = field(meta, "phone_number_id");
        for (const rawMessage of asArray(value?.messages).slice(0, 100)) {
          const msg = asRecord(rawMessage);
          if (!msg) continue;
          const echoed = msg.is_echo === true;
          const ev = makeEvent("whatsapp", echoed ? "message_echo" : "message",
            accountId, field(msg, "id"), field(msg, "from") || null,
            asTimestamp(msg.timestamp), field(asRecord(msg.text), "body") || null,
            { messageType: field(msg, "type") });
          if (ev) result.push(ev);
        }
        for (const rawEcho of asArray(value?.smb_message_echoes).slice(0, 100)) {
          const msg = asRecord(rawEcho);
          const ev = makeEvent("whatsapp", "message_echo",
            accountId, field(msg, "id"), field(msg, "to") || null,
            asTimestamp(msg?.timestamp), field(asRecord(msg?.text), "body") || null,
            { messageType: field(msg, "type") });
          if (ev) result.push(ev);
        }
        for (const rawStatus of asArray(value?.statuses).slice(0, 100)) {
          const status = asRecord(rawStatus);
          const ev = makeEvent("whatsapp", "delivery_status",
            accountId, field(status, "id") + ":" + field(status, "status"),
            field(status, "recipient_id") || null,
            asTimestamp(status?.timestamp), null,
            { status: field(status, "status") });
          if (ev && field(status, "id") && field(status, "status")) result.push(ev);
        }
      }
      continue;
    }
    const provider = object === "instagram" ? "instagram" : "messenger";
    for (const rawMessage of asArray(entry.messaging).slice(0, 100)) {
      const messaging = asRecord(rawMessage);
      const msg = asRecord(messaging?.message);
      if (!msg) continue;
      const kind = msg.is_echo === true ? "message_echo" : "message";
      const ev = makeEvent(provider, kind, entryId,
        field(msg, "mid"), field(asRecord(messaging?.sender), "id") || null,
        asTimestamp(messaging?.timestamp), field(msg, "text") || null);
      if (ev) result.push(ev);
    }
    if (object !== "page") continue;
    for (const rawChange of asArray(entry.changes).slice(0, 100)) {
      const change = asRecord(rawChange);
      if (field(change, "field") !== "leadgen") continue;
      const lead = asRecord(change?.value);
      const ev = makeEvent("facebook_lead_ads", "leadgen", entryId,
        field(lead, "leadgen_id"), null, asTimestamp(lead?.created_time), null,
        { formId: field(lead, "form_id"), adId: field(lead, "ad_id") });
      if (ev) result.push(ev);
    }
  }
  // Meta may retry callbacks. The DB must still enforce unique idempotency.
  return [...new Map(result.map(event => [event.idempotencyKey, event])).values()];
}

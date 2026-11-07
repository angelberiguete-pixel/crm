/** Shared receive-only contract for the CRM and the pinned OpenReply exporter. */
export type OpenReplyEvent = {
  version: 1;
  eventId: string;
  type: "instagram.comment_received" | "instagram.reply_accepted" | "instagram.message_received";
  workspaceId: string;
  instagramAccountId: string;
  campaignId: string | null;
  occurredAt: string;
  data: { externalId: string; personId: string; text: string; displayName?: string };
};
export type OpenReplyWebhookKey = { keyId: string; secret: string; workspaceId: string; instagramAccountId: string };
export type IngestResult = "stored" | "duplicate" | "unverified_route" | "event_conflict" | "invalid_event";
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max;
const id = (v: unknown): v is string => text(v, 100) && /^[A-Za-z0-9_-]+$/.test(v);
const external = (v: unknown): v is string => text(v, 256) && !/[\u0000-\u001f]/.test(v);
const numeric = (v: unknown): v is string => typeof v === "string" && /^\d{5,30}$/.test(v);
const encoder = new TextEncoder();

export function parseOpenReplyEvent(v: unknown): OpenReplyEvent | null {
  if (!record(v) || Object.keys(v).some(k => !["version", "eventId", "type", "workspaceId", "instagramAccountId", "campaignId", "occurredAt", "data"].includes(k))
    || v.version !== 1 || !id(v.eventId) || !id(v.workspaceId) || !numeric(v.instagramAccountId)
    || !["instagram.comment_received", "instagram.reply_accepted", "instagram.message_received"].includes(String(v.type))
    || (v.campaignId !== null && !id(v.campaignId)) || !text(v.occurredAt, 40)
    || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(v.occurredAt) || !Number.isFinite(Date.parse(v.occurredAt))
    || !record(v.data) || Object.keys(v.data).some(k => !["externalId", "personId", "text", "displayName"].includes(k))
    || !external(v.data.externalId) || !numeric(v.data.personId)
    || typeof v.data.text !== "string" || v.data.text.length > 1600 || /\u0000/.test(v.data.text)
    || (v.data.displayName !== undefined && (!text(v.data.displayName, 120) || /[\u0000-\u001f]/.test(v.data.displayName)))
    || (v.type !== "instagram.reply_accepted" && !v.data.text.trim())) return null;
  return v as unknown as OpenReplyEvent;
}

export function parseOpenReplyWebhookKeys(raw: string | undefined): OpenReplyWebhookKey[] {
  if (!raw?.trim()) return [];
  if (raw.length > 65536) throw new Error("invalid_keyring");
  const rows: unknown = JSON.parse(raw);
  if (!Array.isArray(rows) || rows.length > 100) throw new Error("invalid_keyring");
  const keys = new Set<string>(), secrets = new Set<string>(), accounts = new Map<string, string>();
  return rows.map(row => {
    if (!record(row) || !id(row.keyId) || !id(row.workspaceId) || !numeric(row.instagramAccountId)
      || !text(row.secret, 128) || !/^[A-Za-z0-9_-]{43,128}$/.test(row.secret)
      || keys.has(row.keyId) || secrets.has(row.secret)
      || (accounts.has(row.instagramAccountId) && accounts.get(row.instagramAccountId) !== row.workspaceId)) throw new Error("invalid_keyring");
    keys.add(row.keyId); secrets.add(row.secret); accounts.set(row.instagramAccountId, row.workspaceId);
    return { keyId: row.keyId, workspaceId: row.workspaceId, instagramAccountId: row.instagramAccountId, secret: row.secret };
  });
}

function hex(bytes: ArrayBuffer) { return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join(""); }
export async function openReplyPayloadHash(body: string) { return hex(await crypto.subtle.digest("SHA-256", encoder.encode(body))); }

export async function signOpenReplyEvent(body: string, key: OpenReplyWebhookKey, timestamp: number): Promise<string> {
  const secret = await crypto.subtle.importKey("raw", encoder.encode(key.secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", secret, encoder.encode(`v1.${key.keyId}.${timestamp}.${body}`));
  return `t=${timestamp},v1=${hex(signature)}`;
}

export async function verifyOpenReplyEventSignature(body: string, header: string, key: OpenReplyWebhookKey, now: number): Promise<boolean> {
  const parts = /^t=(\d{10}),v1=([a-f0-9]{64})$/.exec(header);
  if (!parts || Math.abs(now - Number(parts[1])) > 300) return false;
  const bytes = new Uint8Array(parts[2].match(/../g)!.map(b => parseInt(b, 16)));
  const secret = await crypto.subtle.importKey("raw", encoder.encode(key.secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  return crypto.subtle.verify("HMAC", secret, bytes, encoder.encode(`v1.${key.keyId}.${parts[1]}.${body}`));
}

export async function readOpenReplyBody(request: Request): Promise<string> {
  const max = 64 * 1024;
  if (Number(request.headers.get("content-length")) > max || !request.body) throw new Error("invalid_size");
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  const deadline = AbortSignal.timeout(5000);
  const timedOut = new Promise<never>((_, reject) => deadline.addEventListener("abort", () => reject(new Error("body_timeout")), { once: true }));
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), timedOut]);
      if (done) break;
      size += value.byteLength;
      if (size > max) throw new Error("invalid_size");
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let position = 0;
    for (const chunk of chunks) { bytes.set(chunk, position); position += chunk.length; }
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}

export async function handleOpenReplyWebhook(request: Request, dependencies: {
  keys: string | undefined;
  ingest: (event: OpenReplyEvent, hash: string) => Promise<IngestResult>;
  now?: number;
}): Promise<Response> {
  const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  let keys: OpenReplyWebhookKey[];
  try { keys = parseOpenReplyWebhookKeys(dependencies.keys); } catch { return json({ error: "not_configured" }, 503); }
  if (request.method === "GET") return json({ service: "openreply-crm-events", configured: keys.length > 0, mode: "receive-only" });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!keys.length) return json({ error: "not_configured" }, 503);
  const key = keys.find(k => k.keyId === request.headers.get("x-openreply-key-id"));
  if (!key) return json({ error: "invalid_signature" }, 401);
  let raw: string;
  try { raw = await readOpenReplyBody(request); } catch { return json({ error: "invalid_body" }, 413); }
  const now = dependencies.now ?? Math.floor(Date.now() / 1000);
  if (!await verifyOpenReplyEventSignature(raw, request.headers.get("x-openreply-signature") ?? "", key, now)) return json({ error: "invalid_signature" }, 401);
  let event: OpenReplyEvent | null;
  try { event = parseOpenReplyEvent(JSON.parse(raw)); } catch { event = null; }
  if (!event) return json({ error: "invalid_event" }, 400);
  if (event.workspaceId !== key.workspaceId || event.instagramAccountId !== key.instagramAccountId) return json({ error: "account_not_authorized" }, 403);
  if (Date.parse(event.occurredAt) > (now + 300) * 1000) return json({ error: "invalid_event" }, 400);
  try {
    const result = await dependencies.ingest(event, await openReplyPayloadHash(raw));
    if (result === "stored" || result === "duplicate") return json({ received: true, result });
    return json({ error: result }, result === "unverified_route" ? 403 : result === "event_conflict" ? 409 : 400);
  } catch { return json({ error: "retry_later" }, 503); }
}

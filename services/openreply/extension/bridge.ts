import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/client";
import { parseCommentEvents, parseMessageEvents } from "@/lib/meta/webhook";
import { parseOpenReplyEvent, parseOpenReplyWebhookKeys, signOpenReplyEvent, type OpenReplyEvent, type OpenReplyWebhookKey } from "./contract";

type Binding = OpenReplyWebhookKey & { since: Date; accountConnectionId?: string };
export function parseBindings(raw: string): Binding[] {
  const input = JSON.parse(raw) as Array<Record<string, unknown>>;
  const keys = parseOpenReplyWebhookKeys(raw);
  return keys.map((key, i) => {
    const since = typeof input[i].since === "string" ? new Date(input[i].since as string) : new Date(NaN);
    if (!Number.isFinite(since.getTime()) || since.getTime() > Date.now() + 300000) throw Error("configuration_invalid");
    return { ...key, since };
  });
}
export function validateDestination(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash
    || !/^(?:[a-z0-9-]+\.)+[a-z]{2,63}$/i.test(url.hostname)
    || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(url.hostname)) throw Error("configuration_invalid");
  return url.href;
}
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const clipped = (text: string) => text.length <= 1600 ? text : text.slice(0, 1560) + " … [texto incompleto]";
export function makeEvent(binding: Binding, type: OpenReplyEvent["type"], externalId: string, personId: string, text: string, at: Date, campaignId: string | null = null, displayName?: string): OpenReplyEvent {
  const event = {
    version: 1, eventId: digest([binding.workspaceId, binding.instagramAccountId, type, externalId].join("|")), type,
    workspaceId: binding.workspaceId, instagramAccountId: binding.instagramAccountId, campaignId,
    occurredAt: at.toISOString(), data: { externalId, personId, text: clipped(text), ...(displayName ? { displayName: displayName.slice(0, 120) } : {}) },
  };
  const parsed = parseOpenReplyEvent(event);
  if (!parsed) throw Error("source_event_invalid");
  return parsed;
}

async function resolveBindings(bindings: Binding[]): Promise<Binding[]> {
  const accounts = await prisma.instagramAccount.findMany({
    where: { instagramId: { in: bindings.map(b => b.instagramAccountId) } },
    select: { id: true, instagramId: true, workspaceId: true },
  });
  return bindings.map(b => {
    const account = accounts.find(a => a.instagramId === b.instagramAccountId && a.workspaceId === b.workspaceId);
    if (!account) throw Error("source_account_mismatch");
    return { ...b, accountConnectionId: account.id };
  });
}

/** Scan durable native records, rather than adding failure paths to Meta sends. */
export async function collectNativeEvents(bindings: Binding[], batchSize = 100): Promise<number> {
  if (!bindings.length) return 0;
  const resolved = await resolveBindings(bindings);
  const since = new Date(Math.min(...resolved.map(b => b.since.getTime())));
  const byAccount = new Map(resolved.map(b => [b.instagramAccountId, b]));
  const webhookIds = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT w.id FROM "WebhookEvent" w WHERE w.status='PROCESSED' AND w."createdAt">=${since}
    AND NOT EXISTS (SELECT 1 FROM "CrmBridgeSourceReceipt" r WHERE r."sourceType"='webhook' AND r."sourceId"=w.id)
    ORDER BY w."createdAt",w.id LIMIT ${batchSize}`);
  let captured = 0;
  for (const { id } of webhookIds) {
    await prisma.$transaction(async tx => {
      const source = await tx.webhookEvent.findUnique({ where: { id }, select: { payload: true, createdAt: true, status: true } });
      if (!source || source.status !== "PROCESSED") return;
      const claimed = await tx.crmBridgeSourceReceipt.createMany({ data: [{ sourceType: "webhook", sourceId: id }], skipDuplicates: true });
      if (!claimed.count) return;
      const payload = source.payload as unknown as Parameters<typeof parseCommentEvents>[0];
      const events: OpenReplyEvent[] = [];
      for (const comment of parseCommentEvents(payload)) {
        const b = byAccount.get(comment.instagramAccountId);
        if (!b || source.createdAt < b.since) continue;
        events.push(makeEvent(b, "instagram.comment_received", comment.commentId, comment.commenterId, comment.commentText, source.createdAt, null, comment.commenterName));
      }
      for (const message of parseMessageEvents(payload)) {
        const b = byAccount.get(message.instagramAccountId);
        if (!b || source.createdAt < b.since) continue;
        // Attribute only when exactly one recent, active campaign has an
        // accepted reply to this account-scoped person. Ambiguity stays null.
        const prior = await tx.dmLog.findMany({
          where: { workspaceId: b.workspaceId, instagramAccountId: b.accountConnectionId, commenterId: message.senderId,
            status: "SENT", dmDeliveryUnconfirmed: false, dmSentAt: { gte: new Date(source.createdAt.getTime() - 7 * 86400000), lte: source.createdAt },
            automation: { isActive: true, workspaceId: b.workspaceId } },
          select: { automationId: true }, take: 21, orderBy: { dmSentAt: "desc" },
        });
        const campaigns = new Set(prior.map(p => p.automationId));
        const campaignId = prior.length < 21 && campaigns.size === 1 ? [...campaigns][0] : null;
        events.push(makeEvent(b, "instagram.message_received", message.messageId, message.senderId, message.messageText, source.createdAt, campaignId));
      }
      if (events.length) {
        const added = await tx.crmBridgeOutbox.createMany({ data: events.map(e => ({ eventId: e.eventId, workspaceId: e.workspaceId, instagramAccountId: e.instagramAccountId, payload: e as unknown as Prisma.InputJsonValue })), skipDuplicates: true });
        captured += added.count;
      }
    });
  }
  const replyIds = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT d.id FROM "DmLog" d WHERE d.status='SENT' AND d."dmDeliveryUnconfirmed"=false
    AND d."dmSentAt">=${since} AND d."instagramAccountId" IN (${Prisma.join(resolved.map(b => b.accountConnectionId!))})
    AND NOT EXISTS (SELECT 1 FROM "CrmBridgeSourceReceipt" r WHERE r."sourceType"='reply' AND r."sourceId"=d.id)
    ORDER BY d."dmSentAt",d.id LIMIT ${batchSize}`);
  for (const { id } of replyIds) {
    await prisma.$transaction(async tx => {
      const log = await tx.dmLog.findUnique({ where: { id }, select: { workspaceId: true, automationId: true, commenterId: true, dmSentAt: true, instagramAccountId: true, status: true, dmDeliveryUnconfirmed: true } });
      const b = log && resolved.find(b => b.workspaceId === log.workspaceId && b.accountConnectionId === log.instagramAccountId);
      if (!log || !b || log.status !== "SENT" || log.dmDeliveryUnconfirmed || !log.dmSentAt || log.dmSentAt < b.since) return;
      const claimed = await tx.crmBridgeSourceReceipt.createMany({ data: [{ sourceType: "reply", sourceId: id }], skipDuplicates: true });
      if (!claimed.count) return;
      const event = makeEvent(b, "instagram.reply_accepted", id, log.commenterId, "", log.dmSentAt, log.automationId);
      const added = await tx.crmBridgeOutbox.createMany({ data: [{ eventId: event.eventId, workspaceId: b.workspaceId, instagramAccountId: b.instagramAccountId, payload: event as unknown as Prisma.InputJsonValue }], skipDuplicates: true });
      captured += added.count;
    });
  }
  return captured;
}

export function retrySeconds(attempt: number): number { return Math.min(3600, 5 * 2 ** Math.max(0, Math.min(attempt - 1, 12))); }

export async function dispatchOne(bindings: Binding[], destination: string, send: typeof fetch = fetch): Promise<boolean> {
  const token = randomUUID();
  const row = await prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<Array<{ eventId: string }>>(Prisma.sql`
      SELECT "eventId" FROM "CrmBridgeOutbox" WHERE
      (status='PENDING' AND "nextAttemptAt"<=now()) OR (status='PROCESSING' AND "lockedUntil"<now())
      ORDER BY "createdAt","eventId" FOR UPDATE SKIP LOCKED LIMIT 1`);
    if (!rows[0]) return null;
    return tx.crmBridgeOutbox.update({ where: { eventId: rows[0].eventId }, data: { status: "PROCESSING", leaseToken: token, lockedUntil: new Date(Date.now() + 30000), attempts: { increment: 1 } } });
  });
  if (!row) return false;
  const event = parseOpenReplyEvent(row.payload);
  const binding = bindings.find(b => b.workspaceId === row.workspaceId && b.instagramAccountId === row.instagramAccountId);
  let error = "delivery_unavailable", permanent = false, accepted = false;
  if (!event || !binding || event.workspaceId !== binding.workspaceId || event.instagramAccountId !== binding.instagramAccountId) {
    error = "source_account_mismatch"; permanent = true;
  } else {
    try {
      const body = JSON.stringify(row.payload);
      const response = await send(validateDestination(destination), { method: "POST", body, redirect: "error", signal: AbortSignal.timeout(8000),
        headers: { "Content-Type": "application/json", "x-openreply-key-id": binding.keyId,
          "x-openreply-signature": await signOpenReplyEvent(body, binding, Math.floor(Date.now() / 1000)) } });
      if (response.ok && Number(response.headers.get("content-length") ?? 0) <= 4096) {
        const ack = await response.json();
        accepted = ack?.received === true && ["stored", "duplicate"].includes(ack.result);
        if (!accepted) error = "invalid_acknowledgment";
      } else {
        await response.body?.cancel().catch(() => undefined);
        permanent = [400, 401, 403, 404, 405, 409, 413].includes(response.status);
        error = response.status === 429 ? "receiver_rate_limited" : permanent ? "receiver_rejected" : "receiver_unavailable";
      }
    } catch { error = "delivery_unavailable"; }
  }
  const dead = permanent || row.attempts >= 8;
  await prisma.crmBridgeOutbox.updateMany({ where: { eventId: row.eventId, status: "PROCESSING", leaseToken: token },
    data: accepted ? { status: "DELIVERED", deliveredAt: new Date(), leaseToken: null, lockedUntil: null, lastErrorCode: null }
      : { status: dead ? "DEAD" : "PENDING", nextAttemptAt: new Date(Date.now() + retrySeconds(row.attempts) * 1000), leaseToken: null, lockedUntil: null, lastErrorCode: error } });
  return true;
}

export function startCrmBridge(): () => Promise<void> {
  const raw = process.env.CRM_BRIDGE_BINDINGS_JSON, url = process.env.CRM_WEBHOOK_URL;
  if (!raw || !url) return async () => {};
  let bindings: Binding[], destination: string;
  try { bindings = parseBindings(raw); destination = validateDestination(url); } catch {
    console.error("[CRM Bridge] configuration_invalid"); return async () => {};
  }
  if (!bindings.length) return async () => {};
  let closing = false, running: Promise<void> | null = null;
  const tick = () => {
    if (closing || running) return;
    running = (async () => {
      try {
        await collectNativeEvents(bindings);
        for (let i = 0; i < 20 && !closing; i++) if (!await dispatchOne(bindings, destination)) break;
      } catch { console.error("[CRM Bridge] cycle_failed; durable records retained"); }
    })().finally(() => { running = null; });
  };
  const interval = setInterval(tick, 5000);
  tick();
  return async () => { closing = true; clearInterval(interval); await running; };
}

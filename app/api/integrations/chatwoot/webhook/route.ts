import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash, timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function equalSecret(a: string, b: string) {
  return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
}
type RecordLike = Record<string, unknown>;
function obj(v: unknown): RecordLike { return v && typeof v === "object" && !Array.isArray(v) ? v as RecordLike : {}; }
function str(v: unknown): string { return typeof v === "string" ? v : typeof v === "number" && Number.isSafeInteger(v) ? String(v) : ""; }

export async function POST(req: NextRequest) {
  const secret = process.env.CHATWOOT_WEBHOOK_TOKEN;
  const token = req.headers.get("x-chatwoot-crm-token") ?? req.nextUrl.searchParams.get("token") ?? "";
  if (!secret || !token || !equalSecret(token, secret)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenantId = process.env.CHATWOOT_TENANT_ID ?? "";
  const accountId = str(process.env.CHATWOOT_ACCOUNT_ID);
  const inboxId = str(process.env.CHATWOOT_INBOX_ID);
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!uuid.test(tenantId) || !accountId || !inboxId || !url || !key) return NextResponse.json({ error: "Integration not configured" }, { status: 503 });
  const raw = await req.text();
  if (raw.length > 1024 * 256) return NextResponse.json({ error: "Too large" }, { status: 413 });
  let payload: RecordLike;
  try { payload = obj(JSON.parse(raw)); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (payload.event !== "message_created" || str(payload.message_type) !== "incoming") return NextResponse.json({ ignored: true });
  const conversation = obj(payload.conversation);
  const account = obj(payload.account);
  const inbox = obj(payload.inbox);
  const sender = obj(payload.sender);
  const externalConversation = str(conversation.id);
  const externalMessage = str(payload.id);
  if (str(account.id) !== accountId || str(inbox.id || conversation.inbox_id) !== inboxId || !externalConversation || !externalMessage) {
    return NextResponse.json({ error: "Unrecognized Chatwoot account or inbox" }, { status: 403 });
  }
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: channel, error: channelError } = await db.from("channels").select("id").eq("tenant_id", tenantId).eq("provider", "chatwoot").eq("external_account_id", `${accountId}:${inboxId}`).eq("status", "connected").maybeSingle();
  if (channelError) return NextResponse.json({ error: "Channel lookup failed" }, { status: 503 });
  if (!channel) return NextResponse.json({ error: "Channel not enabled" }, { status: 503 });
  const externalThread = `chatwoot:${accountId}:${inboxId}:${externalConversation}`;
  const externalId = `chatwoot:${accountId}:${externalMessage}`;
  const { data: existingMessage, error: existingError } = await db.from("messages").select("id").eq("tenant_id", tenantId).eq("external_message_id", externalId).maybeSingle();
  if (existingError) return NextResponse.json({ error: "Message lookup failed" }, { status: 503 });
  if (existingMessage) return NextResponse.json({ duplicate: true });
  let { data: thread, error: threadError } = await db.from("conversations").select("id").eq("tenant_id", tenantId).eq("external_thread_id", externalThread).maybeSingle();
  if (threadError) return NextResponse.json({ error: "Conversation lookup failed" }, { status: 503 });
  if (!thread) {
    const name = str(sender.name).slice(0, 150) || "Cliente WhatsApp";
    const { data: created, error } = await db.from("conversations").insert({
      tenant_id: tenantId, channel_id: channel.id, external_thread_id: externalThread,
      subject: name, status: "open", priority: "normal",
      metadata: { source: "chatwoot", account_id: accountId, inbox_id: inboxId },
    }).select("id").single();
    if (error) return NextResponse.json({ error: "Conversation create failed" }, { status: 503 });
    thread = created;
  }
  const body = str(payload.content).slice(0, 20000);
  const { error: messageError } = await db.from("messages").insert({
    tenant_id: tenantId, conversation_id: thread.id, external_message_id: externalId,
    direction: "inbound", sender_type: "contact", message_type: "text",
    body: body || "[Mensaje sin texto]", status: "received",
    metadata: { source: "chatwoot" },
  });
  if (messageError) return NextResponse.json({ error: "Message persist failed" }, { status: 503 });
  await db.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("tenant_id", tenantId).eq("id", thread.id);
  return NextResponse.json({ received: true });
}

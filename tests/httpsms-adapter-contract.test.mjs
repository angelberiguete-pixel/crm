import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const migration=read("supabase/migrations/20261102150000_httpsms_tenant_gateway.sql");
const send=read("supabase/functions/httpsms-send/index.ts");
const webhook=read("supabase/functions/httpsms-webhook/index.ts");
const status=read("components/crm-httpsms-status.tsx");
const center=read("components/crm-integration-center.tsx");
const inbox=read("components/omnichannel-inbox.tsx");

test("httpSMS SQL is fail-closed and tenant-scoped",()=>{
  for(const token of [
    "sender_e164 text not null unique",
    "enabled boolean not null default false",
    "sms_gateway_enabled_verified",
    "enable row level security",
    "revoke all on public.sms_gateway_routes from public, anon, authenticated",
    "revoke all on public.sms_gateway_webhook_receipts from public, anon, authenticated",
    "private.crm_active_tenant_matches(p_tenant_id)",
    "private.is_tenant_admin(p_tenant_id)",
    "tenant_request_sms_connection",
    "'disconnected'",
    "sms_gateway_manual_send_once"
  ])assert.ok(migration.includes(token),token);
  assert.match(migration,/unique \(tenant_id, channel_id\)/);
  assert.match(migration,/provider='sms'/);
  assert.doesNotMatch(migration,/insert\s+into\s+public\.sms_gateway_routes/i);
});

test("httpSMS send requires login, verified sender, matched thread, inbound, idempotency",()=>{
  for(const token of [
    'HTTPSMS_OUTBOUND_ENABLED','HTTPSMS_API_KEY',
    'getUser(match[1])','from("memberships")','from("conversations")',
    'from("sms_gateway_routes")','from("contacts")','from("messages")',
    'channel?.provider!=="sms"','conversation.assigned_to!==user.id',
    'lastInbound?.created_at','sms_opted_out','sms_daily_limit_or_unavailable',
    'clientRequestId','human_approved:true','request_id:clientRequestId',
    'sms_unconfirmed_do_not_retry_blindly'
  ])assert.ok(send.includes(token),token);
  assert.ok(send.indexOf('from("messages").insert(')<send.indexOf('fetch("https://api.httpsms.com'));
  assert.ok(send.indexOf('from("memberships")')<send.indexOf('fetch("https://api.httpsms.com'));
  assert.doesNotMatch(send,/NEXT_PUBLIC_HTTPSMS|auto_reply:true|apiKey\s*=\s*"\w{25,}"/);
});

test("httpSMS webhook validates JWT and maps phone owner rather than claimed tenant",()=>{
  for(const token of [
    'jwtVerify(bearer[1]','algorithms:["HS256"]',
    'HTTPSMS_WEBHOOK_SIGNING_KEY','HTTPSMS_WEBHOOK_ENABLED',
    'eventType!==request.headers.get("X-Event-Type")',
    '.eq("sender_e164",owner)','from("sms_gateway_webhook_receipts")',
    'receipt.processed','from("contacts")','from("conversations")',
    'ignoreDuplicates:true','sms_opted_out:true',
    '.eq("tenant_id",route.tenant_id)'
  ])assert.ok(webhook.includes(token),token);
  assert.doesNotMatch(webhook,/body\.tenantId|sms\.tenant_id|NEXT_PUBLIC_/);
});

test("CRM exposes SMS request and manual-only response without client secrets",()=>{
  assert.match(center,/CrmHttpsmsStatus tenantId=\{id\}/);
  assert.match(status,/tenant_sms_gateway_status/);
  assert.match(status,/tenant_request_sms_connection/);
  assert.match(status,/No se enviarán SMS/);
  assert.match(inbox,/httpsms-send/);
  assert.match(inbox,/channel\?\.provider==="sms"/);
  assert.match(inbox,/<option value="sms">SMS<\/option>/);
  assert.doesNotMatch(status,/name="api_key"|type="password"|HTTPSMS_API_KEY/);
});

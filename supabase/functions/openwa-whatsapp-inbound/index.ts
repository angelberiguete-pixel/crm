/**
 * OpenWA v5 webhook receiver for the multi-tenant CRM.
 * Receive-only. No auto-send, AI inference, credentials or tenants from payload.
 * Deploy with --no-verify-jwt only after the private secret and migration exist.
 */
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { parseOpenWaInboundText } from "../../../lib/openwa-whatsapp-webhook.mjs";

const enc = new TextEncoder();
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}
function equalsSecret(a: string, b: string) {
  const left = enc.encode(a), right = enc.encode(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}
Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const secret = Deno.env.get("OPENWA_WEBHOOK_SECRET") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (secret.length < 32 || secret.length > 512 || !supabaseUrl || !serviceRole) {
    return json({ error: "not_configured" }, 503);
  }
  if (!equalsSecret(request.headers.get("x-webhook-secret") ?? "", secret)) {
    return json({ error: "unauthorized" }, 401);
  }
  const len = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(len) || len > 262144) return json({ error: "too_large" }, 413);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length < 2 || bytes.length > 262144) {
    return json({ error: "invalid_size" }, 413);
  }

  let event: unknown;
  try { event = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { return json({ error: "invalid_json" }, 400); }

  const inbound = parseOpenWaInboundText(event);
  if (!inbound) return json({ received: true, processed: false });
  const db = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await db.rpc("ingest_verified_openwa_whatsapp_text", {
    p_session_id: inbound.sessionId,
    p_message_id: inbound.externalMessageId,
    p_from: inbound.from,
    p_contact_name: inbound.contactName,
    p_body: inbound.body
  });
  if (error) {
    // Do not log message text, client numbers or secrets.
    console.error("openwa_ingest_failed", error.code ?? "db_error");
    return json({ error: "retry_later" }, 503);
  }
  if (!["stored", "duplicate", "unverified_route", "invalid_message"].includes(data)) {
    return json({ error: "unexpected_result" }, 503);
  }
  return json({ received: true, stored: data === "stored", result: data });
});

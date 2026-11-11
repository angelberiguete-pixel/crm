import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { handleOpenReplyWebhook, type IngestResult } from "../../../lib/openreply-events.ts";

// This webhook authenticates with per-workspace/account HMAC keys, not a public JWT.
Deno.serve(request => handleOpenReplyWebhook(request, {
  keys: Deno.env.get("CRM_OPENREPLY_WEBHOOK_KEYS_JSON"),
  async ingest(event, hash) {
    const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.rpc("ingest_verified_openreply_event", { p_event: event, p_payload_hash: hash });
    if (error || !["stored", "duplicate", "unverified_route", "event_conflict", "invalid_event"].includes(data)) throw new Error("ingest_unavailable");
    return data as IngestResult;
  },
}));

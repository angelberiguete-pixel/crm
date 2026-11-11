import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseOpenWaInboundText } from "../lib/openwa-whatsapp-webhook.mjs";

const sample = {
  webhookId: "evt-test-1", sessionId: "family-power-demo",
  event: "message.received", timestamp: 1793720000000,
  payload: { message: {
    id: "false_18495550123@c.us_MSG001", from: "18495550123@c.us",
    type: "chat", body: "Hola, una cotización",
    notifyName: "Cliente de prueba", fromMe: false
  }}
};
test("receives documented v5 envelope without trusting a tenant id", () => {
  assert.deepEqual(parseOpenWaInboundText({...sample, tenantId:"forged"}), {
    sessionId:"family-power-demo", externalMessageId:"false_18495550123@c.us_MSG001",
    from:"+18495550123", contactName:"Cliente de prueba", body:"Hola, una cotización"
  });
});
test("rejects groups, message echoes, invalid senders, media and wrong payloads", () => {
  const m = sample.payload.message;
  for (const event of [
    {...sample,event:"session.state.changed"},
    {...sample,sessionId:"../../wrong"},
    {...sample,payload:{message:{...m,from:"120000@g.us"}}},
    {...sample,payload:{message:{...m,from:"120000@lid"}}},
    {...sample,payload:{message:{...m,fromMe:true}}},
    {...sample,payload:{message:{...m,type:"image"}}},
    {...sample,payload:{message:{...m,body:""}}},
    {...sample,payload:{message:{...m,id:"x"}}},
    {...sample,payload:{message:{...m,from:"18095550000@c.us",body:"a".repeat(1601)}}},
    {sessionId:"family-power-demo",event:"message.received",data:sample.payload}
  ]) assert.equal(parseOpenWaInboundText(event),null);
});
test("server authenticates before parsing and never trusts webhook-supplied tenant", () => {
  const edge = readFileSync(new URL("../supabase/functions/openwa-whatsapp-inbound/index.ts",import.meta.url),"utf8");
  const sql = readFileSync(new URL("../supabase/migrations/20261103150000_openwa_verified_whatsapp_routes.sql",import.meta.url),"utf8");
  assert.ok(edge.indexOf("equalsSecret(") < edge.indexOf("JSON.parse("));
  for (const item of ["OPENWA_WEBHOOK_SECRET","x-webhook-secret","SUPABASE_SERVICE_ROLE_KEY",
    "ingest_verified_openwa_whatsapp_text"]) assert.ok(edge.includes(item),item);
  assert.doesNotMatch(edge,/sendText|OPENAI_API_KEY|YCLOUD_API_KEY/);
  for (const item of ["openwa_whatsapp_routes", "r.session_id=p_session_id",
    "r.is_enabled", "ch.status='connected'", "t.status='active'",
    "on conflict(session_id,external_message_id) do nothing",
    "from public,anon,authenticated", "to service_role",
    "'requires_human',true"]) assert.ok(sql.toLowerCase().includes(item.toLowerCase()),item);
  assert.doesNotMatch(sql,/security definer|status='won'/i);
});

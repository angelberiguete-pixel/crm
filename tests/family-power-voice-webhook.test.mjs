import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {verifyRetellWebhookSignature} from "../lib/retell-webhook-signature.ts";
import {parseRetellAnalyzedCall} from "../lib/voice-call-contract.ts";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const key="very-long-test-webhook-key-with-32-chars-validated";
const now=Date.parse("2026-11-02T12:00:00Z");
const originalBody=JSON.stringify({event:"call_analyzed",call:{
 call_id:"call_12345678901",agent_id:"agent_12345678901",direction:"inbound",
 from_number:"+18495550123",to_number:"+18495550000",
 call_analysis:{call_summary:"Solicita una llamada de un técnico."},
 transcript:"Sensitive material not accepted",metadata:{tenant_id:"forged"}}});
async function sign(body=originalBody,time=now){
 const k=await crypto.subtle.importKey("raw",new TextEncoder().encode(key),
  {name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const digest=await crypto.subtle.sign("HMAC",k,new TextEncoder().encode(body+time));
 const hex=Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,"0")).join("");
 return "v="+time+",d="+hex;
}
test("signature accepts exact raw body only within five minutes",async()=>{
 const header=await sign();
 assert.equal(await verifyRetellWebhookSignature(originalBody,header,key,now),true);
 assert.equal(await verifyRetellWebhookSignature(originalBody,header,key,now+300001),false);
 assert.equal(await verifyRetellWebhookSignature(originalBody,header,key,now-300001),false);
 assert.equal(await verifyRetellWebhookSignature(originalBody+" ",header,key,now),false);
 assert.equal(await verifyRetellWebhookSignature(originalBody,header,"wrong-key",now),false);
 assert.equal(await verifyRetellWebhookSignature(originalBody,"bad",key,now),false);
 assert.equal(await verifyRetellWebhookSignature(originalBody,null,key,now),false);
 assert.equal(await verifyRetellWebhookSignature("X".repeat(262145),header,key,now),false);
 assert.equal(await verifyRetellWebhookSignature(originalBody,header,undefined,now),false);
});
test("signed event contract never trusts tenant id, transcription or supplied metadata",()=>{
 const call=parseRetellAnalyzedCall(JSON.parse(originalBody));
 assert.equal(call?.agentId,"agent_12345678901");
 assert.equal(call?.fromNumber,"+18495550123");
 assert.equal(call?.summary,"Solicita una llamada de un técnico.");
 assert.doesNotMatch(JSON.stringify(call),/tenant_id|transcript|metadata/);
 assert.equal(parseRetellAnalyzedCall({event:"call_ended",call:{}}),null);
 assert.equal(parseRetellAnalyzedCall({event:"call_analyzed",call:{}}),null);
});
test("edge receiver enforces HMAC before database, only inbound and no provider send",()=>{
 const edge=read("supabase/functions/family-power-retell-events/index.ts");
 const sign=read("lib/retell-webhook-signature.ts");
 assert.match(edge,/RETELL_WEBHOOK_API_KEY/);
 assert.match(edge,/x-retell-signature/);
 assert.match(edge,/request\.arrayBuffer\(\)/);
 assert.match(edge,/verifyRetellWebhookSignature/);
 assert.match(edge,/ingest_verified_retell_voice_call/);
 assert.match(edge,/call\.direction!=="inbound"/);
 assert.ok(edge.indexOf("verifyRetellWebhookSignature(body")<edge.indexOf("db.rpc("));
 assert.doesNotMatch(edge,/createPhoneCall|retell\.call|\/create-phone-call|OPENAI_API_KEY|recording_url/);
 assert.match(sign,/300_000/);
 assert.match(sign,/rawBody\+match\[1\]/);
 assert.match(sign,/crypto\.subtle\.verify/);
});
test("two carrier-unknown line slots, tenant isolation and service-role-only writes",()=>{
 const sql=read("supabase/migrations/20261102090000_family_power_voice_receive_only.sql");
 for(const clause of [
  "line_kind in ('fixed','mobile')","operator_name text not null default 'unknown'",
  "enabled boolean not null default false",
  "not enabled or (",
  "voice_line_routes_provider_destination_unique",
  "voice_calls_unique_provider_call",
  "voice_calls_tenant_route_fk",
  "voice_calls_tenant_contact_fk",
  "voice_calls_tenant_task_fk",
  "enable row level security",
  "private.crm_is_tenant_admin(tenant_id)",
  "from PUBLIC,anon,authenticated",
  "to service_role",
  "where t.slug='family-power'",
  "p_agent_id",
  "r.enabled=true",
  "pg_advisory_xact_lock",
  "v_route.tenant_id",
  "outbound_consent",
  "'todo','normal'",
  "return 'unverified_route'",
  "return 'duplicate'"
 ])assert.ok(sql.includes(clause),"Missing security marker: "+clause);
 assert.doesNotMatch(sql,/\binsert into public\.messages\b|\bupdate public\.opportunities\b/i);
 assert.doesNotMatch(sql,/create policy [^\n]+ for insert to authenticated/i);
 assert.doesNotMatch(sql,/\brecording_url\b|\btranscript_url\b/i);
});

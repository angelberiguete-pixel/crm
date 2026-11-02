import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseRetellAnalyzedCall} from "../lib/voice-call-contract.ts";

const valid={
 event:"call_analyzed",tenant_id:"forged-tenant",
 call:{call_id:"call_test_000001",direction:"inbound",
  from_number:"+18495550123",to_number:"+18495706550",
  call_analysis:{call_summary:"Solicita una cotización; transferir a ventas."},
  recording_url:"https://example.invalid/private-recording",
  transcript:"INFORMACIÓN PRIVADA QUE NO DEBE GUARDARSE"}
};
test("analysed call is normalized without trusting tenant IDs or raw recordings",()=>{
 assert.deepEqual(parseRetellAnalyzedCall(valid),{
  provider:"retell",callId:"call_test_000001",direction:"inbound",
  fromNumber:"+18495550123",toNumber:"+18495706550",
  summary:"Solicita una cotización; transferir a ventas."
 });
});
test("fail closed for unrelated events and malformed provider data",()=>{
 for(const item of [
  {...valid,event:"call_started"},
  {...valid,event:"call_ended"},
  {...valid,call:{...valid.call,call_id:"made-up"}},
  {...valid,call:{...valid.call,to_number:"18495706550"}},
  {...valid,call:{...valid.call,from_number:"+123"}},
  {...valid,call:{...valid.call,direction:"sideways"}},
  {event:"call_analyzed",tenant_id:"forged"}
 ])assert.equal(parseRetellAnalyzedCall(item),null);
});
test("oversized summary rejected, no transcript or audio copied",()=>{
 const parsed=parseRetellAnalyzedCall({...valid,call:{...valid.call,
  call_analysis:{call_summary:"X".repeat(2001)}}});
 assert.equal(parsed?.summary,null);
 assert.doesNotMatch(JSON.stringify(parsed),/recording_url|transcript|tenant_id/);
});
test("no telephony or CRM writes enabled by this scaffold",()=>{
 const src=readFileSync(new URL("../lib/voice-call-contract.ts",import.meta.url),"utf8");
 assert.match(src,/signature/);
 assert.doesNotMatch(src,/service_role|createClient|fetch\(|https:\/\/api\.retellai\.com/);
});

test("Family Power integrations page labels telephony as inactive while operator is unknown",()=>{
 const ui=readFileSync(new URL("../components/crm-integration-center.tsx",import.meta.url),"utf8");
 assert.match(ui,/Llamadas con IA/);
 assert.match(ui,/PhoneCall/);
 assert.match(ui,/Pendiente de pruebas/);
 assert.match(ui,/Usaremos el número actual de Family Power/);
 assert.match(ui,/Sin conectar/);
 assert.doesNotMatch(ui,/retell\.createCall\(|forwardCall\(/);
});

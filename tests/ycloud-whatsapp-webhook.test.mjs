import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseYCloudInboundText} from "../lib/ycloud-whatsapp-webhook.ts";

const signedExample={id:"evt_example_01",type:"whatsapp.inbound_message.received",
 apiVersion:"v2",whatsappInboundMessage:{
 id:"63f872f6741c165b4342a751",wamid:"wamid.HBgNODi_TEST_1",
 wabaId:"123456789012345",from:"+18495550123",to:"+18495706550",
 type:"text",text:{body:"Hola, necesito una cotización"},customerProfile:{name:"Cliente de prueba"}
 }};
test("YCloud inbound v2 is mapped by WABA and recipient number, never a user-provided tenant",()=>{
 assert.deepEqual(parseYCloudInboundText({...signedExample,tenant_id:"forged"}),{
  wabaId:"123456789012345",businessPhone:"+18495706550",from:"+18495550123",
  externalMessageId:"wamid.HBgNODi_TEST_1",contactName:"Cliente de prueba",body:"Hola, necesito una cotización"
 });
});
test("ignore unrelated YCloud events, malformed data, non-text media and history sync",()=>{
 for(const event of [
  {...signedExample,type:"whatsapp.message.updated"},
  {...signedExample,apiVersion:"v1"},
  {...signedExample,whatsappInboundMessage:{...signedExample.whatsappInboundMessage,type:"image"}},
  {...signedExample,whatsappInboundMessage:{...signedExample.whatsappInboundMessage,to:"bad"}},
  {...signedExample,whatsappInboundMessage:{...signedExample.whatsappInboundMessage,text:{body:""}}},
  {...signedExample,whatsappInboundMessage:{...signedExample.whatsappInboundMessage,wabaId:"bad"}},
  {type:"whatsapp.smb.app.state.sync",apiVersion:"v2"}
 ])assert.equal(parseYCloudInboundText(event),null);
});
test("signed webhook fails closed, signs raw body and only uses verified per-tenant route",()=>{
 const edge=readFileSync(new URL("../supabase/functions/ycloud-whatsapp-inbound/index.ts",import.meta.url),"utf8");
 const sql=readFileSync(new URL("../supabase/migrations/20261030230000_ycloud_verified_whatsapp_routes.sql",import.meta.url),"utf8");
 for(const text of ["YCLOUD_WEBHOOK_SECRET","YCLOUD_WEBHOOK_ENDPOINT_ID",
 "ycloud-signature","crypto.subtle.sign","Math.abs","raw",
 "ingest_verified_ycloud_whatsapp_text","safeEquals"])assert.ok(edge.includes(text),text);
 assert.ok(edge.indexOf("validSignature(raw")<edge.indexOf("db.rpc("));
 assert.doesNotMatch(edge,/api\.ycloud\.com\/v2\/whatsapp\/messages|OPENAI_API_KEY/);
 for(const needle of ["r.waba_id=p_waba_id","r.business_phone_e164=p_business_phone",
   "r.is_enabled","ch.status='connected'","to service_role",
   "from PUBLIC,anon,authenticated","on conflict(business_phone_e164,external_message_id) do nothing",
   "'inbound'","'contact'","'requires_human',true"]) assert.ok(sql.toLowerCase().includes(needle.toLowerCase()),needle);
 assert.doesNotMatch(sql,/insert into public\.opportunities|status='won'/i);
});

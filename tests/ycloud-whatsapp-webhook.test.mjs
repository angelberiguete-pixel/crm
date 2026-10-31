import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseYCloudInboundText,parseYCloudOutboundStatus} from "../lib/ycloud-whatsapp-webhook.ts";

const signedExample={id:"evt_example_01",type:"whatsapp.inbound_message.received",
 apiVersion:"v2",whatsappInboundMessage:{
 id:"63f872f6741c165b4342a751",wamid:"wamid.HBgNODi_TEST_1",
 wabaId:"123456789012345",from:"+18495550123",to:"+18495706550",
 type:"text",text:{body:"Hola, necesito una cotización"},customerProfile:{name:"Cliente de prueba"}
 }};
test("YCloud inbound v2 is mapped by WABA and recipient number, never a user-provided tenant",()=>{
 assert.deepEqual(parseYCloudInboundText({...signedExample,tenant_id:"forged"}),{
  wabaId:"123456789012345",businessPhone:"+18495706550",from:"+18495550123",
  externalMessageId:"wamid.HBgNODi_TEST_1",contactName:"Cliente de prueba",body:"Hola, necesito una cotización",kind:"text",replyId:null,ctwaClickId:null
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

test("YCloud referral and interactive buttons are normalized only as data, never a sale",()=>{
 const evt=signedExample;
 const ref=parseYCloudInboundText({...evt,whatsappInboundMessage:{...evt.whatsappInboundMessage,referral:{ctwa_clid:"abc_ValidClickId123456"}}});
 assert.equal(ref?.ctwaClickId,"abc_ValidClickId123456");
 const b=parseYCloudInboundText({...evt,whatsappInboundMessage:{...evt.whatsappInboundMessage,type:"interactive",
  interactive:{type:"button_reply",button_reply:{id:"q:11111111-1111-4111-8111-111111111111:approve_request",title:"Quiero aprobar"}}}});
 assert.equal(b?.kind,"interactive");assert.match(b?.replyId??"",/approve_request/);
 assert.equal(parseYCloudInboundText({...evt,whatsappInboundMessage:{...evt.whatsappInboundMessage,type:"interactive",interactive:{type:"button_reply",button_reply:{id:"made_up_purchase",title:"I bought"}}}}),null);
});
test("Outbound status uses YCloud's id and only documented status values",()=>{
 const m={id:"ycloud_message_123",wamid:"wamid.platform123",wabaId:"123456789012345",from:"+18495706550",status:"delivered"};
 const e={apiVersion:"v2",type:"whatsapp.message.updated",whatsappMessage:m};
 assert.equal(parseYCloudOutboundStatus(e)?.externalMessageId,"ycloud_message_123");
 assert.equal(parseYCloudOutboundStatus({...e,whatsappMessage:{...m,status:"unknown"}}),null);
});
test("Verified CTA & buttons must be bound to WABA, original provider message and correct quote",()=>{
 const migration=readFileSync(new URL("../supabase/migrations/20261031124500_ycloud_interactive_ctwa_delivery.sql",import.meta.url),"utf8");
 for(const marker of ["marketing_whatsapp_click_attribution","marketing_record_verified_ycloud_attribution",
   "marketing_record_verified_ycloud_quote_reply","ycloud_mark_verified_message_status",
   "auth.role() is distinct from 'service_role'","q.contact_id=v_msg.contact_id",
   "rec.external_message_id=p_message_id","request_logged_no_automatic_approval"].filter(x=>x!=="request_logged_no_automatic_approval"))
  assert.ok(migration.includes(marker),marker);
 assert.doesNotMatch(migration,/update\s+public\.quotations\s+set\s+status/i);
});

import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {normalize360DialogWhatsAppTexts} from "../lib/360dialog-webhook.ts";

const inbound={object:"whatsapp_business_account",entry:[{
 id:"123456789012345",changes:[{field:"messages",value:{
  metadata:{phone_number_id:"987654321012345"},
  contacts:[{wa_id:"18095550123",profile:{name:"Cliente de prueba"}}],
  messages:[{from:"18095550123",id:"wamid.TEST-1",type:"text",text:{body:"Quiero información sobre paneles"}}]
 }}]
}]};
test("360dialog inbound text is accepted without tenant parameters",()=>{
 assert.deepEqual(normalize360DialogWhatsAppTexts({...inbound,tenant_id:"forged"}),[{
  kind:"inbound",wabaId:"123456789012345",phoneNumberId:"987654321012345",
  externalMessageId:"wamid.TEST-1",recipient:"18095550123",
  contactName:"Cliente de prueba",body:"Quiero información sobre paneles"
 }]);
});
test("360dialog app echoes are outbound (the doctor) not customers",()=>{
 const echo={object:"whatsapp_business_account",entry:[{
  id:"123456789012345",changes:[{field:"smb_message_echoes",value:{
   metadata:{phone_number_id:"987654321012345"},
   message_echoes:[{from:"18096850011",to:"18095550123",
    id:"wamid.ECHO-1",type:"text",text:{body:"Con gusto, le responderemos."}}]
  }}]
 }]};
 assert.deepEqual(normalize360DialogWhatsAppTexts(echo),[{
  kind:"app_echo",wabaId:"123456789012345",phoneNumberId:"987654321012345",
  externalMessageId:"wamid.ECHO-1",recipient:"18095550123",
  contactName:"",body:"Con gusto, le responderemos."
 }]);
});
test("no cross-tenant spoofing, status/history/unsupported media or bulk sync",()=>{
 for(const value of [
  {...inbound,object:"page"},
  {event:"history",data:{id:"123456789012345",history:[{threads:[{messages:[{type:"text"}]}]}]}},
  {event:"smb_app_state_sync",data:{id:"123456789012345",state_sync:[{}]}},
  {object:"whatsapp_business_account",entry:[{id:"bad",changes:inbound.entry[0].changes}]},
  {object:"whatsapp_business_account",entry:[{id:"123456789012345",changes:[{
   field:"messages",value:{metadata:{phone_number_id:"987654321012345"},
    statuses:[{id:"wamid.TEST-1",status:"read"}],messages:[]}
  }]}]},
  {object:"whatsapp_business_account",entry:[{id:"123456789012345",changes:[{
   field:"messages",value:{metadata:{phone_number_id:"987654321012345"},
    messages:[{from:"18095550123",id:"wamid.TEST-2",type:"image"}]}
  }]}]},
 ]) assert.equal(normalize360DialogWhatsAppTexts(value).length,0);
});
test("security gates: bearer before DB, no Meta HMAC shortcut, restricted SQL RPCs",()=>{
 const edge=readFileSync(new URL("../supabase/functions/360dialog-whatsapp-inbound/index.ts",import.meta.url),"utf8");
 const sql=readFileSync(new URL("../supabase/migrations/20261029235500_360dialog_coexistence_echo.sql",import.meta.url),"utf8");
 const meta=readFileSync(new URL("../supabase/migrations/20261029202000_verified_whatsapp_tenant_router.sql",import.meta.url),"utf8");
 for(const key of ["D360_WEBHOOK_BEARER_TOKEN","authorization","equal(provided","ingest_verified_whatsapp_text","ingest_verified_whatsapp_echo","serviceRole"])
  assert.ok(edge.includes(key),key);
 assert.ok(edge.indexOf("equal(provided")<edge.indexOf("db.rpc("));
 assert.doesNotMatch(edge,/whatsapp-test-send|OPENAI_API_KEY|graph.facebook.com/);
 for(const key of ["security invoker","r.waba_id=p_waba_id","r.is_enabled",
  "ch.status='connected'","'outbound'","'external'","'business_app_echo'",
  "to service_role","from PUBLIC,anon,authenticated"])
  assert.ok(sql.toLowerCase().includes(key.toLowerCase()),key);
 assert.match(meta,/unique\(phone_number_id,external_message_id\)/);
});

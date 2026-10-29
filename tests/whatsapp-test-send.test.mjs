import {test} from "node:test";
import assert from "node:assert/strict";
import {validateTestWhatsAppDraft,hasVerifiedWhatsAppChannel,metaWhatsAppPayload} from "../supabase/functions/whatsapp-test-send/policy.ts";
const id="11111111-1111-4111-8111-111111111111";
test("test sends require explicit message and fully configured phone + fixed test recipient",()=>{
  assert.equal(validateTestWhatsAppDraft("Mensaje de prueba",id,"123456789","18095551234",id),null);
  for(const [msg,request,phone,receiver,tenant] of [
    ["",id,"123456789","18095551234",id],
    ["x".repeat(1001),id,"123456789","18095551234",id],
    ["Bienvenido","not-a-uuid","123456789","18095551234",id],
    ["Bienvenido",id,"phone-id","18095551234",id],
    ["Bienvenido",id,"123456789","+18095551234",id],
    ["Bienvenido",id,"123456789","18095551234","different"]
  ]) assert.ok(validateTestWhatsAppDraft(msg,request,phone,receiver,tenant));
});
test("channel must belong to verified Meta phone mapping, not merely a connected label",()=>{
  const a={provider:"whatsapp",status:"connected",external_account_id:"123456789",settings:{connection_verified:true}};
  assert.equal(hasVerifiedWhatsAppChannel(a,"123456789"),true);
  assert.equal(hasVerifiedWhatsAppChannel({...a,status:"disconnected"},"123456789"),false);
  assert.equal(hasVerifiedWhatsAppChannel({...a,external_account_id:"54321"},"123456789"),false);
  assert.equal(hasVerifiedWhatsAppChannel({...a,settings:{}}, "123456789"),false);
  assert.equal(hasVerifiedWhatsAppChannel({...a,provider:"email"},"123456789"),false);
});
test("Meta Cloud API payload is text-only and uses only server-approved recipient",()=>{
  assert.deepEqual(metaWhatsAppPayload("18095551234"," Prueba enviada desde CRM "),{
    messaging_product:"whatsapp",recipient_type:"individual",to:"18095551234",
    type:"text",text:{preview_url:false,body:"Prueba enviada desde CRM"}
  });
});

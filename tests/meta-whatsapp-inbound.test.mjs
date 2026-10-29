import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {normalizeVerifiedWhatsAppTexts} from "../lib/meta-whatsapp-inbound.ts";

const sample={
 object:"whatsapp_business_account",
 entry:[{id:"123456789012345",changes:[{field:"messages",value:{
   metadata:{phone_number_id:"987654321012345"},
   contacts:[{wa_id:"18095550123",profile:{name:"Persona de Prueba"}}],
   messages:[{from:"18095550123",id:"wamid.TEST-0001",type:"text",text:{body:"Hola, quisiera una cita"}}],
 }}]}]
};
test("route only verified-style Meta message envelopes, not client-specified tenant IDs",()=>{
 const out=normalizeVerifiedWhatsAppTexts({...sample,tenant_id:"malicious"});
 assert.deepEqual(out,[{
   wabaId:"123456789012345",phoneNumberId:"987654321012345",
   externalMessageId:"wamid.TEST-0001",sender:"18095550123",
   contactName:"Persona de Prueba",body:"Hola, quisiera una cita",
 }]);
 assert.equal(normalizeVerifiedWhatsAppTexts({...sample,object:"page"}).length,0);
 assert.equal(normalizeVerifiedWhatsAppTexts({object:"whatsapp_business_account",entry:[{id:"bad",changes:sample.entry[0].changes}]}).length,0);
});
test("unsupported media, statuses, missing Meta phone and oversized bodies never create fake messages",()=>{
 const change=sample.entry[0].changes[0],v=change.value;
 assert.equal(normalizeVerifiedWhatsAppTexts({...sample,entry:[{...sample.entry[0],changes:[{field:"messages",value:{...v,messages:[{from:"18095550123",id:"wamid.TEST-0001",type:"image"}]}}]}]}).length,0);
 assert.equal(normalizeVerifiedWhatsAppTexts({...sample,entry:[{...sample.entry[0],changes:[{field:"messages",value:{...v,messages:[],statuses:[{id:"wamid.STATUS"}]}}]}]}).length,0);
 assert.equal(normalizeVerifiedWhatsAppTexts({...sample,entry:[{...sample.entry[0],changes:[{field:"messages",value:{...v,metadata:{}}}]}]}).length,0);
 assert.equal(normalizeVerifiedWhatsAppTexts({...sample,entry:[{...sample.entry[0],changes:[{field:"messages",value:{...v,messages:[{from:"18095550123",id:"wamid.TEST-0001",type:"text",text:{body:"x".repeat(2000)}}]}}]}]}).length,0);
});
test("router is server-only, Meta HMAC and verified mapping required, no auto-send or paid AI",()=>{
 const source=readFileSync(new URL("../supabase/functions/meta-whatsapp-inbound/index.ts",import.meta.url),"utf8");
 const migration=readFileSync(new URL("../supabase/migrations/20261029202000_verified_whatsapp_tenant_router.sql",import.meta.url),"utf8");
 for(const s of ["x-hub-signature-256","metaSignatureValid","META_APP_SECRET","META_WHATSAPP_VERIFY_TOKEN","ingest_verified_whatsapp_text","unverified_route"])assert.ok(source.includes(s),s);
 assert.ok(source.indexOf("metaSignatureValid(raw")<source.indexOf("db.rpc("),"signature must be validated before database write");
 assert.doesNotMatch(source,/openai\.com|graph\.facebook\.com/);
 for(const s of ["unique(phone_number_id,external_message_id)","r.is_enabled=true","r.waba_id=p_waba_id","ch.status='connected'","SECURITY INVOKER","grant execute on function public.ingest_verified_whatsapp_text","to service_role"])assert.ok(migration.toLowerCase().includes(s.toLowerCase()),s);
 assert.ok(migration.includes("from PUBLIC,anon,authenticated"));
 assert.ok(migration.includes("'suggested_agent_id'"));
 assert.ok(migration.includes("'requires_human',true"));
});

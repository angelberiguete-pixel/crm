import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync("supabase/migrations/20261031190000_ycloud_media_intake_metadata_only.sql","utf8");
const edge=readFileSync("supabase/functions/ycloud-whatsapp-inbound/index.ts","utf8");
test("media intake authenticates service_role and reuses verified WABA route + dedupe",()=>{
 for(const word of ["auth.role() is distinct from 'service_role'","ingest_verified_ycloud_whatsapp_text",
   "ycloud_whatsapp_routes","ycloud_whatsapp_inbound_receipts","r.waba_id=p_waba_id",
   "rec.external_message_id=p_message_id","m.direction='inbound'","grant execute on function"])assert.ok(sql.includes(word),word);
});
test("media evidence remains pending, no URL is trusted and no payment can be verified",()=>{
 for(const word of ["pending_private_download","not_verified","human_only","not_downloaded"])assert.ok(sql.includes(word),word);
 assert.doesNotMatch(sql,/update\s+public\.orders\b|update\s+public\.quotations\b|insert\s+into\s+public\.crm_family_payment_receipts\b/i);
 assert.doesNotMatch(sql,/external_url|http[s]?:\/\//i);
 assert.ok(edge.indexOf("validSignature(raw")<edge.indexOf("ingest_verified_ycloud_whatsapp_media"));
});

import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const edge=readFileSync("supabase/functions/ycloud-whatsapp-inbound/index.ts","utf8");
const sql=readFileSync("supabase/migrations/20261031193000_ycloud_private_inbound_media.sql","utf8");

test("inbound media is disabled unless explicitly enabled and HMAC authenticated",()=>{
 assert.match(edge,/YCLOUD_INBOUND_MEDIA_ENABLED/);
 assert.match(edge,/YCLOUD_API_KEY/);
 assert.match(edge,/parseYCloudInboundMedia/);
 assert.ok(edge.indexOf("validSignature(raw")<edge.indexOf("downloadVerifiedMedia(inboundMedia"));
 assert.match(edge,/received\.data==="unverified_route"/);
 assert.match(edge,/\.eq\("external_message_id",inboundMedia\.externalMessageId\)/);
 assert.match(edge,/\.eq\("external_thread_id",inboundMedia\.from\)/);
});
test("media downloads fail closed for redirects, oversized media, magic bytes and checksum",()=>{
 assert.match(edge,/redirect:"error"/);
 assert.match(edge,/MAX_INBOUND_MEDIA_BYTES=8\*1024\*1024/);
 assert.match(edge,/validFileMagic\(bytes,media\.mimeType\)/);
 assert.match(edge,/media\.sha256/);
 assert.match(edge,/provider_media_checksum_mismatch/);
 assert.doesNotMatch(edge,/external_url:inboundMedia\.downloadUrl/);
});
test("stored media is private and inaccessible to other conversations",()=>{
 assert.match(edge,/\.storage\.from\("crm-documents"\)/);
 assert.match(edge,/\.upload\(objectPath,/);
 assert.match(edge,/storage_bucket:"crm-documents"/);
 assert.match(sql,/private\.crm_can_view_conversation\(m\.tenant_id,m\.conversation_id\)/);
 assert.match(sql,/crm_whatsapp_inbound_media_select/);
 assert.match(sql,/private\.crm_can_view_conversation\(a\.tenant_id,m\.conversation_id\)/);
 assert.match(sql,/crm_wa_media_attachment_idempotent/);
 assert.doesNotMatch(edge,/api\.ycloud\.com\/v2\/whatsapp\/messages/);
});

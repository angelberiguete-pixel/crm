import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync(new URL("../supabase/migrations/20261102070500_family_power_verified_whatsapp_name_capture.sql",import.meta.url),"utf8");
test("WhatsApp name capture is limited to signed provider receipts and Family Power",()=>{
 assert.match(sql,/t.slug='family-power'/);
 assert.match(sql,/meta_whatsapp_inbound_receipts/);
 assert.match(sql,/ycloud_whatsapp_inbound_receipts/);
 assert.match(sql,/r.external_message_id=new.external_message_id/);
 assert.match(sql,/cv.channel_id/);
 assert.match(sql,/new.direction <> 'inbound'/);
});
test("Never trusts profile name or writes other tenants or outbound messages",()=>{
 assert.match(sql,/me llamo\|mi nombre es/);
 assert.match(sql,/c.id=new.sender_contact_id and c.tenant_id=new.tenant_id/);
 assert.match(sql,/c.source='whatsapp'/);
 assert.match(sql,/revoke all on function/);
 assert.doesNotMatch(sql,/insert into public.messages/i);
});

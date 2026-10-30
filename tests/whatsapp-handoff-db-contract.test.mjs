import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
test("WhatsApp triage requires verified tenant receipts and cannot auto-send or create sales",()=>{
 const sql=readFileSync(new URL("../supabase/migrations/20261030210000_whatsapp_handoff_label_verified_only.sql",import.meta.url),"utf8");
 for(const s of [
   "meta_whatsapp_inbound_receipts","r.tenant_id=NEW.tenant_id",
   "r.phone_number_id=NEW.metadata->>'phone_number_id'",
   "c.id=NEW.conversation_id and c.tenant_id=NEW.tenant_id",
   "'handoff_auto_sent',false","'rule_based_not_ai'",
   "NEW.direction<>'inbound'","NEW.sender_type<>'contact'",
   "verify_quote_approval","transfer_to_human",
   "security invoker","create trigger whatsapp_triage_on_inbound_text"
 ]) assert.ok(sql.toLowerCase().includes(s.toLowerCase()),s);
 assert.doesNotMatch(sql,/(graph\.facebook\.com|openai\.com|https:\/\/|set assigned_to=|insert into public\.opportunities|insert into public\.messages)/i);
});

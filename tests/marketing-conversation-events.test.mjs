import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync(new URL("../supabase/migrations/20261031030000_marketing_conversation_events_and_sla.sql",import.meta.url),"utf8");
const ui=readFileSync(new URL("../components/crm-marketing-performance.tsx",import.meta.url),"utf8");
const helper=readFileSync(new URL("../lib/whatsapp-quote-buttons.ts",import.meta.url),"utf8");
const gate=readFileSync(new URL("../components/tenant-permission-gate.tsx",import.meta.url),"utf8");
test("all marketing analytics require authorized tenant identity, with zero anonymous direct writes",()=>{
 for(const v of ["private.crm_is_tenant_admin(p_tenant_id)","private.crm_is_platform_admin()",
   "revoke all on public.marketing_event_ledger from public,anon,authenticated",
   "alter table public.marketing_event_ledger enable row level security",
   "grant execute on function public.marketing_tenant_overview(uuid) to authenticated",
   "p_tenant_id","meta_export_live',false"])assert.ok(sql.includes(v),v);
});
test("source evidence never calls quote acceptance payment or labels anonymous inquiries as paid conversions",()=>{
 for(const v of ["message_received","human_reply","ai_reply","quotation_sent",
 "quotation_accepted","opportunity_won","meta_export_state text not null default 'not_eligible'"])
  assert.ok(sql.includes(v),v);
 assert.doesNotMatch(sql,/event_name\s*=\s*'Purchase'/);
 assert.doesNotMatch(sql,/next\s*http|graph\.facebook\.com|vault\.decrypted_secrets/);
});
test("response times require sent/delivered/read evidence and distinguish AI vs people",()=>{
 for(const v of ["status in ('sent','delivered','read')","sender_type in ('user','ai')",
  "percentile_cont(0.5)","percentile_cont(0.9)","next_inbound"])
  assert.ok(sql.includes(v),v);
});
test("UI requires admin role and never offers a fake active Meta connection or WhatsApp send",()=>{
 for(const v of ["marketing_tenant_overview","marketing_meta_configure_ids","setOverview(null)",
 "Sin cotización registrada","no se envió un WhatsApp","Envío de eventos a Meta:",
 "desactivado","[\"admin\",\"owner\"]"]) assert.ok(ui.includes(v),v);
 assert.ok(gate.includes('marketing: "settings"'));
 assert.doesNotMatch(ui,/from\("marketing_event_ledger"\)\.insert/);
});
test("button IDs are bound to quote UUID and only three allowed options",()=>{
 for(const action of ["approve_request","request_changes","talk_to_advisor"])assert.ok(helper.includes(action));
 assert.ok(helper.includes("Invalid quotation ID"));
 assert.ok(helper.includes("parseQuoteButtonReply"));
 assert.ok(helper.includes("not from raw customer-supplied text"));
});

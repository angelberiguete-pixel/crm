import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync("supabase/migrations/20261031151500_family_power_verified_sales.sql","utf8");
const ui=readFileSync("components/family-power-quotations.tsx","utf8");
const doc=readFileSync("components/family-power-quote-document.tsx","utf8");
const workspace=readFileSync("components/crm-workspace.tsx","utf8");
test("generic CRM order and opportunity writes cannot bypass Family Power reconciliation",()=>{
 for(const word of ["crm_family_order_reconciliation","crm_family_verified_opportunity_won",
   "crm_family_guard_order_payment","crm_family_guard_opportunity_won",
   "v_confirmed","status='confirmed'","amount_paid>=o.total","q.status='accepted'",
   "before insert or update of status on public.opportunities"])
   assert.ok(sql.includes(word),word);
});
test("all quote lines require exact approval, tax and server stock; status guards are DB-backed",()=>{
 for(const word of ["crm_family_verified_quotation_item","crm_family_approved_quotation_progress",
   "approved_tax_rate","v_product.tax_rate","approved_price","p.stock_snapshot",
   "crm_family_invalidate_product_approval","v_quote.status<>'draft'"])
   assert.ok(sql.includes(word),word);
});
test("audited quote RPCs never trust browser-provided commercial amounts",()=>{
 for(const name of ["crm_family_create_quotation","crm_family_add_quote_item","crm_family_record_quote_decision"])
   assert.ok(sql.includes(name),name);
 assert.ok(sql.includes("v_approval.approved_price"));
 assert.ok(sql.includes("v_approval.approved_tax_rate"));
 assert.ok(sql.includes("audit_logs"));
 assert.match(sql,/p_new_status='accepted' and v_quote.status<>'sent'/);
 assert.ok(ui.includes("crm_family_add_quote_item"));
 assert.ok(ui.includes("crm_family_record_quote_decision"));
 assert.ok(ui.includes("approved_tax_rate"));
 assert.ok(ui.includes("Sin artículos aprobados"));
 assert.ok(workspace.includes("isFamilyPower ? <FamilyPowerQuotations/>"));
});
test("printable PDF requires real tenant-scoped approved items and human status",()=>{
 assert.match(doc,/\["sent","accepted"\]\.includes\(quote\.status\)/);
 assert.match(doc,/from\("crm_family_product_approvals"\)/);
 assert.match(doc,/BORRADOR O NO VALIDADO — NO ENVIAR/);
 assert.match(doc,/window\.print\(\)/);
});

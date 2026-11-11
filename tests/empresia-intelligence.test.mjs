import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";

const read=(path)=>readFileSync(new URL(path,import.meta.url),"utf8");
const sql=read("../supabase/migrations/20261111124500_empresia_intelligence_core.sql");
const ui=read("../components/crm-intelligence-center.tsx");
const page=read("../app/crm/[[...slug]]/page.tsx");
const gate=read("../components/tenant-permission-gate.tsx");

test("core captures real CRM/ERP events with no fake leads or content copies",()=>{
 for(const entity of ["messages","contacts","opportunities","quotations","orders","deliveries","customer_payments"])
  assert.ok(sql.includes("on public."+entity),"Missing source trigger "+entity);
 for(const event of ["message.inbound","contact.created","opportunity.changed","quotation.changed","order.changed","delivery.changed","payment.changed"])
  assert.ok(sql.includes(event),"Missing event kind "+event);
 assert.ok(sql.includes("after insert or update on public.orders"));
 assert.ok(sql.includes("new.direction<>'inbound'"));
 assert.ok(!sql.includes("'message_body',new.body"));
 assert.ok(!sql.includes("'customer_phone',new.phone"));
 assert.ok(sql.includes("on conflict(tenant_id,event_key) do nothing"));
 assert.ok(sql.includes("unique(tenant_id,event_key)"));
});

test("brain decisions, observed outcomes and learning are tenant-scoped and protected",()=>{
 for(const entity of ["empresia_brain_events","empresia_brain_decisions","empresia_brain_outcomes"]){
  assert.ok(sql.includes("alter table public."+entity+" enable row level security"));
  assert.ok(sql.includes("revoke all on public."+entity+" from public,anon,authenticated"));
  assert.ok(sql.includes("grant select on public."+entity+" to authenticated"));
 }
 assert.ok(sql.includes("private.has_tenant_role(tenant_id,array['owner','admin','manager']::text[])"));
 assert.ok(sql.includes("private.crm_active_tenant_matches(tenant_id)"));
 assert.ok(sql.includes("foreign key (tenant_id,event_id)"));
 assert.ok(sql.includes("foreign key(tenant_id,decision_id)"));
 assert.ok(sql.includes("with (security_invoker=true)"));
 assert.ok(sql.includes("count(*) filter(where d.status='observed')"));
 assert.ok(sql.includes("'task_completed'"));
 assert.ok(!sql.includes("'sale_confirmed'"));
});

test("inverter example never trusts price before catalog evidence",()=>{
 assert.ok(sql.includes("inverter_36kw_price_not_verified"));
 assert.ok(sql.includes("p.sale_price>0 and p.metadata->>'price_verified'='true'"));
 assert.ok(sql.includes("'candidate_product_id',v_product_id"));
 assert.ok(sql.includes("'price_verified',v_product_verified"));
 assert.ok(sql.includes("'outbound_sent',false"));
 assert.ok(sql.includes("'quotation_issued',false"));
 assert.ok(!sql.includes("new.body,"));
});

test("only owner/admin can approve and execute a narrow internal task",()=>{
 assert.ok(sql.includes("private.has_tenant_role(p_tenant_id,array['owner','admin']::text[])"));
 assert.ok(sql.includes("private.crm_active_tenant_matches(p_tenant_id)"));
 assert.ok(sql.includes("if v_decision.status<>'approved' or v_decision.reviewed_by is null"));
 assert.ok(sql.includes("if v_title is null then raise exception 'action_not_supported'"));
 assert.ok(sql.includes("where tenant_id=p_tenant_id and id=p_decision_id for update"));
 assert.ok(sql.includes("source,metadata,created_by"));
 assert.ok(sql.includes("values("));
 assert.ok(sql.includes(" 'ai',pg_catalog.jsonb_build_object("));
 assert.ok(sql.includes("if not found then raise exception 'source_changed'"));
 assert.ok(sql.includes("return v_decision.task_id"));
 for(const dangerous of ["supabase.auth.admin","http_post(","fetch(","send_whatsapp","issue_invoice","transfer_funds"])
  assert.ok(!sql.includes(dangerous),"Forbidden side effect "+dangerous);
});

test("the real customer-facing center is routed and cannot bypass tenant permissions",()=>{
 assert.ok(page.includes('section === "intelligence"'));
 assert.ok(page.includes("<CrmIntelligenceCenter />"));
 assert.ok(gate.includes('intelligence: "dashboard"'));
 assert.ok(ui.includes('supabase.from("empresia_brain_decisions")'));
 assert.ok(ui.includes('.eq("tenant_id",id)'));
 assert.ok(ui.includes('supabase.rpc("empresia_brain_review"'));
 assert.ok(ui.includes('supabase.rpc("empresia_brain_execute_task"'));
 assert.ok(ui.includes('const canReview=["owner","admin"]'));
 assert.ok(ui.includes('status==="proposed"'));
 assert.ok(ui.includes('status==="approved"'));
 assert.ok(ui.includes('No se muestran datos simulados'));
 assert.ok(!ui.includes("service_role"));
});

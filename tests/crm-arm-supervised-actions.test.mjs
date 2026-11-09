import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");

const sql=read("supabase/migrations/20261109080000_crm_arm_supervised_interventions.sql");
const queue=read("components/crm-arm-action-queue.tsx");
const rpcGate=read("supabase/migrations/20261109081000_crm_arm_private_rpc_gate.sql");
const panel=read("components/crm-agent-advice-panel.tsx");

test("approval lifecycle uses explicit reviewed, executed and measured states",()=>{
 assert.match(sql,/check\(status in\s*\('proposed','approved','rejected','stale','executed','measured'\)\)/);
 for(const rpc of ["propose","review","execute","complete","measure"]){
  assert.match(sql,new RegExp("create or replace function public\\.crm_arm_"+rpc+"[a-z_]*\\("));
 }
 assert.match(sql,/approval_requires_owner_or_admin/);
 assert.match(sql,/if v_row\.status<>'proposed' then raise exception 'intervention_not_pending'/);
 assert.match(sql,/if v_row\.status<>'approved' then raise exception 'action_not_approved'/);
 assert.match(sql,/if v_task\.status='done' then return true/);
 assert.match(sql,/if not found or v_task\.status<>'done' or v_task\.completed_at is null/);
});

test("database RLS and RPCs limit access to each tenant, no direct writes",()=>{
 for(const table of ["crm_arm_interventions","crm_arm_intervention_events"]){
  assert.match(sql,new RegExp("alter table public\\."+table+" enable row level security"));
  assert.match(sql,new RegExp("revoke all on public\\."+table+" from public,anon,authenticated"));
  assert.match(sql,new RegExp("grant select on public\\."+table+" to authenticated"));
  assert.doesNotMatch(sql,new RegExp("grant (insert|update|delete) on public\\."+table+" to authenticated","i"));
 }
 assert.match(sql,/private\.has_tenant_access\(tenant_id\)/);
 assert.match(sql,/private\.crm_active_tenant_matches\(tenant_id\)/);
 assert.match(sql,/private\.has_tenant_role\(p_tenant_id,array\['owner','admin'\]::text\[\]\)/);
 assert.match(sql,/task_assignee_or_admin_required/);
 assert.match(sql,/v_actor is null/);
 assert.match(sql,/revoke all on function public\.crm_arm_execute_intervention\(uuid,uuid\) from public,anon,authenticated/);
 assert.match(sql,/grant execute on function public\.crm_arm_execute_intervention\(uuid,uuid\) to authenticated/);
});

test("execution is limited to an internal task and is idempotent",()=>{
 assert.match(sql,/on conflict \(tenant_id,opportunity_id,recommendation_key\)/);
 assert.match(sql,/where status in \('proposed','approved','executed'\)/);
 assert.match(sql,/if v_row\.status='executed' then return v_row\.task_id/);
 assert.match(sql,/v_advice\.recommendation_key is distinct from v_row\.recommendation_key/);
 assert.match(sql,/insert into public\.tasks\(/);
 assert.match(sql,/'todo',case when v_row\.recommendation_key/);
 assert.match(sql,/'manual',/);
 assert.match(sql,/jsonb_build_object\('kind','crm_arm_intervention','intervention_id',v_row\.id\)/);
 assert.doesNotMatch(sql,/http_post|net\.http|send_whatsapp|call_api|send_email|AI_EMPLOYEE_MODEL/i);
});

test("outcomes depend on CRM evidence, not user-supplied conversion labels",()=>{
 assert.match(sql,/when v_opp\.status='won' then 'won'/);
 assert.match(sql,/when v_opp\.status='lost' then 'lost'/);
 assert.match(sql,/v_now_position>v_row\.snapshot_stage_position then 'advanced'/);
 assert.match(sql,/now\(\)>=v_task\.completed_at\+interval '7 days' then 'no_progress_after_7d'/);
 assert.match(sql,/raise exception 'result_window_not_finished'/);
 assert.match(sql,/with \(security_invoker=true\)/);
 assert.match(sql,/count\(\*\) filter \(where observed_result in \('won','advanced'\)\)/);
 assert.doesNotMatch(sql,/p_success|p_observed_result|p_conversion/i);
});

test("privileged functions live in private schema behind invoker API wrappers",()=>{
 for(const name of ["crm_arm_propose_intervention","crm_arm_review_intervention",
   "crm_arm_execute_intervention","crm_arm_complete_intervention_task","crm_arm_measure_intervention"]){
  assert.ok(rpcGate.includes("alter function public."+name+"("));
  assert.ok(rpcGate.includes("create function public."+name+"("));
  assert.ok(rpcGate.includes("select private."+name+"("));
 }
 assert.match(rpcGate,/language sql security invoker set search_path=''/);
 assert.match(rpcGate,/revoke all on function public\\.crm_arm_execute_intervention\\(uuid,uuid\\) from public,anon,authenticated/);
 assert.match(rpcGate,/grant execute on function public\\.crm_arm_execute_intervention\\(uuid,uuid\\) to authenticated/);
});

test("user UI requires real click for proposal approval execution and measurement",()=>{
 for(const key of ["propose","approve","reject","execute","complete","measure"])assert.match(queue,new RegExp('act\\("'+key+'"'));
 assert.match(queue,/crm_arm_propose_intervention/);
 assert.match(queue,/crm_arm_review_intervention/);
 assert.match(queue,/crm_arm_execute_intervention/);
 assert.match(queue,/crm_arm_complete_intervention_task/);
 assert.match(queue,/crm_arm_measure_intervention/);
 assert.match(queue,/crm_arm_intervention_learning/);
 assert.match(queue,/crm_arm_intervention_events/);
 assert.match(queue,/x\.measured_count>=10/);
 assert.match(queue,/\.eq\("tenant_id",tenantId\)/);
 assert.match(panel,/CrmArmActionQueue tenantId=\{tenantId\}/);
});

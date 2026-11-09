import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {assessOpportunityQuality,describeJourney} from "../lib/crm-data-quality.ts";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const at=Date.parse("2026-11-09T02:00:00Z");
const valid={
 id:"deal-1",title:"Servicio técnico",status:"open",stage_id:"a",pipeline_id:"pipe",
 contact_id:"contact-1",company_id:null,owner_user_id:"user-1",
 next_action_at:"2026-11-10T12:00:00Z",last_activity_at:"2026-11-08T00:00:00Z",
 created_at:"2026-11-01T00:00:00Z",expected_close_date:"2026-11-22",
 actual_close_date:null,loss_reason:null,acquisition_source:"visita"
};
const stages=[{id:"a",pipeline_id:"pipe",stage_type:"open"},{id:"b",pipeline_id:"pipe",stage_type:"won"},{id:"c",pipeline_id:"pipe",stage_type:"lost"}];

test("complete, consistent opportunity is ready for commercial analysis",()=>{
 const a=assessOpportunityQuality(valid,stages,at);
 assert.deepEqual(a,{score:100,issues:[],readyForProbability:true});
});
test("stage/outcome mismatch blocks probability and is detected",()=>{
 const a=assessOpportunityQuality({...valid,status:"won"},stages,at);
 assert.ok(a.issues.some(x=>x.key==="stage_status_mismatch"&&x.blocking));
 assert.equal(a.readyForProbability,false);
});
test("missing identity blocks use; missing followup and activity reduce quality",()=>{
 const a=assessOpportunityQuality({...valid,contact_id:null,next_action_at:null,last_activity_at:null,owner_user_id:null},stages,at);
 assert.ok(a.issues.some(x=>x.key==="no_client"));
 assert.ok(a.issues.some(x=>x.key==="no_next_action"));
 assert.ok(a.issues.some(x=>x.key==="missing_activity"));
 assert.ok(a.issues.some(x=>x.key==="no_owner"));
 assert.equal(a.readyForProbability,false);
 assert.ok(a.score<=20);
});
test("closed losses must record outcome details; no fake historical transitions",()=>{
 const a=assessOpportunityQuality({...valid,status:"lost",stage_id:"c",loss_reason:null,actual_close_date:null},stages,at);
 assert.ok(a.issues.some(x=>x.key==="no_loss_reason"));
 assert.ok(a.issues.some(x=>x.key==="missing_close_date"));
 const legacy={
  id:"event",opportunity_id:"deal-1",event_type:"legacy_baseline",
  from_stage_name:null,to_stage_name:"Prospecto",from_status:null,to_status:"open",
  occurred_at:"2026-11-09T02:00:00Z",is_historical_baseline:true
 };
 assert.match(describeJourney(legacy),/no reconstruye cambios anteriores/);
 assert.equal(describeJourney({...legacy,event_type:"outcome_recorded",is_historical_baseline:false,to_status:"won"}),"Venta ganada");
});
test("the SQL uses immutable snapshots, transition triggers and tenant RLS",()=>{
 const m=read("supabase/migrations/20261109040500_crm_journey_quality_agent_readonly.sql");
 assert.match(m,/create table if not exists public.crm_opportunity_journey/);
 assert.match(m,/enable row level security/);
 assert.match(m,/revoke all on public.crm_opportunity_journey from public,anon,authenticated/);
 assert.match(m,/grant select on public.crm_opportunity_journey to authenticated/);
 assert.match(m,/private.has_tenant_access\(tenant_id\)/);
 assert.match(m,/private.crm_active_tenant_matches\(tenant_id\)/);
 assert.match(m,/after insert on public.opportunities/);
 assert.match(m,/after update of stage_id,pipeline_id,status on public.opportunities/);
 assert.match(m,/v_event:='created'/);
 assert.match(m,/when old.status='open' and new.status in \('won','lost'\)/);
 assert.match(m,/when old.status in \('won','lost'\) and new.status='open'/);
 assert.match(m,/legacy_baseline/);
 assert.match(m,/before update of tenant_id on public.opportunities/);
 assert.match(m,/Opportunity cannot be reassigned to another tenant/);
 assert.match(m,/with \(security_invoker=true\)/);
 assert.match(m,/revoke all on public.crm_arm_next_actions from public,anon,authenticated/);
 assert.match(m,/true as requires_human_approval/);
 assert.doesNotMatch(m,/grant (insert|update|delete) on public.crm_opportunity_journey to authenticated/i);
});
test("ML and human agent tools use scope, do not execute autonomously",()=>{
 const gate=read("components/tenant-permission-gate.tsx");
 assert.match(gate,/ml: "pipeline"/);
 const ui=read("components/crm-ml-governance.tsx");
 assert.match(ui,/\.eq\("tenant_id",tenantId\)/);
 assert.match(ui,/assessOpportunityQuality/);
 assert.match(ui,/describeJourney/);
 const agent=read("components/crm-agent-advice-panel.tsx");
 assert.match(agent,/from\("crm_arm_next_actions"\)/);
 assert.match(agent,/\.eq\("tenant_id",tenantId\)/);
 assert.match(agent,/requires_human_approval/);
 assert.doesNotMatch(agent,/sendWhatsapp|supabase\.functions\.invoke|\.insert\(|\.update\(/);
 for(const path of ["components/digital-employee-studio.tsx","components/family-power-arm-cockpit.tsx"]){
  assert.match(read(path),/CrmAgentAdvicePanel/);
 }
});

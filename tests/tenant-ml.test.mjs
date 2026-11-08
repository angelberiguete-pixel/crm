import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 salesSignals,quoteSignals,followupRisk,scoreMl,trainTenantModel
} from "../lib/tenant-ml.ts";

const fixtures={
 opp:{id:"opp-a",pipeline_id:"p1",stage_id:"s2",status:"open",created_at:"2026-10-01T00:00:00Z",
 owner_user_id:"seller-a",last_activity_at:"2026-11-07T00:00:00Z",next_action_at:"2026-11-01T00:00:00Z"},
 stages:[
 {id:"s1",pipeline_id:"p1",stage_type:"open",position:10},
 {id:"s2",pipeline_id:"p1",stage_type:"open",position:80},
 {id:"s3",pipeline_id:"p1",stage_type:"won",position:90}
 ],
 quote:{id:"q1",opportunity_id:"opp-a",created_at:"2026-10-20T00:00:00Z",status:"sent",valid_until:"2026-11-30"}
};
const now=Date.parse("2026-11-08T12:00:00Z");
test("sales features refer only to the chosen opportunity and current pipeline",()=>{
 const x=salesSignals(fixtures.opp,fixtures.stages,
  [{...fixtures.quote},{...fixtures.quote,id:"other",opportunity_id:"other"}],
  [{opportunity_id:"opp-a",status:"todo",due_at:"2026-11-02T00:00:00Z"},
   {opportunity_id:"other",status:"todo",due_at:"2026-11-02T00:00:00Z"}],now);
 assert.equal(x.stage,1);
 assert.equal(x.quotes,1/3);
 assert.equal(x.tasks,1/5);
 assert.equal(x.overdue,1/3);
 assert.equal(x.assigned,1);
 assert.ok(Object.values(x).every(v=>v>=0&&v<=1));
 assert.doesNotMatch(JSON.stringify(x),/seller-a|opp-a|p1|q1/);
});
test("quotations are separate capability and never share contact info",()=>{
 const f=quoteSignals(fixtures.quote,[{quotation_id:"q1"},{quotation_id:"other"}],now);
 assert.equal(f.items,.2);
 assert.equal(f.linked,1);
 assert.ok(f.expiry>0);
 assert.doesNotMatch(JSON.stringify(f),/q1|opp-a/);
});
test("follow-up risk uses actual due dates and activity",()=>{
 assert.deepEqual(followupRisk(fixtures.opp,now),{level:"alta",reason:"Próxima acción vencida"});
 const up={...fixtures.opp,next_action_at:null,last_activity_at:"2026-10-01T00:00:00Z"};
 assert.equal(followupRisk(up,now).level,"media");
});
test("ML abstains when dataset lacks positive and negative verified outcomes",()=>{
 assert.equal(trainTenantModel("sales_win",[]),null);
 const all=Array.from({length:150},(_,i)=>({
  capability:"sales_win",features:{stage:1,age:0,quotes:1,tasks:.5,overdue:0,assigned:1,freshness:1},
  positive:true,recorded_at:new Date(Date.UTC(2026,0,i+1)).toISOString()
 }));
 assert.equal(trainTenantModel("sales_win",all),null);
 assert.equal(scoreMl("sales_win",all[0].features,null).mode,"heuristic");
});
test("validated sale and quote models use chronological held-out examples",()=>{
 const rows=Array.from({length:120},(_,i)=>{
  const positive=i%2===0;
  const features={
   stage:positive?1:0,age:positive?.05:.95,quotes:positive?1:0,tasks:positive?1:0,
   overdue:positive?0:1,assigned:positive?1:0,freshness:positive?1:0
  };
  const quoteFeatures={age:positive?0:1,items:positive?1:0,linked:positive?1:0,expiry:positive?1:0};
  const recorded_at=new Date(Date.UTC(2026,0,i+1)).toISOString();
  return [
   {capability:"sales_win",features,positive,recorded_at},
   {capability:"quote_acceptance",features:quoteFeatures,positive,recorded_at}
  ];
 }).flat();
 for(const kind of ["sales_win","quote_acceptance"]){
  const model=trainTenantModel(kind,rows);
  assert.ok(model,kind+" should meet quality gate with separable synthetic outcomes");
  assert.equal(model.samples,120);
  assert.ok(model.auc>.9);
  const positive=rows.find(x=>x.capability===kind&&x.positive);
  const negative=rows.find(x=>x.capability===kind&&!x.positive);
  const high=scoreMl(kind,positive.features,model),low=scoreMl(kind,negative.features,model);
  assert.equal(high.mode,"validated_ml");
  assert.ok(high.score>low.score);
 }
});
test("training examples are private and originate only from DB outcome transitions",()=>{
 const sql=readFileSync(new URL("../supabase/migrations/20261108200000_crm_tenant_machine_learning.sql",import.meta.url),"utf8");
 assert.match(sql,/crm_ml_training_examples/);
 assert.match(sql,/primary key \(tenant_id,capability,entity_id\)/);
 assert.match(sql,/enable row level security/);
 assert.match(sql,/revoke all on public\.crm_ml_training_examples from public,anon,authenticated/);
 assert.match(sql,/private\.has_tenant_access\(tenant_id\)/);
 assert.match(sql,/private\.crm_active_tenant_matches\(tenant_id\)/);
 assert.match(sql,/if old\.status <> 'open' or new\.status not in \('won','lost'\)/);
 assert.match(sql,/new\.status not in \('accepted','rejected'\)/);
 assert.match(sql,/on conflict \(tenant_id,capability,entity_id\) do nothing/);
 assert.doesNotMatch(sql,/grant insert on public\.crm_ml_training_examples to authenticated/);
 const hub=readFileSync(new URL("../components/crm-ml-hub.tsx",import.meta.url),"utf8");
 assert.match(hub,/\.eq\("tenant_id",tenantId\)/);
 assert.match(hub,/trainTenantModel\("sales_win"/);
 assert.match(hub,/trainTenantModel\("quote_acceptance"/);
 assert.doesNotMatch(hub,/service_role/);
 const workspace=readFileSync(new URL("../components/crm-workspace.tsx",import.meta.url),"utf8");
 assert.match(workspace,/Inteligencia ML/);
 assert.match(workspace,/section === "ml"/);
});

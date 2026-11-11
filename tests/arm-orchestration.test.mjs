import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";
import ts from "typescript";
const source=readFileSync(new URL("../lib/arm-orchestration.ts",import.meta.url),"utf8");
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const exports={};new Function("exports",js)(exports);
const {createArmPlan,canExecuteArmStep}=exports;
const tenant="tenant_family_power_01",other="tenant_other_company_02";
test("quote requests coordinate reception, technical, sales and supervisor",()=>{
 const plan=createArmPlan(tenant,"event_quote_001","quote_request");
 assert.deepEqual(plan.steps.map(s=>s.role),["reception","technical","sales","supervisor"]);
});
test("cross-tenant execution is denied",()=>{
 const plan=createArmPlan(tenant,"event_quote_001","quote_request");
 assert.equal(canExecuteArmStep(plan,plan.steps[0],{authorizedTenantId:other,approvedActions:[]}),false);
});
test("sending quote requires explicit approval",()=>{
 const plan=createArmPlan(tenant,"event_quote_001","send_quote");
 const send=plan.steps.find(s=>s.action==="send_approved_quote");
 assert.equal(canExecuteArmStep(plan,send,{authorizedTenantId:tenant,approvedActions:[]}),false);
 assert.equal(canExecuteArmStep(plan,send,{authorizedTenantId:tenant,approvedActions:["send_approved_quote"]}),true);
});
test("unplanned action is denied",()=>{
 const plan=createArmPlan(tenant,"event_quote_001","new_inquiry");
 assert.equal(canExecuteArmStep(plan,{role:"communications",action:"send_approved_quote",requiresHumanApproval:false},{authorizedTenantId:tenant,approvedActions:[]}),false);
});
test("invalid event context is rejected",()=>assert.throws(()=>createArmPlan(tenant,"","follow_up")));

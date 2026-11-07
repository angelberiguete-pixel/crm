import test from "node:test";
import assert from "node:assert/strict";
import {canUseAutomationHub,validateAgentExecution} from "../lib/automation-hub/policy.ts";
const actor={userId:"u1",tenantId:"tenant-a",role:"operator",activeMembership:true};
const req={tenantId:"tenant-a",action:"agent.run",actor,enabled:true};
test("rejects disabled module and missing membership",()=>{
 assert.equal(canUseAutomationHub({...req,enabled:false}),false);
 assert.equal(canUseAutomationHub({...req,actor:{...actor,activeMembership:false}}),false);
 assert.equal(canUseAutomationHub({...req,actor:null}),false);
});
test("denies cross tenant and privileged actions",()=>{
 assert.equal(canUseAutomationHub({...req,tenantId:"tenant-b"}),false);
 assert.equal(canUseAutomationHub({...req,action:"connector.manage"}),false);
 assert.equal(canUseAutomationHub({...req,action:"run.approve"}),false);
 assert.equal(canUseAutomationHub({...req,action:"agent.run"}),true);
});
test("blocks unapproved or cross tenant execution",()=>{
 const run={tenantId:"tenant-a",agentId:"a1",input:"hello",maxInputChars:200,requiresApproval:true,approved:false};
 assert.equal(validateAgentExecution(req,run).reason,"approval_required");
 assert.equal(validateAgentExecution(req,{...run,approved:true,tenantId:"tenant-b"}).reason,"tenant_mismatch");
 assert.equal(validateAgentExecution(req,{...run,approved:true,input:"x".repeat(201)}).reason,"invalid_input");
 assert.equal(validateAgentExecution(req,{...run,approved:true}).reason,"eligible_only");
});

import test from "node:test";import assert from "node:assert/strict";
import {decideStaffSend,decideProviderApproval} from "../lib/commercial/quote-persistence-contract.ts";
const q={id:"q",tenant_id:"a",contact_id:"c",status:"draft",valid_until:"2099-01-01",total:100,currency:"DOP",metadata:{origin:"openreply",requires_human_review:true}};
const actor={userId:"u",tenantId:"a",role:"sales",active:true};
test("real schema supports revision zero",()=>assert.equal(decideStaffSend(q,actor,0,new Date("2026-11-05")).ok,true));
test("cross tenant denied",()=>assert.equal(decideStaffSend(q,{...actor,tenantId:"b"},0,new Date("2026-11-05")).reason,"unauthorized"));
test("revision mismatch denied",()=>assert.equal(decideStaffSend(q,actor,1,new Date("2026-11-05")).reason,"stale_revision"));
test("expired quote denied",()=>assert.equal(decideStaffSend({...q,valid_until:"2020-01-01"},actor,0,new Date("2026-11-05")).reason,"expired"));
test("Instagram event cannot approve",()=>assert.equal(decideProviderApproval().ok,false));

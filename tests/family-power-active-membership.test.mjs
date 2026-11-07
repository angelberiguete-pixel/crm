import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";
import ts from "typescript";

const source=readFileSync(new URL("../lib/family-power-access.ts",import.meta.url),"utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const exports={};
new Function("exports",compiled)(exports);
const {familyPowerMembership}=exports;
const id="12345678-1234-1234-1234-123456789012";
const member=(overrides={})=>({tenant_id:id,tenant_slug:"family-power",tenant_name:"Family Power",membership_role:"owner",is_active:true,...overrides});

test("active Family Power member can be selected",()=>assert.equal(familyPowerMembership([member()])?.tenant_id,id));
test("inactive Family Power member is rejected",()=>assert.equal(familyPowerMembership([member({is_active:false})]),null));
test("inactive record cannot shadow a later active record",()=>assert.equal(familyPowerMembership([member({is_active:false}),member({membership_role:"agent"})])?.membership_role,"agent"));
test("membership for another tenant is rejected",()=>assert.equal(familyPowerMembership([member({tenant_slug:"other"})]),null));
test("unknown role is rejected",()=>assert.equal(familyPowerMembership([member({membership_role:"superadmin"})]),null));

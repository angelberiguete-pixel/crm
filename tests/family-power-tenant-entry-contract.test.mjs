import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";
import ts from "typescript";

const source=readFileSync(new URL("../lib/family-power-access.ts",import.meta.url),"utf8");
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const exports={};
new Function("exports",js)(exports);
const {familyPowerMembership}=exports;
const tenant_id="12345678-1234-1234-1234-123456789012";
const member=(changes={})=>({tenant_id,tenant_slug:"family-power",tenant_name:"Family Power",membership_role:"owner",is_active:false,...changes});

test("Family Power membership can be selected before active tenant is set",()=>{
  assert.equal(familyPowerMembership([member()])?.tenant_id,tenant_id);
});
test("membership cannot cross tenants",()=>{
  assert.equal(familyPowerMembership([member({tenant_slug:"other"})]),null);
});
test("membership requires known role",()=>{
  assert.equal(familyPowerMembership([member({membership_role:"platform_admin"})]),null);
});
test("membership requires plausible tenant ID",()=>{
  assert.equal(familyPowerMembership([member({tenant_id:"bad"})]),null);
});
test("missing membership is denied",()=>{
  assert.equal(familyPowerMembership([]),null);
});

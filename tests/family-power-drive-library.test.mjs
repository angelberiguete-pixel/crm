import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const route=readFileSync("app/api/family-power/evidence/route.ts","utf8");
const gallery=readFileSync("components/family-power-evidence-library.tsx","utf8");
const workspace=readFileSync("components/crm-workspace.tsx","utf8");
const brand=readFileSync("components/tenant-brand-provider.tsx","utf8");
const gate=readFileSync("components/tenant-permission-gate.tsx","utf8");
test("Only verified Family Power owners and admins may receive Drive references",()=>{
 assert.match(route,/supabase\.auth\.getUser\(token\)/);
 assert.match(route,/supabase\.rpc\("list_my_tenants"\)/);
 assert.match(route,/tenant\.tenant_slug==="family-power"/);
 assert.match(route,/\["owner","admin"\]/);
 assert.match(route,/Cache-Control":"private, no-store"/);
 assert.doesNotMatch(route,/SERVICE_ROLE|service_role/);
});
test("Drive reference documents are clearly separated from sellable inventory",()=>{
 assert.match(gallery,/NO|no son productos/);
 assert.match(gallery,/Todavía no son productos/);
 assert.match(gallery,/No enviar como ficha técnica oficial/);
 assert.match(workspace,/<FamilyPowerEvidenceLibrary\/>/);
 assert.match(route,/isDrivePreview:true/);
 assert.equal((route.match(/filename:"1000080\d+\.jpg"/g)||[]).length,5);
});
test("Family Power login intent redirects expired sessions back to branded login without authorizing access",()=>{
 assert.match(brand,/sessionStorage\.setItem\("crm:login-intent","family-power"\)/);
 assert.match(gate,/branded\?"\/family-power\/login":"\/login"/);
 assert.match(gate,/tenant_current_permissions/);
});

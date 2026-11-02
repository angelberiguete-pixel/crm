import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("Look owner can search complete existing prospect collection with server pagination",()=>{
 const desk=read("components/arm-agency-sales-desk.tsx");
 assert.match(desk,/tenantSlug!=="eurevector"/);
 assert.match(desk,/\.from\("agency_prospects"\)/);
 assert.match(desk,/\{count:"exact"\}/);
 assert.match(desk,/\.range\(page\*25,page\*25\+24\)/);
 assert.match(desk,/\.ilike\(appliedSearchBy,"%"\+safe\+"%"\)/);
 assert.match(desk,/\.eq\("stage",stageFilter\)/);
 assert.match(desk,/setPage\(n=>n\+1\)/);
 assert.match(desk,/setPage\(n=>Math\.max\(0,n-1\)\)/);
 assert.match(desk,/option value="phone"/);
 assert.match(desk,/option value="email"/);
 assert.match(desk,/option value="decision_maker"/);
 assert.doesNotMatch(desk,/\.from\("agency_prospects"\)\.insert\(/);
});

test("self-service prospect profile only edits private agency-owned fields under RLS",()=>{
 const profile=read("components/arm-agency-prospect-profile.tsx");
 const desk=read("components/arm-agency-sales-desk.tsx");
 assert.match(desk,/ArmAgencyProspectProfile key=\{tenantId\+":"\+selected\.id\}/);
 assert.match(profile,/if\(tenantSlug!=="eurevector"\)return null/);
 assert.match(profile,/supabase\.rpc\("platform_current_access"\)/);
 assert.match(profile,/\.is_platform_admin!==true/);
 assert.match(profile,/\.from\("agency_prospects"\)/);
 assert.match(profile,/\.eq\("id",prospectId\)\.eq\("updated_at",profile\.updated_at\)/);
 assert.match(profile,/const fieldNames=\["decision_maker","service_interest","priority","notes","website"\]/);
 assert.match(profile,/const differences=fieldNames\.filter/);
 assert.doesNotMatch(profile,/\.from\("contacts"\)\.update\(|\.from\("agency_prospects"\)\.insert\(|\.from\("tenants"\)\.update\(/);
 assert.match(profile,/El teléfono y correo se administran desde el contacto compartido en el CRM/);
});

test("profile updates are auditable and disclose partial audit failures",()=>{
 const profile=read("components/arm-agency-prospect-profile.tsx");
 assert.match(profile,/\.from\("agency_prospect_activities"\)\.insert\(/);
 assert.match(profile,/activity_type:"note"/);
 assert.match(profile,/prospect_id:prospectId/);
 assert.match(profile,/audit\.error\|\|!audit\.data\?\.id/);
 assert.match(profile,/Los cambios se guardaron, pero el historial no confirmó/);
 assert.match(profile,/\.eq\("prospect_id",prospectId\)\.order\("occurred_at"/);
 assert.match(profile,/\.limit\(30\)/);
 assert.doesNotMatch(profile,/service_role|NEXT_PUBLIC_SERVICE_ROLE|functions\.invoke|whatsapp-test-send|fetch\(/);
});

test("read/write controls are protected against stale company and selection data",()=>{
 const profile=read("components/arm-agency-prospect-profile.tsx");
 const desk=read("components/arm-agency-sales-desk.tsx");
 assert.match(profile,/profile\.id!==prospectId/);
 assert.match(desk,/key=\{tenantId\+":"\+selected\.id\}/);
 assert.match(profile,/onSaved\?\.\(prospectId,patch\)/);
 assert.match(desk,/fields\.decision_maker===undefined\?p\.decision_maker:fields\.decision_maker/);
});

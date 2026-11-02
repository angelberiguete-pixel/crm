import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("Family Power integrations have a concise tenant-specific view with real status and no provider secrets",()=>{
 const ui=read("components/crm-integration-center.tsx");
 const css=read("components/crm-integration-center.module.css");
 assert.match(ui,/tenant.tenant_slug==="family-power"/);
 assert.match(ui,/styles\.familyCompact/);
 assert.match(ui,/integrationState\(kind,health,requests\)/);
 assert.match(ui,/tenant_register_channel_request/);
 assert.match(ui,/health\?\.ai_spending_blocked/);
 assert.match(ui,/Solo registra una solicitud/);
 assert.match(css,/\.familyCompact \.compactGrid/);
 assert.match(css,/@media\(max-width:660px\)/);
 assert.doesNotMatch(ui,/type="password"|name="api_key"|name="access_token"/);
});
test("Family Power digital staff shows only existing configurable agent and future roles as pending",()=>{
 const ui=read("components/digital-employee-studio.tsx");
 for(const key of ["recepcion","ventas","tecnico","seguimiento","supervision"]){
   assert.match(ui,new RegExp('key:"'+key+'"'));
 }
 assert.match(ui,/tenant.tenant_slug==="family-power"/);
 assert.match(ui,/selectedId&&active&&<section/);
 assert.match(ui,/<details><summary/);
 assert.match(ui,/getArmAgent\(item\)/);
 assert.match(ui,/editable&&<button/);
 assert.match(ui,/DigitalEmployeeReviewQueue tenantId=\{tenantId\} compact/);
 assert.match(ui,/setSelectedId\(null\)/);
});
test("review queue supports concise mode without removing human authorization",()=>{
 const queue=read("components/digital-employee-review-queue.tsx");
 assert.match(queue,/compact=false/);
 assert.match(queue,/!compact&&<div className="notice">/);
 assert.match(queue,/ai_agent_reviews/);
 assert.match(queue,/decision==="approved"/);
 assert.match(queue,/reviewed_by:auth\.data\.user\.id/);
 const cockpit=read("components/family-power-arm-cockpit.tsx");
 assert.match(cockpit,/DigitalEmployeeReviewQueue tenantId=\{tenantId\} compact/);
});

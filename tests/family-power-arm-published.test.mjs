import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL(p,import.meta.url),"utf8");
test("ARM keeps a specialized Family Power cockpit inside the shared platform",()=>{
 const page=read("../app/crm/[[...slug]]/page.tsx");
 const gate=read("../components/tenant-permission-gate.tsx");
 const cockpit=read("../components/family-power-arm-cockpit.tsx");
 assert.match(page,/section === "arm"/);
 assert.match(page,/ArmWorkspace/);
 const shared=read("../components/arm-workspace.tsx");
 assert.match(shared,/FamilyPowerArmCockpit/);
 assert.match(gate,/arm: "dashboard"/);
 assert.match(gate,/const familyOnlySections=\["tasks","reports"\]/);
 assert.match(cockpit,/tenant\?\.tenant_slug==="family-power"/);
 assert.match(cockpit,/Centro de operaciones inteligentes/);
 assert.doesNotMatch(cockpit,/rltnmstwqorxtoeqsbgh|service_role|META_WA_ACCESS_TOKEN|sendMessage\(/);
});
test("ARM links remain for Family Power and general tenants",()=>{
 const dashboard=read("../components/energy-service-dashboard.tsx");
 const mobile=read("../components/mobile-tenant-navigation.tsx");
 const workspace=read("../components/crm-workspace.tsx");
 assert.match(dashboard,/href="\/crm\/arm"/);
 assert.match(mobile,/tenant.tenant_slug!=="family-power"&&\["tasks","reports"\]\.includes\(path\)/);
 assert.match(workspace,/!isFamilyPower&&\["tasks","reports"\]\.includes\(key\)/);
 assert.match(workspace,/arm:"dashboard"/);
});
test("ARM reads only tenant-scoped production tables and displays honest agent state",()=>{
 const cockpit=read("../components/family-power-arm-cockpit.tsx");
 for(const t of ["ai_agents","ai_agent_runs","contacts","opportunities","quotations"]) {
   assert.ok(cockpit.includes('from("'+t+'")'));
 }
 assert.equal((cockpit.match(/\.eq\("tenant_id",tenantId\)/g)||[]).length,5);
 for(const role of ["recepcion","ventas","tecnico","seguimiento","supervision"])assert.ok(cockpit.includes('key:"'+role+'"'));
 assert.match(cockpit,/Pendiente de configuración/);
 assert.match(cockpit,/Revisión humana/);
 assert.doesNotMatch(cockpit,/\.insert\(|\.update\(|\.delete\(|\.invoke\(/);
});

import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL(p,import.meta.url),"utf8");
test("ARM remains a Family Power-only route inside the published shared CRM",()=>{
 const page=read("../app/crm/[[...slug]]/page.tsx");
 const gate=read("../components/tenant-permission-gate.tsx");
 const cockpit=read("../components/family-power-arm-cockpit.tsx");
 assert.match(page,/section === "arm"/);
 assert.match(page,/FamilyPowerArmCockpit/);
 assert.match(gate,/arm: "dashboard"/);
 assert.match(gate,/familyOnlySections\.includes\(section\)&&activeTenant.tenant_slug!=="family-power"/);
 assert.match(cockpit,/tenant\?\.tenant_slug==="family-power"/);
 assert.match(cockpit,/Entrar al CRM/);
 assert.match(cockpit,/href="\/crm"/);
 assert.doesNotMatch(cockpit,/Equipo digital|Pendiente de configuración|Configurado como borrador/);
 assert.doesNotMatch(cockpit,/rltnmstwqorxtoeqsbgh|service_role|META_WA_ACCESS_TOKEN|sendMessage\(/);
});
test("ARM links from Family Power dashboard and mobile menu, never other tenants",()=>{
 const dashboard=read("../components/energy-service-dashboard.tsx");
 const mobile=read("../components/mobile-tenant-navigation.tsx");
 const workspace=read("../components/crm-workspace.tsx");
 assert.match(dashboard,/href="\/crm\/arm"/);
 assert.match(mobile,/tenant.tenant_slug!=="family-power"&&\["arm","tasks","reports"\]\.includes\(path\)/);
 assert.match(workspace,/!isFamilyPower&&\["arm","tasks","reports"\]\.includes\(key\)/);
 assert.match(workspace,/arm:"dashboard"/);
});
test("ARM reads tenant-scoped metrics and keeps functional approval queue without decorative agent cards",()=>{
 const cockpit=read("../components/family-power-arm-cockpit.tsx");
 for(const t of ["ai_agent_runs","contacts","opportunities","quotations"]) {
   assert.ok(cockpit.includes('from("'+t+'")'));
 }
 assert.equal((cockpit.match(/\.eq\("tenant_id",tenantId\)/g)||[]).length,4);
 assert.doesNotMatch(cockpit,/roles\.map|findAgent|from\("ai_agents"\)/);
 assert.match(cockpit,/Panel principal/);
 assert.match(cockpit,/href="\/crm\/employees"/);
 assert.match(cockpit,/Revisión humana/);
 assert.doesNotMatch(cockpit,/\.insert\(|\.update\(|\.delete\(|\.invoke\(/);
});

test("Family Power dashboard has an explicit commercial CRM shortcut",()=>{
 const dashboard=read("../components/energy-service-dashboard.tsx");
 assert.match(dashboard,/Abrir gestión comercial/);
 assert.match(dashboard,/href="\/crm\/revenue"/);
 assert.doesNotMatch(dashboard,/Clientes, ventas y equipo digital/);
});

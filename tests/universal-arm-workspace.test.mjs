import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("ARM stays tenant-scoped and fails closed when no authorized tenant exists",()=>{
 const arm=read("components/arm-workspace.tsx");
 const page=read("app/crm/[[...slug]]/page.tsx");
 const gate=read("components/tenant-permission-gate.tsx");
 assert.match(page,/section === "arm"/);
 assert.match(page,/ArmWorkspace/);
 assert.match(gate,/arm: "dashboard"/);
 assert.match(gate,/const familyOnlySections=\["tasks","reports"\]/);
 assert.match(arm,/const tenantId=tenant\?\.tenant_id\?\?null/);
 assert.match(arm,/if\(!tenantId\)return/);
 assert.match(arm,/if\(isFamily\)return <FamilyPowerArmCockpit\/>/);
 for(const table of ["contacts","opportunities","quotations","conversations","tasks","automation_rules","ai_agents","ai_agent_runs"])
  assert.ok(arm.includes('from("'+table+'")'),"Missing "+table);
 assert.equal((arm.match(/\.eq\("tenant_id",tenantId\)/g)||[]).length,9);
 assert.doesNotMatch(arm,/\.insert\(|\.update\(|\.delete\(|\.invoke\(|service_role/);
});

test("ARM shows verified records rather than assuming integration or collections",()=>{
 const arm=read("components/arm-workspace.tsx");
 assert.match(arm,/result\.error\?null:result\.count\?\?0/);
 assert.match(arm,/no necesariamente activos/);
 assert.match(arm,/no cobros/);
 assert.match(arm,/Borrador/);
 assert.match(arm,/Las? ejecuciones? registradas|Ejecuciones registradas/);
 const dashboard=read("components/crm-commercial-dashboard.tsx");
 const mobile=read("components/mobile-tenant-navigation.tsx");
 const workspace=read("components/crm-workspace.tsx");
 assert.match(dashboard,/href="\/crm\/arm"/);
 assert.match(mobile,/\["arm", "Centro ARM"\]/);
 assert.match(workspace,/\["arm", "Centro ARM", Bot\]/);
 assert.doesNotMatch(workspace,/!isFamilyPower&&\["arm","tasks","reports"\]/);
});

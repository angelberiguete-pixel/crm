import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("pending agent expansion stays draft-only, no services or permissions activated",()=>{
 const sql=read("docs/family-power/arm-draft-profiles-pending-quota.sql");
 const cockpit=read("components/family-power-arm-cockpit.tsx");
 for(const role of ["ventas","tecnico","seguimiento","supervision"])assert.ok(sql.includes("'"+role+"'"));
 assert.match(sql,/t.slug='family-power'/);
 assert.match(sql,/and not exists/);
 assert.match(sql,/'draft','unconfigured','not-connected'/);
 assert.match(sql,/'human_approval','\[\]'::jsonb/);
 assert.match(cockpit,/settings.arm_role===key/);
 assert.doesNotMatch(sql,/send_whatsapp|execute_http|service_role|insert into public\.contacts/i);
});
test("specialized ARM drafts cannot be accidentally recast as reception agent",()=>{
 const ui=read("components/digital-employee-studio.tsx");
 assert.match(ui,/\["tecnico","seguimiento","supervision"\]\.includes/);
 assert.match(ui,/setSelectedId\(null\)/);
});

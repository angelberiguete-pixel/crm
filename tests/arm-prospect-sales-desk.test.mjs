import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("ARM agency action form is owner-only, reuse RPC and avoids duplicating imported leads",()=>{
 const sales=read("components/arm-agency-sales-desk.tsx");
 const board=read("components/arm-operational-board.tsx");
 assert.match(board,/state\.showAgency&&<ArmAgencySalesDesk tenantId=\{tenantId\} tenantSlug=\{tenantSlug\}/);
 assert.match(board,/tenantSlug==="eurevector"/);
 assert.match(board,/platform_current_access/);
 assert.match(board,/\.is_platform_admin===true/);
 assert.match(sales,/if\(tenantSlug!=="eurevector"\)return null/);
 assert.match(sales,/platform_current_access/);
 assert.match(sales,/supabase\.rpc\("agency_record_prospect_touch"/);
 assert.match(sales,/p_prospect_id:selected\.id/);
 assert.match(sales,/p_activity_type:backendType/);
 assert.match(sales,/p_stage:stage===selected\.stage\?null:stage/);
 assert.doesNotMatch(sales,/\.from\("agency_prospects"\)\.insert\(|\.from\("opportunities"\)\.insert\(/);
 assert.doesNotMatch(sales,/\.invoke\(|fetch\(|service_role|NEXT_PUBLIC_SERVICE_ROLE|whatsapp-test-send/);
});

test("existing CRM opportunity is joined by exact provenance, active tenant and updated with RLS",()=>{
 const sales=read("components/arm-agency-sales-desk.tsx");
 assert.match(sales,/\.contains\("metadata",\{agency_prospect_id:selectedId\}\)/);
 assert.match(sales,/\.eq\("tenant_id",tenantId\)/);
 assert.match(sales,/\.limit\(2\)/);
 assert.match(sales,/opportunities\.length!==1/);
 assert.match(sales,/linked\?\.status!=="open"/);
 assert.match(sales,/\.from\("opportunities"\)/);
 assert.match(sales,/\.eq\("id",linked\.id\)\.eq\("status","open"\)/);
 assert.match(sales,/\.contains\("metadata",\{agency_prospect_id:selected\.id\}\)\.select\("id"\)/);
 assert.match(sales,/patch\.data\?\.length!==1/);
 assert.match(sales,/separate RLS-controlled write/);
 assert.match(sales,/\/crm\/revenue\?contactId=/);
});

test("call and meeting semantics require explicit operator action and accurate scheduling",()=>{
 const sales=read("components/arm-agency-sales-desk.tsx");
 assert.match(sales,/value:"call",label:"Llamada ya realizada"/);
 assert.match(sales,/value:"meeting",label:"Reunión ya realizada"/);
 assert.match(sales,/value:"scheduled_meeting",label:"Programar una reunión futura"/);
 assert.match(sales,/const backendType=planned\?"task":kind/);
 assert.match(sales,/if\(planned&&!nextAction\.trim\(\)\)/);
 assert.match(sales,/if\(action&&!nextDate\)/);
 assert.match(sales,/if\(planned&&new Date\(nextDate\)\.getTime\(\)<=Date\.now\(\)\)/);
 assert.match(sales,/\(r\.data as \{prospect_id\?:string\}\|null\)\?\.prospect_id!==selected\.id/); // server-confirmed prospect
 assert.match(sales,/no se marca la reunión como realizada/i);
});

test("stale cross-tenant metrics and operational queues are hidden on company switch",()=>{
 const arm=read("components/arm-workspace.tsx");
 assert.match(arm,/type Dashboard=\{tenantId:string\|null/);
 assert.match(arm,/dashboard\.tenantId!==tenantId/);
 assert.match(arm,/ArmOperationalBoard key=\{tenantId\}/);
 assert.match(arm,/dashboard\.tenantId===tenantId\?dashboard\.agents:\[\]/);
});

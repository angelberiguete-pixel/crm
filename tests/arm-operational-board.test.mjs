import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("ARM operational queue only queries active tenant records and checks modules",()=>{
 const board=source("components/arm-operational-board.tsx");
 const arm=source("components/arm-workspace.tsx");
 assert.match(arm,/ArmOperationalBoard key=\{tenantId\} tenantId=\{tenantId\}/);
 assert.match(board,/tenant_current_permissions/);
 assert.match(board,/tenant_effective_modules/);
 assert.match(board,/operationsAllowed=allowed\("operations"\)/);
 assert.match(board,/pipelineAllowed=allowed\("pipeline"\)/);
 assert.ok((board.match(/\.eq\("tenant_id",tenantId\)/g)||[]).length>=6);
 assert.match(board,/\.in\("status",\["todo","in_progress"\]\)/);
 assert.match(board,/\.eq\("status","open"\)/);
 assert.match(board,/result\.error/);
});

test("Only platform owner in Look Social Media is shown agency acquisition records",()=>{
 const board=source("components/arm-operational-board.tsx");
 assert.match(board,/tenantSlug==="eurevector"/);
 assert.match(board,/platform_current_access/);
 assert.match(board,/\.is_platform_admin===true/);
 assert.match(board,/showAgency\?await Promise\.all/);
 assert.match(board,/state\.showAgency&&<article/);
 assert.match(board,/href="\/agency"/);
 assert.doesNotMatch(board,/NEXT_PUBLIC_SERVICE_ROLE|service_role|sendMessage\(|whatsapp-test-send|ycloud-whatsapp-send/);
});

test("ARM task creation and completion are tenant-scoped and require operating role",()=>{
 const board=source("components/arm-operational-board.tsx");
 const arm=source("components/arm-workspace.tsx");
 assert.match(board,/const canManageTasks=\["owner","admin","manager"\]\.includes\(memberRole\)/);
 assert.match(board,/if\(!state\.operationsAllowed\|\|!canManageTasks\|\|busyTask\)return/);
 assert.match(board,/\.from\("tasks"\)\.insert\(/);
 assert.match(board,/status:"todo",priority:"normal",source:"manual"/);
 assert.match(board,/status:"done",completed_at:new Date\(\)\.toISOString\(\)/);
 assert.match(board,/\.eq\("tenant_id",tenantId\)\.eq\("id",taskId\)/);
 assert.match(board,/result\.data\?\.length!==1/);
 assert.match(arm,/memberRole=\{tenant\?\.membership_role\?\?""\}/);
 assert.doesNotMatch(board,/\.delete\(|\.invoke\(|fetch\(/);
});

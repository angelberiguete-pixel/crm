import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");

test("Task alerts are available in the shared authorized header and are tenant scoped",()=>{
 const alerts=read("components/family-power-task-alerts.tsx");
 const gate=read("components/tenant-permission-gate.tsx");
 assert.match(gate,/<FamilyPowerTaskAlerts\/>/);
 assert.match(alerts,/tenant\?\.tenant_slug==="family-power"/);
 assert.match(alerts,/tenant_current_permissions/);
 assert.match(alerts,/tenant_effective_modules/);
 assert.match(alerts,/\.eq\("tenant_id",tenantId\)/);
 assert.match(alerts,/\.in\("status",pendingStatuses\)/);
 assert.match(alerts,/count:"exact"/);
 assert.match(alerts,/family-power:tasks-updated/);
 assert.match(alerts,/aria-expanded=\{open\}/);
 assert.match(alerts,/href="\/crm\/tasks"/);
 assert.doesNotMatch(alerts,/service_role|\.insert\(|\.update\(|\.delete\(/);
});
test("Completing Family Power tasks requires a human verification note and session",()=>{
 const tasks=read("components/family-power-tasks.tsx");
 const sql=read("supabase/migrations/20261102061040_family_power_task_alerts_ai_followup_guard.sql");
 assert.match(tasks,/verification.trim\(\)\.length<12/);
 assert.match(tasks,/supabase.auth.getUser\(\)/);
 assert.match(tasks,/completion_evidence:evidence/);
 assert.match(tasks,/\.select\("id"\)\.maybeSingle\(\)/);
 assert.match(sql,/auth.uid\(\)/);
 assert.match(sql,/family_power_completion_requires_human_evidence/);
 assert.match(sql,/new.status='done' and old.status is distinct from 'done'/);
 assert.match(sql,/jsonb_build_object\([\s\S]*'verified_by',v_user::text/);
});
test("AI draft recommendations create only internal, deduplicated human tasks",()=>{
 const sql=read("supabase/migrations/20261102061040_family_power_task_alerts_ai_followup_guard.sql");
 const draft=read("supabase/functions/ai-employee-draft/index.ts");
 assert.match(sql,/new.status <> 'awaiting_approval'/);
 assert.match(sql,/new.output->'requires_human' is distinct from 'true'::jsonb/);
 assert.match(sql,/t.slug='family-power'/);
 assert.match(sql,/new.tenant_id/);
 assert.match(sql,/on conflict do nothing/);
 assert.match(sql,/tasks_family_power_ai_run_once/);
 assert.match(sql,/'todo','normal','ai'/);
 assert.doesNotMatch(sql,/send_whatsapp|send_email|http_post|UPDATE public.tasks SET status='done'/i);
 assert.match(draft,/approval_mode!=="human_approval"/);
 assert.match(draft,/review_required:true/);
});

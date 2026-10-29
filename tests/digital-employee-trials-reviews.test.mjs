import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const migration=readFileSync(new URL("../supabase/migrations/20261028235000_ai_employee_atomic_trials_and_reviews.sql",import.meta.url),"utf8");
const worker=readFileSync(new URL("../supabase/functions/ai-employee-draft/index.ts",import.meta.url),"utf8");
const queue=readFileSync(new URL("../components/digital-employee-review-queue.tsx",import.meta.url),"utf8");
const studio=readFileSync(new URL("../components/digital-employee-studio.tsx",import.meta.url),"utf8");

test("paid AI trials reserve usage atomically per tenant before calling the provider",()=>{
 assert.match(migration,/primary key \(tenant_id,usage_day\)/i);
 assert.match(migration,/on conflict \(tenant_id,usage_day\) do update/i);
 assert.match(migration,/where q.used_count<20/i);
 assert.match(migration,/insert into public\.ai_agent_runs/i);
 assert.match(migration,/security invoker/i);
 assert.match(migration,/grant execute on function public\.reserve_ai_employee_trial.*to service_role;/i);
 assert.match(worker,/service\.rpc\("reserve_ai_employee_trial"/);
 assert.doesNotMatch(worker,/soft quota for sandbox/i);
 assert.ok(worker.indexOf('service.rpc("reserve_ai_employee_trial"')<worker.indexOf('fetch("https://api.openai.com/v1/responses"'));
});

test("review ledger is tenant-scoped, append-only and restricted to authorized humans",()=>{
 assert.match(migration,/create table if not exists public\.ai_agent_reviews/i);
 assert.match(migration,/unique\(tenant_id,run_id\)/i);
 assert.match(migration,/foreign key \(tenant_id,run_id\)/i);
 assert.match(migration,/alter table public\.ai_agent_reviews enable row level security/i);
 assert.match(migration,/grant select,insert on public\.ai_agent_reviews to authenticated/i);
 assert.doesNotMatch(migration,/grant (update|delete) on public\.ai_agent_reviews to authenticated/i);
 assert.match(migration,/private\.is_tenant_admin\(tenant_id\)/i);
 assert.match(migration,/reviewed_by = \(select auth\.uid\(\)\)/i);
 assert.match(migration,/r\.status='awaiting_approval'/i);
 assert.match(queue,/Aprobar no envía mensajes/);
 assert.match(queue,/supabase\.from\("ai_agent_reviews"\)\.insert/);
 assert.match(queue,/tenantRef\.current!==forTenant/);
 assert.doesNotMatch(queue,/send_whatsapp|\/messages"|fetch\("https:\/\/graph/i);
});

test("all four employees are configured by business and only produce human-reviewed drafts",()=>{
 for(const role of ['value="recepcionista"','value="vendedor"','value="secretaria"','value="cobros"'])assert.ok(studio.includes(role),role);
 assert.match(studio,/approval_mode:"human_approval"/);
 assert.match(studio,/status:"draft"/);
 assert.match(studio,/allowed_tools:\[\]/);
 assert.match(studio,/DigitalEmployeeReviewQueue/);
 assert.match(worker,/status:"awaiting_approval"/);
 assert.match(worker,/store:false/);
});

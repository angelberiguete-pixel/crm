import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const ui=readFileSync(new URL("../components/digital-employee-studio.tsx",import.meta.url),"utf8");
const gateway=readFileSync(new URL("../supabase/functions/ai-employee-draft/index.ts",import.meta.url),"utf8");
const guard=readFileSync(new URL("../lib/digital-employee.ts",import.meta.url),"utf8");

test("Family Power ARM exposes its own controlled OpenAI laboratory",()=>{
 const start=ui.indexOf('if(tenant.tenant_slug==="family-power")');
 const end=ui.indexOf('return <main className="content" style={{maxWidth:1300',start);
 assert.ok(start>=0&&end>start,"family branch exists");
 const panel=ui.slice(start,end);
 assert.match(panel,/Probar respuesta con OpenAI/);
 assert.match(panel,/onSubmit=\{generate\}/);
 assert.match(panel,/value=\{sample\}/);
 assert.match(panel,/validateEmployeeKnowledge\(active\.settings\?\.knowledge\)/);
 assert.match(panel,/disabled=\{testing\|\|busy\|\|!readiness\?\.ready_for_trial\|\|!!validateEmployeeKnowledge\(active\.settings\?\.knowledge\)/);
 assert.match(panel,/DigitalEmployeeReviewQueue tenantId=\{tenantId\} compact/);
 assert.match(panel,/No contacta clientes ni envía WhatsApp/);
 assert.doesNotMatch(panel,/signInWithPassword|service_role|OPENAI_API_KEY/);
});

test("The Family Power test uses the existing authenticated Supabase gateway, never frontend API secrets",()=>{
 assert.match(ui,/supabase\.functions\.invoke\("ai-employee-draft"/);
 assert.match(ui,/tenant_id:tenantId,agent_id:selectedId,request_id:crypto\.randomUUID\(\),question:sample\.trim\(\)/);
 assert.match(gateway,/membership_role/);
 assert.match(gateway,/tenant_owner_required/);
 assert.match(gateway,/model_provider!=="openai"/);
 assert.match(gateway,/approval_mode!=="human_approval"/);
 assert.match(gateway,/agent_not_in_safe_draft_mode/);
 assert.match(gateway,/status:"awaiting_approval"/);
 assert.match(gateway,/review_required:true/);
 assert.match(guard,/if\(v\.services\.length<5\)return "services_required"/);
});

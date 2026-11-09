import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const edge=readFileSync(new URL("../supabase/functions/ai-employee-readiness/index.ts",import.meta.url),"utf8");
const ui=readFileSync(new URL("../components/digital-employee-studio.tsx",import.meta.url),"utf8");

test("readiness is authenticated, tenant scoped and strictly nonbillable",()=>{
 assert.match(edge,/verify_jwt|auth\.getUser\(token\)/);
 assert.match(edge,/authentication_required/);
 assert.match(edge,/list_my_tenants/);
 assert.match(edge,/tenant_owner_required/);
 assert.match(edge,/\.eq\("tenant_id",tenantId\)\.eq\("id",agentId\)/);
 assert.match(edge,/status==="draft"/);
 assert.match(edge,/approval_mode==="human_approval"/);
 assert.match(edge,/allowed_tools\.length===0/);
 assert.match(edge,/knowledge\.services\.trim\(\)\.length>=5/);
 assert.match(edge,/supabase_edge_openai_key_present:providerConfigured/);
 assert.match(edge,/ready_for_trial:safeAgent&&knowledgeReady&&providerConfigured&&modelConfigured&&budgetConfigured/);
 assert.doesNotMatch(edge,/api\.openai\.com|\/v1\/responses|reserve_ai_employee_budgeted_trial/);
 assert.doesNotMatch(edge,/SUPABASE_SERVICE_ROLE_KEY|service_role/);
});
test("Family Power UI must check readiness before a paid generation",()=>{
 assert.match(ui,/supabase\.functions\.invoke\("ai-employee-readiness"/);
 assert.match(ui,/setReadiness\(response\.data as AiReadiness\)/);
 assert.match(ui,/if\(tenant\?\.tenant_slug==="family-power"&&!readiness\?\.ready_for_trial\)/);
 assert.match(ui,/disabled=\{testing\|\|busy\|\|!readiness\?\.ready_for_trial/);
 assert.match(ui,/Falta la clave del proveedor en Supabase Edge Functions/);
 assert.match(ui,/setSelectedId\(result\.data\.id\);setReadiness\(null\)/);
});

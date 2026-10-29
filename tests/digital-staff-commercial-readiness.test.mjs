import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildIllustrativeProposal,DEMO_ROLES,DEMO_SCENARIOS,makeDemoReply} from "../lib/digital-staff-commercial-demo.ts";
const demo=readFileSync(new URL("../app/demo/look-digital-staff/page.tsx",import.meta.url),"utf8");
const admin=readFileSync(new URL("../components/platform-admin.tsx",import.meta.url),"utf8");
const agency=readFileSync(new URL("../app/agency/page.tsx",import.meta.url),"utf8");
const migration=readFileSync(new URL("../supabase/migrations/20261029213000_agency_atomic_prospect_touch.sql",import.meta.url),"utf8");
const seed=readFileSync(new URL("../supabase/migrations/20261029214500_client_digital_staff_drafts.sql",import.meta.url),"utf8");
test("four employees simulate fixed replies, never send or invent real appointments/payments",()=>{
 assert.equal(Object.keys(DEMO_ROLES).length,4);
 assert.equal(Object.keys(DEMO_SCENARIOS).length,4);
 for(const role of Object.keys(DEMO_ROLES)){
  const result=makeDemoReply(role,"consulta","Lazala Studio");
  assert.equal(result.needsApproval,true);
  assert.equal(result.role,role);
  assert.ok(result.message.includes("Lazala Studio"));
  assert.ok(result.nextStep.length>8);
 }
 assert.match(makeDemoReply("secretaria","cita","Empresa").message,/confirmación depende/);
 assert.match(makeDemoReply("cobros","factura","Empresa").message,/verificará el documento/);
 assert.match(demo,/SIMULACIÓN INTERACTIVA/);
 assert.match(demo,/ficticios y locales/);
 assert.doesNotMatch(demo,/supabase|OPENAI_API_KEY|fetch\(|functions\.invoke|graph\.facebook|wa\.me/);
});
test("commercial proposal only names the real professional and stays preliminary",()=>{
 const proposal=buildIllustrativeProposal("Fábrica X","Crecimiento","Control de prospectos");
 assert.match(proposal,/Ángel Berigüete/);
 assert.match(proposal,/NO CONTRATO NI FACTURA/);
 assert.match(proposal,/sujetos a evaluación/);
 assert.doesNotMatch(proposal,/garantizamos|pago confirmado/i);
 assert.ok(proposal.includes("Fábrica X"));
 assert.ok(buildIllustrativeProposal("<unknown>","Inicio","").length<3000);
});
test("Agency OS logs actual calls transactionally with admin checks and deadlines",()=>{
 assert.match(migration,/security invoker/i);
 assert.match(migration,/private\.is_platform_admin\(\)/);
 assert.match(migration,/for update/);
 assert.match(migration,/last_contact_at=case when v_contacted/);
 assert.match(migration,/insert into public\.agency_prospect_activities/);
 assert.match(migration,/grant execute on function public\.agency_record_prospect_touch[\s\S]*?to authenticated;/i);
 assert.match(agency,/supabase\.rpc\("agency_record_prospect_touch"/);
 assert.match(agency,/Guardar actividad y actualizar CRM/);
 assert.doesNotMatch(agency,/window\.prompt/);
});
test("onboarding reads server readiness and never markets manual subscriptions as paid",()=>{
 assert.match(admin,/supabase\.rpc\("platform_client_readiness"/);
 assert.match(admin,/ready_for_commercial_activation/);
 assert.match(admin,/suscripciones «manual»/);
 assert.match(admin,/selectedTenantRef\.current!==tenantId/);
 assert.match(admin,/Sin comprobante de proveedor/);
});

test("platform provisions four disabled-by-default draft staff profiles exactly once",()=>{
 assert.match(admin,/supabase\.rpc\("platform_prepare_client_digital_staff"/);
 assert.match(admin,/Preparar 4 empleados en borrador/);
 assert.match(seed,/security invoker/i);
 assert.match(seed,/private\.is_platform_admin\(\)/);
 assert.match(seed,/pg_advisory_xact_lock/);
 assert.match(seed,/settings->>'role'=v_role/);
 for(const role of ["recepcionista","vendedor","secretaria","cobros"])assert.ok(seed.includes("'"+role+"'"));
 assert.match(seed,/'draft','openai','server-configured'/);
 assert.match(seed,/'human_approval','\[\]'::jsonb/);
 assert.match(seed,/requires_verified_knowledge/);
 assert.doesNotMatch(seed,/INSERT INTO public\.ai_agent_runs|graph\.facebook|OPENAI_API_KEY/i);
 assert.match(seed,/grant execute on function public\.platform_prepare_client_digital_staff\(uuid\)[\s\S]*?to authenticated;/i);
});

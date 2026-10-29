import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {EMPLOYEE_ROLES, normalizeEmployeeKnowledge, validateEmployeeKnowledge,validateEmployeeRequest,makeEmployeeInstructions} from "../lib/digital-employee.ts";
const uid="11111111-1111-4111-8111-111111111111";
const knowledge={business_name:"Negocio de prueba",services:"Servicio de personalización de artículos según la cotización individual",hours:"",location:"",prices:"",booking:"",faq:"",human_contact:"Atención humana"};
test("reusable first roles include receptionist and seller",()=>{
 assert.deepEqual(Object.keys(EMPLOYEE_ROLES).sort(),["cobros","recepcionista","secretaria","vendedor"]);
 assert.match(EMPLOYEE_ROLES.vendedor.instructions,/cotizaciones definitivas/);
 assert.match(EMPLOYEE_ROLES.recepcionista.instructions,/nunca confirmes/i);
 assert.match(EMPLOYEE_ROLES.cobros.instructions,/No inventes saldos/);
 assert.match(EMPLOYEE_ROLES.secretaria.instructions,/No alteres registros/);
});
test("explicit bounded business knowledge is required",()=>{
 assert.equal(validateEmployeeKnowledge({}),"business_name_required");
 assert.equal(validateEmployeeKnowledge({business_name:"Negocio"}),"services_required");
 assert.equal(validateEmployeeKnowledge(knowledge),null);
 const v=normalizeEmployeeKnowledge({...knowledge,services:"x".repeat(5000),faq:"z".repeat(9000)});
 assert.equal(v.services.length,1600);assert.equal(v.faq.length,1800);
});
test("manual trials require tenant, agent, idempotency id and bounded scenario",()=>{
 const data={tenant_id:uid,agent_id:uid,request_id:uid,question:"¿Cómo reservar?"};
 assert.equal(validateEmployeeRequest(data),null);
 for(const [field,invalid,code] of [["tenant_id","x","tenant_invalid"],["agent_id","x","agent_invalid"],
 ["request_id","x","request_id_invalid"],["question","a","question_invalid"]]){
  assert.equal(validateEmployeeRequest({...data,[field]:invalid}),code);
 }
 assert.equal(validateEmployeeRequest({...data,question:"x".repeat(1201)}),"question_invalid");
});
test("instructions enforce human drafts, business fact grounding and no unverified actions",()=>{
 const prompt=makeEmployeeInstructions("recepcionista",normalizeEmployeeKnowledge(knowledge));
 for(const phrase of ["BORRADOR","No inventes","agenda","credenciales","Datos autorizados","asistente de IA"])assert.ok(prompt.includes(phrase),phrase);
 assert.ok(prompt.includes("Negocio de prueba"));
 assert.throws(()=>makeEmployeeInstructions("cobrador",normalizeEmployeeKnowledge(knowledge)),/role_not_supported/);
});
test("worker is tenant/owner gated, draft-only, has no external sends, and frontend carries no secrets",()=>{
 const worker=readFileSync(new URL("../supabase/functions/ai-employee-draft/index.ts",import.meta.url),"utf8");
 const studio=readFileSync(new URL("../components/digital-employee-studio.tsx",import.meta.url),"utf8");
 const route=readFileSync(new URL("../app/crm/[[...slug]]/page.tsx",import.meta.url),"utf8");
 const gate=readFileSync(new URL("../components/tenant-permission-gate.tsx",import.meta.url),"utf8");
 for(const phrase of ['"owner","admin"','agent.status!=="draft"','agent.allowed_tools.length!==0',
   'status:"awaiting_approval"','store:false','auth.getUser(bearer)','"ai_provider_not_configured"']){
  assert.ok(worker.includes(phrase),"missing security gate: "+phrase);
 }
 assert.ok(!studio.includes("OPENAI_API_KEY"));
 assert.ok(studio.includes('status:"draft"')&&studio.includes('allowed_tools:[]'));
 assert.ok(studio.includes('Generar borrador con IA'));
 assert.ok(route.includes('section === "employees"'));
 assert.ok(gate.includes('employees: "settings"'));
});

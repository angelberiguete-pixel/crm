import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  EMPLOYEE_AI_MODEL,EMPLOYEE_AI_MAX_OUTPUT_TOKENS,EMPLOYEE_AI_FORMAT,
  budgetUsdToMicros,estimatedMaxCostMicros,observedCostMicros,validateEmployeeAIOutcome,
} from "../lib/ai-employee-provider.ts";
const worker=readFileSync(new URL("../supabase/functions/ai-employee-draft/index.ts",import.meta.url),"utf8");
const db=readFileSync(new URL("../supabase/migrations/20261029041000_ai_employee_budget_reservations.sql",import.meta.url),"utf8");

test("price and model cannot drift silently on the provider gateway",()=>{
 assert.equal(EMPLOYEE_AI_MODEL,"gpt-5.4-mini-2026-03-17");
 assert.equal(EMPLOYEE_AI_MAX_OUTPUT_TOKENS,450);
 assert.match(worker,/model!==EMPLOYEE_AI_MODEL/);
 assert.match(worker,/AI_EMPLOYEE_GLOBAL_MONTHLY_BUDGET_USD"\)\?\?"5\.00"/);
 assert.match(worker,/AI_EMPLOYEE_TENANT_MONTHLY_BUDGET_USD"\)\?\?"5\.00"/);
 assert.match(worker,/globalMonthlyBudget>5_000_000/);
 assert.match(worker,/reasoning:\{effort:"none"\}/);
 assert.match(worker,/store:false/);
 assert.match(worker,/text:\{format:EMPLOYEE_AI_FORMAT\}/);
 assert.match(worker,/estimatedMaxCostMicros\(instructions,question\)/);
});
test("never run paid API calls without explicit valid USD limits",()=>{
 for(const bad of [null,undefined,0,-1,NaN,"","0","0.00","1.001","-5","Infinity"," 1","10001","1e3"]){
   assert.equal(budgetUsdToMicros(bad),null,String(bad));
 }
 assert.equal(budgetUsdToMicros("0.01"),10000);
 assert.equal(budgetUsdToMicros("1"),1000000);
 assert.equal(budgetUsdToMicros("5.50"),5500000);
 assert.ok(worker.indexOf("ai_budget_not_configured")<worker.indexOf('fetch("https://api.openai.com/v1/responses"'));
});
test("reservation is conservative for short UTF-8 inputs, bounded in USD micros",()=>{
 const instructions="Eres una IA comercial que redacta solo borradores; consulta una persona. ".repeat(20);
 const prompt="¿Pueden llamarme mañana?";
 const reservation=estimatedMaxCostMicros(instructions,prompt);
 assert.ok(reservation && reservation>2025);
 const actual=observedCostMicros(310,120);
 assert.ok(actual!==null && actual<reservation);
 assert.equal(observedCostMicros(-1,10),null);
 assert.equal(observedCostMicros(10,1000),null);
 assert.equal(estimatedMaxCostMicros("x".repeat(30001),"x"),null);
});
test("structured sales output is validated and never executed automatically",()=>{
 assert.equal(EMPLOYEE_AI_FORMAT.type,"json_schema");
 assert.equal(EMPLOYEE_AI_FORMAT.strict,true);
 assert.equal(EMPLOYEE_AI_FORMAT.schema.additionalProperties,false);
 const item=validateEmployeeAIOutcome({draft:"Podemos preparar una cita, la confirmará el responsable.",intent:"cita",next_step:"proponer_cita",requires_human:true});
 assert.equal(item?.intent,"cita");
 for(const bad of [null,{draft:"",intent:"cita",next_step:"proponer_cita",requires_human:true},
  {draft:"Cita confirmada",intent:"unknown",next_step:"responder",requires_human:false},
  {draft:"Mensaje",intent:"compra",next_step:"pagar",requires_human:true},
  {draft:"Mensaje",intent:"compra",next_step:"responder",requires_human:"no"},
 ])assert.equal(validateEmployeeAIOutcome(bad),null);
 assert.match(worker,/status:"awaiting_approval"/);
 assert.match(worker,/requires_human:outcome\.requires_human/);
});
test("database enforces atomic budget allocation for all companies",()=>{
 assert.match(db,/on conflict\(month_start\) do update/i);
 assert.match(db,/on conflict\(tenant_id,month_start\) do update/i);
 assert.match(db,/raise exception 'global_budget_exhausted'/);
 assert.match(db,/raise exception 'tenant_budget_exhausted'/);
 assert.match(db,/raise exception 'daily_trial_limit'/);
 assert.match(db,/security invoker/);
 assert.match(db,/grant execute on function public\.reserve_ai_employee_budgeted_trial[\s\S]*?to service_role;/i);
 assert.doesNotMatch(db,/grant execute on function public\.reserve_ai_employee_budgeted_trial.*to authenticated;/i);
 assert.match(db,/alter table public\.ai_employee_global_monthly_budget enable row level security;/i);
});

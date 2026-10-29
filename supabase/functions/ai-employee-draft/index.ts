import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import {
  EMPLOYEE_ROLES, makeEmployeeInstructions, normalizeEmployeeKnowledge,
  validateEmployeeKnowledge, validateEmployeeRequest,
  type EmployeeRole,
} from "../../../lib/digital-employee.ts";
import {EMPLOYEE_AI_MODEL,EMPLOYEE_AI_MAX_OUTPUT_TOKENS,EMPLOYEE_AI_FORMAT,
  budgetUsdToMicros,estimatedMaxCostMicros,observedCostMicros,
  validateEmployeeAIOutcome} from "../../../lib/ai-employee-provider.ts";

const allowedOrigins=new Set(["https://crm-revenue-os.vercel.app","http://localhost:3000"]);
const respond=(origin:string,data:unknown,status=200)=>new Response(JSON.stringify(data),{
  status,headers:{"Content-Type":"application/json; charset=utf-8","Access-Control-Allow-Origin":origin,
    "Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info",
    "Access-Control-Allow-Methods":"POST, OPTIONS","Cache-Control":"no-store","Vary":"Origin"},
});
const error=(origin:string,code:string,status=400)=>respond(origin,{ok:false,error:code},status);

Deno.serve(async req=>{
  const origin=req.headers.get("origin")??"";
  if(!allowedOrigins.has(origin))return new Response(JSON.stringify({ok:false,error:"origin_denied"}),{
    status:403,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
  if(req.method==="OPTIONS")return respond(origin,{ok:true});
  if(req.method!=="POST")return error(origin,"method_not_allowed",405);
  const bearer=/^Bearer (.+)$/i.exec(req.headers.get("authorization")??"")?.[1];
  if(!bearer||bearer.length>12000)return error(origin,"authentication_required",401);
  const raw=await req.text();
  if(raw.length>5500)return error(origin,"input_too_large",413);
  let data:Record<string,unknown>;
  try{const obj=JSON.parse(raw);data=obj&&typeof obj==="object"&&!Array.isArray(obj)?obj:{};}
  catch{return error(origin,"invalid_json",400);}
  const inputError=validateEmployeeRequest(data);
  if(inputError)return error(origin,inputError,422);
  const tenantId=data.tenant_id as string;
  const agentId=data.agent_id as string;
  const requestId=data.request_id as string;
  const question=(data.question as string).trim();
  const url=Deno.env.get("SUPABASE_URL");
  const publicKey=Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const apiKey=Deno.env.get("OPENAI_API_KEY");
  const model=Deno.env.get("AI_EMPLOYEE_MODEL")??EMPLOYEE_AI_MODEL;
  const tenantMonthlyBudget=budgetUsdToMicros(Deno.env.get("AI_EMPLOYEE_TENANT_MONTHLY_BUDGET_USD")??"5.00");
  const globalMonthlyBudget=budgetUsdToMicros(Deno.env.get("AI_EMPLOYEE_GLOBAL_MONTHLY_BUDGET_USD")??"5.00");
  if(!url||!publicKey||!serviceKey)return error(origin,"server_not_configured",503);
  if(!apiKey||model!==EMPLOYEE_AI_MODEL)return error(origin,"ai_provider_not_configured",503);
  if(!tenantMonthlyBudget||!globalMonthlyBudget||globalMonthlyBudget<tenantMonthlyBudget||globalMonthlyBudget>5_000_000)
    return error(origin,"ai_budget_not_configured",503);
  const service=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const identity=await service.auth.getUser(bearer);
  if(identity.error||!identity.data.user)return error(origin,"authentication_required",401);
  const user=createClient(url,publicKey,{auth:{persistSession:false,autoRefreshToken:false},
    global:{headers:{Authorization:"Bearer "+bearer}}});
  const memberships=await user.rpc("list_my_tenants");
  if(memberships.error)return error(origin,"authorization_unavailable",503);
  const membership=(Array.isArray(memberships.data)?memberships.data:[]).find(m=>
    m.tenant_id===tenantId&&m.is_active===true&&["owner","admin"].includes(m.membership_role));
  if(!membership)return error(origin,"tenant_owner_required",403);
  const queried=await user.from("ai_agents")
    .select("id,tenant_id,name,purpose,status,approval_mode,model_provider,allowed_tools,settings")
    .eq("tenant_id",tenantId).eq("id",agentId).maybeSingle();
  if(queried.error)return error(origin,"agent_read_failed",503);
  const agent=queried.data;
  if(!agent||agent.status!=="draft"||agent.model_provider!=="openai"||
    agent.approval_mode!=="human_approval"||
    !Array.isArray(agent.allowed_tools)||agent.allowed_tools.length!==0)
    return error(origin,"agent_not_in_safe_draft_mode",409);
  const settings=agent.settings&&typeof agent.settings==="object"&&!Array.isArray(agent.settings)?agent.settings as Record<string,unknown>:{};
  const role=settings.role as EmployeeRole;
  if(!Object.hasOwn(EMPLOYEE_ROLES,role))return error(origin,"role_not_supported",422);
  const knowledge=normalizeEmployeeKnowledge(settings.knowledge);
  if(validateEmployeeKnowledge(knowledge))return error(origin,"knowledge_incomplete",422);
  const instructions=makeEmployeeInstructions(role,knowledge);
  const reservationMicros=estimatedMaxCostMicros(instructions,question);
  if(!reservationMicros||reservationMicros>tenantMonthlyBudget)
    return error(origin,"ai_budget_insufficient",429);
  // Reserve a paid model trial and idempotent run together inside PostgreSQL.
  // Authenticated clients cannot call this service_role-only RPC.
  const reserved=await service.rpc("reserve_ai_employee_budgeted_trial",{
    p_request_id:requestId,p_tenant_id:tenantId,p_agent_id:agentId,
    p_question:question,p_role:role,
    p_max_cost_micros:reservationMicros,
    p_tenant_month_limit_micros:tenantMonthlyBudget,
    p_global_month_limit_micros:globalMonthlyBudget,
  });
  if(reserved.error){
    if(reserved.error.code==="23505")return error(origin,"request_already_submitted",409);
    const providerCode=String(reserved.error.message??"");
    const allowed=["global_budget_exhausted","tenant_budget_exhausted","daily_trial_limit"];
    const code=allowed.find(x=>providerCode.includes(x));
    if(code)return error(origin,code,429);
    return error(origin,"trial_reservation_unavailable",503);
  }
  if(reserved.data!=="reserved"){
    const code=typeof reserved.data==="string"?reserved.data:"trial_reservation_failed";
    const status=code==="daily_trial_limit"?429:code==="request_already_submitted"?409:422;
    return error(origin,code,status);
  }
  const finish=async(fields:Record<string,unknown>)=>service.from("ai_agent_runs")
    .update({...fields,finished_at:new Date().toISOString()}).eq("tenant_id",tenantId).eq("id",requestId);
  try{
    const modelResponse=await fetch("https://api.openai.com/v1/responses",{
      method:"POST",
      headers:{"Authorization":"Bearer "+apiKey,"Content-Type":"application/json"},
      body:JSON.stringify({
        model:EMPLOYEE_AI_MODEL,
        store:false,
        reasoning:{effort:"none"},
        max_output_tokens:EMPLOYEE_AI_MAX_OUTPUT_TOKENS,
        text:{format:EMPLOYEE_AI_FORMAT},
        instructions, input:question,
      }),
      signal:AbortSignal.timeout(20000),
    });
    if(!modelResponse.ok)throw new Error("model_http_"+modelResponse.status);
    const result=await modelResponse.json();
    if(result?.status!=="completed")throw new Error("model_incomplete");
    const rawText=(typeof result.output_text==="string"?result.output_text:
      (Array.isArray(result.output)?result.output.flatMap((piece:any)=>Array.isArray(piece.content)?piece.content:[])
        .filter((part:any)=>part.type==="output_text"&&typeof part.text==="string")
        .map((part:any)=>part.text).join("\n"):"")).trim();
    let parsed:unknown;
    try{parsed=JSON.parse(rawText);}catch{throw new Error("model_output_invalid");}
    const outcome=validateEmployeeAIOutcome(parsed);
    if(!outcome)throw new Error("model_output_invalid");
    const promptTokens=result.usage?.input_tokens;
    const completionTokens=result.usage?.output_tokens;
    const actualMicros=observedCostMicros(promptTokens,completionTokens);
    if(actualMicros===null||actualMicros>reservationMicros)throw new Error("model_usage_outside_budget");
    const fields={
      status:"awaiting_approval",
      output:{draft:outcome.draft,intent:outcome.intent,next_step:outcome.next_step,
        requires_human:outcome.requires_human,review_required:true,source:"ai_generated",
        provider:"openai",model:EMPLOYEE_AI_MODEL,reserved_cost_micros:reservationMicros},
      prompt_tokens:promptTokens,
      completion_tokens:completionTokens,
      estimated_cost_micros:actualMicros,
    };
    const stored=await finish(fields);
    if(stored.error)return error(origin,"result_storage_failed",503);
    return respond(origin,{ok:true,run_id:requestId,draft:outcome.draft,
      intent:outcome.intent,next_step:outcome.next_step,requires_human:outcome.requires_human,
      estimated_cost_micros:actualMicros,review_required:true,
      note:"Borrador de IA para revisión humana; no enviado ni aplicado al CRM"});
  }catch(cause){
    const reason=cause instanceof Error?cause.message:"unknown";
    const safeReason=/^model_http_\d+$/.test(reason)?reason:reason==="model_output_invalid"?reason:"model_unavailable";
    await finish({status:"failed",error_message:safeReason});
    return error(origin,"model_failed",502);
  }
});

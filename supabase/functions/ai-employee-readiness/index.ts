import { createClient } from "npm:@supabase/supabase-js@2.116.0";

// Read-only, nonbillable readiness check. The provider key is never returned or used.
const allowedOrigins=new Set(["https://crm-revenue-os.vercel.app","http://localhost:3000"]);
const headers=(origin:string)=>({
  "Content-Type":"application/json; charset=utf-8",
  "Access-Control-Allow-Origin":origin,
  "Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Cache-Control":"no-store","Vary":"Origin"
});
const reply=(origin:string,status:number,body:unknown)=>new Response(
  JSON.stringify(body),{status,headers:headers(origin)}
);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function budgetValid(value:unknown):boolean{
 return typeof value==="string"
   &&/^(?:0|[1-9][0-9]{0,4})(?:\.[0-9]{1,2})?$/.test(value)
   &&Number(value)>=0.01&&Number(value)<=5.00;
}
Deno.serve(async(req)=>{
 const origin=req.headers.get("origin")??"";
 if(!allowedOrigins.has(origin))return new Response(JSON.stringify({ok:false,error:"origin_denied"}),{
   status:403,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
 if(req.method==="OPTIONS")return reply(origin,200,{ok:true});
 if(req.method!=="POST")return reply(origin,405,{ok:false,error:"method_not_allowed"});
 const token=/^Bearer (.+)$/i.exec(req.headers.get("authorization")??"")?.[1]??"";
 if(!token||token.length>12000)return reply(origin,401,{ok:false,error:"authentication_required"});
 let body:unknown;
 try{
  const raw=await req.text();
  if(raw.length>1024)return reply(origin,413,{ok:false,error:"input_too_large"});
  body=JSON.parse(raw);
 }catch{return reply(origin,400,{ok:false,error:"invalid_json"});}
 if(!body||typeof body!=="object"||Array.isArray(body))return reply(origin,422,{ok:false,error:"request_invalid"});
 const data=body as Record<string,unknown>;
 const tenantId=data.tenant_id,agentId=data.agent_id;
 if(typeof tenantId!=="string"||typeof agentId!=="string"||!uuid.test(tenantId)||!uuid.test(agentId))
  return reply(origin,422,{ok:false,error:"ids_invalid"});
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_ANON_KEY");
 if(!url||!key)return reply(origin,503,{ok:false,error:"server_not_configured"});
 const user=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},
  global:{headers:{Authorization:"Bearer "+token}}});
 const identity=await user.auth.getUser(token);
 if(identity.error||!identity.data.user)return reply(origin,401,{ok:false,error:"authentication_required"});
 const memberships=await user.rpc("list_my_tenants");
 if(memberships.error)return reply(origin,503,{ok:false,error:"authorization_unavailable"});
 const member=(Array.isArray(memberships.data)?memberships.data:[]).find(x=>
   x.tenant_id===tenantId&&x.is_active===true&&["owner","admin"].includes(x.membership_role));
 if(!member)return reply(origin,403,{ok:false,error:"tenant_owner_required"});
 const result=await user.from("ai_agents").select(
  "id,tenant_id,status,model_provider,approval_mode,allowed_tools,settings"
 ).eq("tenant_id",tenantId).eq("id",agentId).maybeSingle();
 if(result.error)return reply(origin,503,{ok:false,error:"agent_read_unavailable"});
 if(!result.data)return reply(origin,404,{ok:false,error:"agent_not_found"});
 const agent=result.data;
 const safeAgent=agent.status==="draft"&&agent.model_provider==="openai"&&
   agent.approval_mode==="human_approval"&&Array.isArray(agent.allowed_tools)&&agent.allowed_tools.length===0;
 const k=(agent.settings&&typeof agent.settings==="object"&&!Array.isArray(agent.settings)?
  agent.settings as Record<string,unknown>:{}).knowledge;
 const knowledge=k&&typeof k==="object"&&!Array.isArray(k)?k as Record<string,unknown>:{};
 const knowledgeReady=typeof knowledge.business_name==="string"&&knowledge.business_name.trim().length>=2&&
   typeof knowledge.services==="string"&&knowledge.services.trim().length>=5;
 const providerConfigured=Boolean(Deno.env.get("OPENAI_API_KEY")?.trim());
 const modelConfigured=(Deno.env.get("AI_EMPLOYEE_MODEL")??"gpt-5.4-mini-2026-03-17")==="gpt-5.4-mini-2026-03-17";
 const tenantBudget=budgetValid(Deno.env.get("AI_EMPLOYEE_TENANT_MONTHLY_BUDGET_USD")??"5.00");
 const globalBudget=budgetValid(Deno.env.get("AI_EMPLOYEE_GLOBAL_MONTHLY_BUDGET_USD")??"5.00");
 const configuredTenant=Number(Deno.env.get("AI_EMPLOYEE_TENANT_MONTHLY_BUDGET_USD")??"5.00");
 const configuredGlobal=Number(Deno.env.get("AI_EMPLOYEE_GLOBAL_MONTHLY_BUDGET_USD")??"5.00");
 const budgetConfigured=tenantBudget&&globalBudget&&configuredTenant<=configuredGlobal;
 return reply(origin,200,{
  ok:true,
  agent_safe_draft:safeAgent,
  verified_knowledge_present:knowledgeReady,
  supabase_edge_openai_key_present:providerConfigured,
  model_configured:modelConfigured,
  budget_configured:budgetConfigured,
  ready_for_trial:safeAgent&&knowledgeReady&&providerConfigured&&modelConfigured&&budgetConfigured,
  note:"Comprobación de configuración, no una llamada real a OpenAI ni una garantía de crédito disponible."
 });
});

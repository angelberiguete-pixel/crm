/** Cita-24 administrative reception draft — NEVER sends messages or diagnoses.
 * Authenticated tenant staff only. Daily quota and opt-in flag are enforced.
 * Requires OPENAI_API_KEY and CITA24_AI_DRAFT_ENABLED=true to actually incur AI spend.
 */
import {createClient} from "npm:@supabase/supabase-js@2.116.0";
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const cors={
 "Access-Control-Allow-Origin":"*",
 "Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info",
 "Access-Control-Allow-Methods":"POST,OPTIONS",
 "Cache-Control":"no-store",
};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{
 status,headers:{"Content-Type":"application/json; charset=utf-8",...cors}});
const fail=(code:string,status=400)=>json({ok:false,error:code},status);
const privateDataPattern=/[\w.+-]+@[\w.-]+\.[a-z]{2,}|\+?\d[\s()\d-]{7,}\d/i;
const clinicalPattern=/\b(sangre|diagnostic|diagnóstic|enfermedad|receta|tratamiento médico|síntoma|sintoma|alergia|embarazo|dolor|historia clínica|historial médico)\b/i;

Deno.serve(async request=>{
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(request.method!=="POST")return fail("method_not_allowed",405);
 if(Deno.env.get("CITA24_AI_DRAFT_ENABLED")!=="true")return fail("ai_not_enabled",503);
 const url=Deno.env.get("SUPABASE_URL")??"";
 const anon=Deno.env.get("SUPABASE_ANON_KEY")??"";
 const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
 const apiKey=Deno.env.get("OPENAI_API_KEY")??"";
 if(!url||!anon||!service||apiKey.length<20)return fail("ai_not_configured",503);
 const bearer=/^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization")??"")?.[1];
 if(!bearer)return fail("sign_in_required",401);
 const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error:identityError}=await db.auth.getUser(bearer);
 if(identityError||!user)return fail("invalid_session",401);
 const raw=await request.text();
 if(raw.length>2600)return fail("too_large",413);
 let payload:Record<string,unknown>;
 try{
  const parsed=JSON.parse(raw);
  if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw Error();
  payload=parsed;
 }catch{return fail("invalid_request",400);}
 const tenantId=payload.tenant_id;
 const requestId=payload.request_id;
 const question=typeof payload.question==="string"?payload.question.trim():"";
 if(typeof tenantId!=="string"||!uuid.test(tenantId)||
    typeof requestId!=="string"||!uuid.test(requestId)||
    question.length<8||question.length>400||
    privateDataPattern.test(question)||clinicalPattern.test(question))
   return fail("only_anonymous_administrative_questions",422);
 const [{data:member},{data:config},{data:tenant}]=await Promise.all([
  db.from("memberships").select("status,role").eq("tenant_id",tenantId)
    .eq("user_id",user.id).eq("status","active").maybeSingle(),
  db.from("cita24_portal_configs").select("clinic_name,services,ai_enabled")
    .eq("tenant_id",tenantId).maybeSingle(),
  db.from("tenants").select("status,slug").eq("id",tenantId).maybeSingle(),
 ]);
 if(!member||!["owner","admin","manager","agent"].includes(member.role)||
    tenant?.status!=="active"||tenant?.slug==="family-power")return fail("not_authorized",403);
 if(config?.ai_enabled!==true)return fail("clinic_ai_disabled",409);
 const quota=await db.rpc("cita24_claim_ai_daily_quota",{p_tenant_id:tenantId});
 if(quota.error)return fail("ai_budget_unavailable",503);
 if(quota.data!==true)return fail("ai_daily_limit",429);
 const model=Deno.env.get("CITA24_AI_MODEL")??"gpt-4.1-mini";
 const instructions=[
  "Eres un asistente administrativo que genera BORRADORES para recepción humana de clínica en República Dominicana.",
  "La clínica se llama "+String(config.clinic_name).slice(0,100)+".",
  "Estos son servicios administrativos autorizados: "+(config.services||[]).map((x:unknown)=>String(x).slice(0,70)).join(", ")+".",
  "No des consejo médico, no realices diagnósticos ni solicites información de salud.",
  "Nunca inventes horarios disponibles, precios, disponibilidad, tratamientos ni resultados.",
  "Si preguntan por horarios/precio/salud no documentados, deriva a recepción para confirmar.",
  "No afirmes haber reservado una cita ni haber enviado un mensaje.",
  "Responde en español claro, cordial, hasta 85 palabras. Solo borrador supervisado.",
 ].join("\n");
 try{
  const output=await fetch("https://api.openai.com/v1/responses",{
   method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+apiKey},
   body:JSON.stringify({
    model,max_output_tokens:220,store:false,
    instructions,input:question
   }),signal:AbortSignal.timeout(20000)
  });
  if(!output.ok)return fail("ai_provider_unavailable",502);
  const body=await output.json();
  const draft=(typeof body.output_text==="string"?body.output_text:
   Array.isArray(body.output)?body.output.flatMap((item: any)=>Array.isArray(item.content)?item.content:[])
    .filter((x: any)=>x.type==="output_text"&&typeof x.text==="string")
    .map((x: any)=>x.text).join("\n"):"").trim();
  if(!draft||draft.length>1500)return fail("ai_output_invalid",502);
  return json({ok:true,draft,review_required:true,sent:false,
   note:"Borrador para revisión humana, no enviado ni confirmado."});
 }catch{
  return fail("ai_provider_unavailable",502);
 }
});

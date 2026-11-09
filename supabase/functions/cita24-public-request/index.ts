/** Public, fail-closed request-only intake for Cita-24 · Empresia.
 * NEVER creates a confirmed appointment, sends a message or returns patient records.
 * Supabase verify_jwt=false is required because visitors are anonymous.
 * Configure TURNSTILE_SECRET_KEY, CITA24_RATE_SALT, CITA24_ALLOWED_ORIGINS.
 */
import {createClient} from "npm:@supabase/supabase-js@2.116.0";

const allowedOrigins=new Set(
  (Deno.env.get("CITA24_ALLOWED_ORIGINS") ||
  "https://crm-revenue-os.vercel.app,http://localhost:3000")
  .split(",").map(x=>x.trim()).filter(Boolean)
);
const domain=/^[a-z0-9][a-z0-9-]{2,55}$/;
const phonePattern=/^\+[1-9]\d{7,14}$/;
const cors=(origin:string)=>({
  "Access-Control-Allow-Origin":origin,
  "Access-Control-Allow-Headers":"content-type,apikey,x-client-info",
  "Access-Control-Allow-Methods":"GET,POST,OPTIONS",
  "Cache-Control":"no-store",
  "Vary":"Origin",
});
function respond(origin:string,value:unknown,status=200) {
  return new Response(JSON.stringify(value),{status,
    headers:{"Content-Type":"application/json; charset=utf-8",...cors(origin)}});
}
const error=(origin:string,code:string,status=400)=>respond(origin,{ok:false,error:code},status);
const mail=/^[^\s@<>]{1,70}@[^\s@<>]+\.[^\s@<>]{2,}$/;
const isoDay=/^\d{4}-\d{2}-\d{2}$/;
function todayInDR() {
  const f=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Santo_Domingo",year:"numeric",month:"2-digit",day:"2-digit"});
  return f.format(new Date());
}
async function shaHex(value:string) {
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
}
async function verifyTurnstile(token:string,ip:string,origin:string){
  const secret=Deno.env.get("TURNSTILE_SECRET_KEY")??"";
  if(secret.length<16)return false;
  const data=new FormData();
  data.set("secret",secret);
  data.set("response",token);
  if(ip)data.set("remoteip",ip);
  const reply=await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {method:"POST",body:data,signal:AbortSignal.timeout(8000)});
  if(!reply.ok)return false;
  const result=await reply.json();
  const hostname=new URL(origin).hostname;
  return result.success===true && result.hostname===hostname;
}

Deno.serve(async request=>{
  const origin=request.headers.get("origin")??"";
  if(!allowedOrigins.has(origin))return new Response("origin_forbidden",{status:403});
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:cors(origin)});
  if(request.method!=="GET"&&request.method!=="POST")return error(origin,"method_not_allowed",405);
  const url=Deno.env.get("SUPABASE_URL")??"";
  const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
  if(!url||!service)return error(origin,"server_not_configured",503);
  const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  let payload:Record<string,unknown>={};
  if(request.method==="POST"){
    if(Number(request.headers.get("content-length")??"0")>5500)return error(origin,"too_large",413);
    try{
      const text=await request.text();
      if(text.length>5500)return error(origin,"too_large",413);
      const raw=JSON.parse(text);
      if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Error();
      payload=raw;
    }catch{return error(origin,"invalid_json",400);}
  }
  const slug=request.method==="GET"
    ?new URL(request.url).searchParams.get("clinic")
    :payload.clinic;
  if(typeof slug!=="string"||!domain.test(slug))return error(origin,"unknown_clinic",404);
  const {data:clinic,error:configError}=await db.from("cita24_portal_configs")
    .select("tenant_id,clinic_name,services,enabled")
    .eq("slug",slug).eq("enabled",true).maybeSingle();
  if(configError)return error(origin,"configuration_unavailable",503);
  if(!clinic)return error(origin,"unknown_clinic",404);
  const {data:tenant}=await db.from("tenants").select("status,slug")
    .eq("id",clinic.tenant_id).maybeSingle();
  if(tenant?.status!=="active"||tenant?.slug==="family-power")
    return error(origin,"clinic_unavailable",404);
  if(request.method==="GET")
    return respond(origin,{ok:true,clinic_name:clinic.clinic_name,
      services:clinic.services,timezone:"America/Santo_Domingo",
      note:"Solicitudes sujetas a confirmación humana; no son citas reservadas."});

  const name=typeof payload.name==="string"?payload.name.trim():"";
  const phone=typeof payload.phone==="string"?payload.phone.trim():"";
  const email=typeof payload.email==="string"?payload.email.trim():"";
  const serviceName=typeof payload.service==="string"?payload.service.trim():"";
  const day=payload.preferred_day;
  const window=payload.preferred_window;
  const token=payload.turnstile_token;
  const privacy=payload.privacy_accepted===true;
  if(typeof payload.website==="string"&&payload.website.trim())return respond(origin,{ok:true,submitted:true},202);
  if(name.length<2||name.length>100||/[<>]/.test(name)||
     !phonePattern.test(phone)||!privacy||
     (email!==""&&(email.length>180||!mail.test(email)))||
     !Array.isArray(clinic.services)||!clinic.services.includes(serviceName)||
     typeof day!=="string"||!isoDay.test(day)||
     !["morning","afternoon","evening"].includes(String(window))||
     typeof token!=="string"||token.length<20||token.length>2048)
    return error(origin,"invalid_request",422);
  const min=todayInDR();
  const max=new Date(min+"T16:00:00Z");
  max.setUTCDate(max.getUTCDate()+45);
  if(day<min||day>max.toISOString().slice(0,10))return error(origin,"invalid_date",422);

  const ip=(request.headers.get("cf-connecting-ip")||
    request.headers.get("x-real-ip")||
    request.headers.get("x-forwarded-for")?.split(",")[0]||"").trim();
  if(!/^[0-9a-fA-F.:]{3,45}$/.test(ip))return error(origin,"network_not_verified",403);
  const salt=Deno.env.get("CITA24_RATE_SALT")??"";
  if(salt.length<32||!(await verifyTurnstile(token,ip,origin)))
    return error(origin,"verification_unavailable_or_failed",403);
  const key=await shaHex(salt+":"+ip);
  const quota=await db.rpc("cita24_claim_request_quota",{
    p_tenant_id:clinic.tenant_id,p_key_digest:key,p_day:new Date().toISOString().slice(0,10),
  });
  if(quota.error)return error(origin,"quota_unavailable",503);
  if(quota.data!==true)return error(origin,"rate_limited",429);
  // Duplicate submissions become the same neutral response; prevent flood to staff.
  const recent=new Date(Date.now()-12*3600*1000).toISOString();
  const duplicate=await db.from("cita24_visit_requests").select("id")
    .eq("tenant_id",clinic.tenant_id).eq("phone",phone)
    .gte("created_at",recent).limit(1);
  if(duplicate.error)return error(origin,"intake_unavailable",503);
  if(duplicate.data?.length)return respond(origin,{ok:true,submitted:true},202);
  const submitted=await db.from("cita24_visit_requests").insert({
    tenant_id:clinic.tenant_id,full_name:name,phone,email:email||null,
    service:serviceName,preferred_day:day,preferred_window:window,
    privacy_accepted:true,whatsapp_opt_in:payload.whatsapp_opt_in===true,
    status:"pending",source:"public_form",
  }).select("id").single();
  if(submitted.error)return error(origin,"intake_unavailable",503);
  return respond(origin,{ok:true,submitted:true,
    message:"La solicitud fue recibida. La clínica confirmará la disponibilidad."},202);
});

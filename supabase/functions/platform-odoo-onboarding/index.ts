import { createClient } from "@supabase/supabase-js";

const ALLOWED_ORIGINS=new Set(["https://crm-revenue-os.vercel.app","http://localhost:3000"]);
const reply=(origin:string,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{
  "Content-Type":"application/json; charset=utf-8",
  "Access-Control-Allow-Origin":origin,
  "Access-Control-Allow-Headers":"authorization, content-type, x-client-info, apikey",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Vary":"Origin"
}});
function safeBaseUrl(value:string){
  const u=new URL(value);
  if(u.protocol!=="https:")throw new Error("odoo_url_must_use_https");
  const h=u.hostname.toLowerCase();
  if(h==="localhost"||h==="127.0.0.1"||h==="::1"||h.endsWith(".local"))throw new Error("odoo_url_not_public");
  if(/^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(h))throw new Error("odoo_private_network_not_allowed");
  return u.origin;
}
Deno.serve(async(req)=>{
  const origin=req.headers.get("origin")??"";
  if(req.method==="OPTIONS")return ALLOWED_ORIGINS.has(origin)?reply(origin,{ok:true}):new Response(null,{status:403});
  if(req.method!=="POST")return reply(ALLOWED_ORIGINS.has(origin)?origin:"https://crm-revenue-os.vercel.app",{ok:false,error:"method_not_allowed"},405);
  if(!ALLOWED_ORIGINS.has(origin))return new Response(JSON.stringify({ok:false,error:"origin_not_allowed"}),{status:403,headers:{"Content-Type":"application/json"}});
  const authorization=req.headers.get("authorization");
  if(!authorization)return reply(origin,{ok:false,error:"authentication_required"},401);

  try{
    const body=await req.json();
    const tenantId=String(body.tenant_id??"").trim();
    const baseUrl=safeBaseUrl(String(body.base_url??"").trim());
    const database=String(body.database_name??"").trim()||null;
    const apiKey=String(body.api_key??"").trim();
    if(!/^[0-9a-f-]{36}$/i.test(tenantId))throw new Error("tenant_invalid");
    if(apiKey.length<8)throw new Error("api_key_required");

    const url=Deno.env.get("SUPABASE_URL")!;
    const anonKey=Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const user=createClient(url,anonKey,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
    const service=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});

    const access=await user.rpc("platform_current_access");
    if(access.error||!(access.data as any)?.is_platform_admin)return reply(origin,{ok:false,error:"platform_admin_required"},403);

    const configured=await user.rpc("platform_configure_odoo",{
      p_tenant_id:tenantId,p_base_url:baseUrl,p_database_name:database,p_sync_direction:"bidirectional"
    });
    if(configured.error)throw new Error(configured.error.message);
    const connectionId=String(configured.data);

    const stored=await service.rpc("store_erp_connection_credential",{p_connection_id:connectionId,p_secret:apiKey});
    if(stored.error)throw new Error("vault_store_failed");

    let versionPayload:any=null;
    let major:number|null=null;
    let protocol="unknown";
    let authenticated=false;
    let error:string|null=null;

    try{
      const versionResponse=await fetch(baseUrl+"/web/version",{headers:{"user-agent":"look-social-media-crm-odoo-onboarding/1.0"}});
      if(!versionResponse.ok)throw new Error("version_http_"+versionResponse.status);
      versionPayload=await versionResponse.json();
      if(Array.isArray(versionPayload?.server_version_info))major=Number(versionPayload.server_version_info[0]);
      if(!Number.isFinite(major))major=Number(String(versionPayload?.server_version??"").split(".")[0]);
      if(!Number.isFinite(major))major=null;

      if(major!==null&&major>=19){
        protocol="json2";
        const h=new Headers({"Authorization":"bearer "+apiKey,"Content-Type":"application/json; charset=utf-8","user-agent":"look-social-media-crm-odoo-onboarding/1.0"});
        if(database)h.set("x-odoo-database",database);
        const authTest=await fetch(baseUrl+"/json/2/res.users/search_read",{method:"POST",headers:h,body:JSON.stringify({domain:[],fields:["id","name"],limit:1})});
        if(!authTest.ok)throw new Error("json2_auth_http_"+authTest.status);
        authenticated=true;
      }else if(major!==null){
        protocol="legacy_rpc";
        error="Odoo "+major+" detectado. La conexión se guardó de forma segura, pero el adaptador legacy debe estar habilitado antes de sincronizar.";
      }else{
        error="No pudimos determinar la versión de Odoo.";
      }
    }catch(e){
      error=e instanceof Error?e.message:"odoo_preflight_failed";
    }

    const status=authenticated?"connected":"error";
    const settings={
      credential_storage:"vault",
      detected_version:versionPayload?.server_version??null,
      detected_major:major,
      api_protocol:protocol,
      preflight:{version_detected:major!==null,authentication_valid:authenticated,checked_at:new Date().toISOString()}
    };
    const update=await service.from("erp_connections").update({
      status,last_healthcheck_at:new Date().toISOString(),last_error:error,sync_settings:settings
    }).eq("id",connectionId).eq("tenant_id",tenantId);
    if(update.error)throw new Error("connection_status_update_failed");

    if(authenticated){
      const authority=await user.rpc("configure_tenant_odoo_authority",{p_tenant_id:tenantId});
      if(authority.error)throw new Error(authority.error.message);
    }

    return reply(origin,{
      ok:authenticated,
      connection_id:connectionId,
      status,
      detected_version:versionPayload?.server_version??null,
      detected_major:major,
      api_protocol:protocol,
      authentication_valid:authenticated,
      credential_storage:"vault",
      error
    },authenticated?200:422);
  }catch(e){
    console.error("platform-odoo-onboarding",e instanceof Error?e.message:"unknown");
    return reply(origin,{ok:false,error:e instanceof Error?e.message:"request_failed"},400);
  }
});
// Private credential provisioning. Only authenticated platform administrators may
// create Family Power username/password accounts. Passwords never enter the database
// outside Supabase Auth and must never be logged or included in API responses.
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const SITE = "https://crm-revenue-os.vercel.app";
const headers = (origin: string | null) => ({
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": origin === SITE ? SITE : "",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
  "Cache-Control": "no-store",
});
const respond = (status: number, body: Record<string,unknown>, origin:string|null) =>
  new Response(JSON.stringify(body), {status, headers:headers(origin)});
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const usernamePattern=/^[a-z][a-z0-9._-]{2,31}$/;

Deno.serve(async (req) => {
  const origin=req.headers.get("origin");
  if(req.method==="OPTIONS") return new Response(null,{status:204,headers:headers(origin)});
  if(req.method!=="POST") return respond(405,{ok:false,error:"method_not_allowed"},origin);
  if(origin && origin!==SITE) return respond(403,{ok:false,error:"origin_denied"},origin);
  const authHeader=req.headers.get("authorization");
  if(!authHeader?.startsWith("Bearer ")) return respond(401,{ok:false,error:"authentication_required"},origin);
  try {
    const data=await req.json() as Record<string,unknown>;
    const tenantId=String(data.tenant_id??"");
    const username=String(data.username??"").trim().toLowerCase();
    const password=String(data.password??"");
    const displayName=String(data.display_name??"").trim();
    const roleKey=String(data.role_key??"").trim();
    if(!uuidPattern.test(tenantId)||!usernamePattern.test(username)||
      password.length<12||password.length>128||displayName.length<3||displayName.length>100)
      return respond(400,{ok:false,error:"invalid_credential_fields"},origin);
    if(!["owner","admin","manager","sales","viewer"].includes(roleKey))
      return respond(400,{ok:false,error:"invalid_role"},origin);

    const url=Deno.env.get("SUPABASE_URL");
    const anonKey=Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if(!url||!anonKey||!serviceKey) return respond(503,{ok:false,error:"service_unconfigured"},origin);
    const caller=createClient(url,anonKey,{global:{headers:{Authorization:authHeader}},auth:{persistSession:false,autoRefreshToken:false}});
    const access=await caller.rpc("platform_current_access");
    if(access.error||!(access.data as {is_platform_admin?:boolean}|null)?.is_platform_admin)
      return respond(403,{ok:false,error:"platform_admin_required"},origin);
    const companies=await caller.rpc("platform_admin_tenants");
    if(companies.error||!(companies.data as Array<{tenant_id:string;tenant_slug:string}>|null)
      ?.some(t=>t.tenant_id===tenantId&&t.tenant_slug==="family-power"))
      return respond(403,{ok:false,error:"family_power_tenant_required"},origin);
    const roles=await caller.rpc("platform_admin_tenant_roles",{p_tenant_id:tenantId});
    if(roles.error||!(roles.data as Array<{role_key:string}>|null)?.some(r=>r.role_key===roleKey))
      return respond(403,{ok:false,error:"role_not_available"},origin);

    // This identity is deliberately not a deliverable mailbox. Recovery is
    // through authenticated platform administration, not email reset links.
    const internalEmail=`family-power.${username}@login.looksocialmedia.invalid`;
    const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const created=await admin.auth.admin.createUser({
      email:internalEmail, password,email_confirm:true,
      user_metadata:{display_name:displayName,username,credential_kind:"managed_username"},
    });
    if(created.error||!created.data.user)
      return respond(409,{ok:false,error:"username_unavailable_or_auth_rejected"},origin);
    const userId=created.data.user.id;
    const linked=await caller.rpc("platform_add_member",{
      p_tenant_id:tenantId,p_user_id:userId,p_role_key:roleKey,p_status:"active",
    });
    if(linked.error){
      // Avoid leaving a working but unaffiliated password account behind.
      const rollback=await admin.auth.admin.deleteUser(userId);
      if(rollback.error) console.error("managed_account_membership_rollback_failed");
      return respond(409,{ok:false,error:"membership_not_created"},origin);
    }
    return respond(201,{ok:true,username,role_key:roleKey,user_id:userId},origin);
  } catch {
    return respond(400,{ok:false,error:"account_creation_failed"},origin);
  }
});

// Family Power: private one-time, in-person owner enrollment.
// No public self-signup, no email-link dependence, no client-side service key.
// This endpoint remains OFF until its migration is applied and a platform
// operator explicitly issues a 15-minute ticket during identity verification.
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const allowed = new Set([
  "https://crm-revenue-os.vercel.app",
  ...(Deno.env.get("FP_OWNER_ALLOWED_ORIGIN") ? [Deno.env.get("FP_OWNER_ALLOWED_ORIGIN")!] : []),
]);
const reply = (status:number,data:Record<string,unknown>,origin:string) =>
  new Response(JSON.stringify(data),{status,headers:{
    "content-type":"application/json; charset=utf-8","cache-control":"no-store",
    "x-content-type-options":"nosniff",
    "access-control-allow-origin":origin,
    "access-control-allow-methods":"POST, OPTIONS",
    "access-control-allow-headers":"authorization, apikey, x-client-info, content-type",
    "vary":"Origin"
  }});
const emailValid=(x:string)=>x.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x);
const hex=(b:Uint8Array)=>Array.from(b,x=>x.toString(16).padStart(2,"0")).join("");
async function sha(s:string){return hex(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s))));}
const project=Deno.env.get("SUPABASE_URL")??"";
const publishable=Deno.env.get("SUPABASE_ANON_KEY")??"";
const secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
const service=createClient(project,secret,{auth:{persistSession:false,autoRefreshToken:false}});

Deno.serve(async (req:Request) => {
  const origin=req.headers.get("origin")??"";
  if(!allowed.has(origin)) return new Response(null,{status:403,headers:{"cache-control":"no-store"}});
  if(req.method==="OPTIONS")return reply(200,{ok:true},origin);
  if(req.method!=="POST")return reply(405,{ok:false,error:"method_not_allowed"},origin);
  if(Number(req.headers.get("content-length")??0)>4096)return reply(413,{ok:false,error:"request_too_large"},origin);
  let body:Record<string,unknown>;
  try{body=await req.json();}catch{return reply(400,{ok:false,error:"invalid_request"},origin);}
  if(!body||typeof body!=="object")return reply(400,{ok:false,error:"invalid_request"},origin);
  const action=body.action;
  if(action==="issue"){
    const jwt=req.headers.get("authorization")?.replace(/^Bearer\s+/i,"")??"";
    if(!jwt)return reply(401,{ok:false,error:"authentication_required"},origin);
    const {data:identity,error:idError}=await service.auth.getUser(jwt);
    if(idError||!identity.user||!identity.user.email_confirmed_at)
      return reply(403,{ok:false,error:"verified_operator_required"},origin);
    const caller=createClient(project,publishable,{
      global:{headers:{Authorization:"Bearer "+jwt}},
      auth:{persistSession:false,autoRefreshToken:false}
    });
    const access=await caller.rpc("platform_current_access");
    if(access.error||!(access.data as {is_platform_admin?:boolean}|null)?.is_platform_admin)
      return reply(403,{ok:false,error:"platform_admin_required"},origin);
    if(body.identity_confirmed!==true||body.company_controls_email!==true)
      return reply(400,{ok:false,error:"identity_and_email_attestations_required"},origin);
    const email=String(body.email??"").trim().toLowerCase();
    const name=String(body.name??"").trim();
    if(!emailValid(email)||name.length<3||name.length>120)
      return reply(400,{ok:false,error:"invalid_owner_details"},origin);
    const token=hex(crypto.getRandomValues(new Uint8Array(32)));
    const result=await service.rpc("fp_owner_activation_issue",{
      p_email:email,p_name:name,p_hash:await sha(token),p_actor:identity.user.id
    });
    if(result.error){
      const reason=result.error.message.includes("email_already_has_account")?"existing_user":
        result.error.message.includes("activation_cooldown")?"retry_later":
        result.error.message.includes("owner_already_transferred")?"already_activated":"not_ready";
      return reply(409,{ok:false,error:reason},origin);
    }
    // Raw secret appears in this response ONLY; never store, log or email it.
    return reply(200,{ok:true,ticket:token,expires_minutes:15},origin);
  }
  if(action==="claim"){
    const email=String(body.email??"").trim().toLowerCase();
    const ticket=String(body.ticket??"");
    const password=String(body.password??"");
    if(!emailValid(email)||!/^[a-f0-9]{64}$/.test(ticket)
       ||password.length<12||password.length>128)
       return reply(400,{ok:false,error:"invalid_activation"},origin);
    const claim=await service.rpc("fp_owner_activation_claim",{
      p_email:email,p_hash:await sha(ticket)
    });
    if(claim.error||!claim.data)
      return reply(400,{ok:false,error:"invalid_or_expired_activation"},origin);
    const details=claim.data as {claim_id:string;login_email:string;owner_name:string};
    // Email confirmation is an admin-authentication technical flag, not proof
    // of mailbox ownership. The in-person identification is recorded in SQL.
    const created=await service.auth.admin.createUser({
      email:details.login_email,password,email_confirm:true,
      user_metadata:{full_name:details.owner_name},
      app_metadata:{owner_onboarding_method:"in_person",email_ownership_verified:false}
    });
    if(created.error||!created.data.user){
      return reply(409,{ok:false,error:"account_creation_failed_reissue_required"},origin);
    }
    const done=await service.rpc("fp_owner_activation_finish",{
      p_claim:details.claim_id,p_user:created.data.user.id
    });
    if(done.error||done.data!==true){
      // Only the brand-new account from this request is eligible for rollback.
      // A failed rollback is logged without credentials; support must resolve.
      const rollback=await service.auth.admin.deleteUser(created.data.user.id);
      if(rollback.error)console.error("owner_setup_orphan_cleanup_failed");
      return reply(409,{ok:false,error:"activation_incomplete_support_required"},origin);
    }
    return reply(200,{ok:true,message:"Cuenta de propietario creada. Ya puede iniciar sesión."},origin);
  }
  return reply(400,{ok:false,error:"unknown_action"},origin);
});

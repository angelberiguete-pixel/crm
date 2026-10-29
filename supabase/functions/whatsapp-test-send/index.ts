import { createClient } from "@supabase/supabase-js";
import { validateTestWhatsAppDraft, hasVerifiedWhatsAppChannel, metaWhatsAppPayload } from "./policy.ts";

// This function sends real messages to exactly ONE independently authorized
// test recipient, after provider onboarding. Never use it for cold outreach.
const ORIGINS = new Set(["https://crm-revenue-os.vercel.app", "http://localhost:3000"]);
const respond = (origin:string, payload:unknown, status=200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers:{
      "Content-Type":"application/json; charset=utf-8",
      "Access-Control-Allow-Origin":origin,
      "Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info",
      "Access-Control-Allow-Methods":"POST, OPTIONS",
      "Cache-Control":"no-store",
      "Vary":"Origin",
    },
  });
const rejection = (origin:string, code:string, status:number) => respond(origin,{ok:false,error:code},status);

Deno.serve(async req => {
  const origin=req.headers.get("origin")??"";
  if (!ORIGINS.has(origin)) return new Response(JSON.stringify({ok:false,error:"origin_denied"}),{status:403,headers:{"Content-Type":"application/json"}});
  if(req.method==="OPTIONS")return respond(origin,{ok:true});
  if(req.method!=="POST")return rejection(origin,"method_denied",405);

  const authHeader=req.headers.get("authorization")??"";
  const token=/^Bearer (.+)$/i.exec(authHeader)?.[1];
  if (!token || token.length>9000) return rejection(origin,"login_required",401);
  const json=await req.json().catch(()=>null);
  const input=json&&typeof json==="object"&&!Array.isArray(json)?json as Record<string,unknown>:null;
  const tenant=typeof input?.tenant_id==="string"?input.tenant_id:"";
  const requestId=input?.request_id;
  const message=input?.message;
  const metaPhone=Deno.env.get("META_WA_PHONE_NUMBER_ID")??"";
  const recipient=Deno.env.get("META_WA_TEST_RECIPIENT")??"";
  const accessToken=Deno.env.get("META_WA_ACCESS_TOKEN")??"";
  const expectedTenant=Deno.env.get("META_WA_TENANT_ID")??"";
  const graphVersion=Deno.env.get("META_WA_GRAPH_VERSION")??"";
  if (tenant!==expectedTenant || !expectedTenant) return rejection(origin,"tenant_not_authorized",403);
  const bad=validateTestWhatsAppDraft(message,requestId,metaPhone,recipient,tenant);
  if(bad)return rejection(origin,bad,422);
  if(!accessToken || !/^v\d{1,2}\.\d{1,2}$/.test(graphVersion))return rejection(origin,"meta_provider_not_configured",503);
  if(!Deno.env.get("SUPABASE_URL")||!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||!Deno.env.get("SUPABASE_ANON_KEY"))return rejection(origin,"server_not_configured",503);

  const url=Deno.env.get("SUPABASE_URL")!;
  const admin=createClient(url,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{autoRefreshToken:false,persistSession:false}});
  const user=await admin.auth.getUser(token);
  if(user.error || !user.data.user)return rejection(origin,"login_required",401);
  const caller=createClient(url,Deno.env.get("SUPABASE_ANON_KEY")!,{
    auth:{autoRefreshToken:false,persistSession:false},
    global:{headers:{Authorization:"Bearer "+token}},
  });
  const memberships=await caller.rpc("list_my_tenants");
  if(memberships.error)return rejection(origin,"tenant_authorization_failed",403);
  const membership=(Array.isArray(memberships.data)?memberships.data:[]).find(m=>
    m.tenant_id===tenant && m.tenant_slug==="eurevector" && m.membership_role==="owner" && m.is_active===true);
  if(!membership)return rejection(origin,"owner_authorization_required",403);

  const channelQuery=await admin.from("channels")
    .select("provider,status,external_account_id,settings")
    .eq("tenant_id",tenant).eq("provider","whatsapp")
    .eq("external_account_id",metaPhone).eq("status","connected").limit(1).maybeSingle();
  if(channelQuery.error || !hasVerifiedWhatsAppChannel(channelQuery.data,metaPhone))
    return rejection(origin,"whatsapp_not_verified",409);

  const bodyText=(message as string).trim();
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(bodyText));
  const hash=[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,"0")).join("");
  // Insert the unique request ID BEFORE contacting Meta; any repeat is rejected,
  // even if the network failed after Meta accepted the message.
  const attempt=await admin.from("whatsapp_send_attempts").insert({
    request_id:requestId,tenant_id:tenant,actor_user_id:user.data.user.id,
    account_phone_number_id:metaPhone,recipient_e164:recipient,body_sha256:hash,status:"pending"
  });
  if(attempt.error){
    if(attempt.error.code==="23505")return rejection(origin,"request_already_submitted",409);
    return rejection(origin,"outbound_ledger_unavailable",503);
  }

  const mark=async (status:"accepted"|"failed"|"uncertain", code:string|null, id:string|null) =>
    admin.from("whatsapp_send_attempts").update({
      status,failure_code:code,provider_message_id:id,updated_at:new Date().toISOString()
    }).eq("request_id",requestId as string).eq("tenant_id",tenant);
  let response:Response;
  try{
    response=await fetch(
      "https://graph.facebook.com/"+graphVersion+"/"+metaPhone+"/messages",
      {method:"POST",headers:{
        Authorization:"Bearer "+accessToken,"Content-Type":"application/json"
      },body:JSON.stringify(metaWhatsAppPayload(recipient,bodyText)),signal:AbortSignal.timeout(15000)}
    );
  }catch{
    // The request may have been accepted before a network failure. No auto-retry.
    await mark("uncertain","provider_response_unavailable",null);
    return rejection(origin,"delivery_uncertain_do_not_retry",502);
  }

  if(!response.ok){
    await mark("failed","meta_http_"+response.status,null);
    return rejection(origin,"meta_rejected_message",502);
  }
  const result=await response.json().catch(()=>null);
  const providerId=result&&Array.isArray(result.messages)&&typeof result.messages[0]?.id==="string"?result.messages[0].id:null;
  if(!providerId){
    await mark("uncertain","provider_receipt_missing",null);
    return rejection(origin,"delivery_uncertain_do_not_retry",502);
  }
  const stored=await mark("accepted",null,providerId);
  if(stored.error)return respond(origin,{ok:true,provider_accepted:true,recording_warning:true,message_id:providerId});
  return respond(origin,{ok:true,provider_accepted:true,delivery_confirmed:false,message_id:providerId});
});

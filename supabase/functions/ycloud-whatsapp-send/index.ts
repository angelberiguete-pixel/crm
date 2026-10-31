/** YCloud outbound text: authenticated, explicitly human-triggered CRM send.
 * NOT automatically enabled: requires approved connection, YCLOUD_OUTBOUND_ENABLED=true
 * and YCLOUD_API_KEY secret. verify_jwt=true at deploy.
 */
import {createClient} from "npm:@supabase/supabase-js@2.116.0";

const cors={
 "Access-Control-Allow-Origin":"*",
 "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
 "Access-Control-Allow-Methods":"POST, OPTIONS",
 "Cache-Control":"no-store"
};
function json(body:unknown,status=200){
 return new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json",...cors}});
}
function e164(x:unknown):x is string{
 return typeof x==="string" && /^\+[1-9]\d{7,14}$/.test(x);
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (request)=>{
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(request.method!=="POST")return json({error:"method_not_allowed"},405);
 if(Deno.env.get("YCLOUD_OUTBOUND_ENABLED")!=="true")
   return json({error:"provider_send_not_enabled"},503);
 const url=Deno.env.get("SUPABASE_URL")??"";
 const anon=Deno.env.get("SUPABASE_ANON_KEY")??"";
 const serviceRole=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
 const apiKey=Deno.env.get("YCLOUD_API_KEY")??"";
 if(!url||!anon||!serviceRole||!apiKey)
   return json({error:"provider_not_configured"},503);

 const header=request.headers.get("Authorization")??"";
 const match=/^Bearer\s+(.+)$/i.exec(header);
 if(!match)return json({error:"sign_in_required"},401);
 const authDb=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false},
  global:{headers:{Authorization:header}}});
 const {data:{user},error:authErr}=await authDb.auth.getUser(match[1]);
 if(authErr||!user)return json({error:"invalid_session"},401);

 let payload:Record<string,unknown>;
 try{
  if(Number(request.headers.get("content-length")??"0")>20000)return json({error:"too_large"},413);
  const v=await request.json();
  if(!v||typeof v!=="object"||Array.isArray(v))throw Error();
  payload=v as Record<string,unknown>;
 }catch{return json({error:"invalid_request"},400);}
 const {tenantId,conversationId,clientRequestId}=payload;
 const text=typeof payload.text==="string"?payload.text.trim():"";
 if(typeof tenantId!=="string"||!uuid.test(tenantId)
  ||typeof conversationId!=="string"||!uuid.test(conversationId)
  ||typeof clientRequestId!=="string"||!uuid.test(clientRequestId)
  ||text.length<1||text.length>1600)
   return json({error:"invalid_request"},400);

 const db=createClient(url,serviceRole,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:membership,error:membershipErr}=await db.from("memberships")
  .select("role,status").eq("tenant_id",tenantId)
  .eq("user_id",user.id).eq("status","active").maybeSingle();
 if(membershipErr||!membership||
    !["owner","admin","manager","agent"].includes(membership.role))
   return json({error:"not_authorized"},403);
 const {data:conversation,error:convErr}=await db.from("conversations")
  .select("id,tenant_id,channel_id,contact_id,assigned_to,external_thread_id")
  .eq("tenant_id",tenantId).eq("id",conversationId).maybeSingle();
 if(convErr||!conversation||!conversation.contact_id)
   return json({error:"conversation_not_found"},404);
 if(membership.role==="agent"&&conversation.assigned_to!==user.id)
   return json({error:"conversation_not_assigned"},403);

 const [{data:channel},{data:route},{data:contact},{data:inbound}]=await Promise.all([
  db.from("channels").select("id,provider,status")
    .eq("tenant_id",tenantId).eq("id",conversation.channel_id).maybeSingle(),
  db.from("ycloud_whatsapp_routes").select("waba_id,business_phone_e164,is_enabled")
    .eq("tenant_id",tenantId).eq("channel_id",conversation.channel_id)
    .eq("is_enabled",true).maybeSingle(),
  db.from("contacts").select("phone,whatsapp_phone")
    .eq("tenant_id",tenantId).eq("id",conversation.contact_id).maybeSingle(),
  db.from("messages").select("created_at")
    .eq("tenant_id",tenantId).eq("conversation_id",conversationId)
    .eq("direction","inbound").order("created_at",{ascending:false}).limit(1).maybeSingle()
 ]);
 const recipient=contact?.whatsapp_phone||contact?.phone;
 if(channel?.provider!=="whatsapp"||channel.status!=="connected"||
    !route?.is_enabled||!e164(route.business_phone_e164)||
    !e164(recipient)||conversation.external_thread_id!==recipient)
   return json({error:"whatsapp_route_not_verified"},409);

 // Only manually approved free-form replies within the active 24-hour service window.
 // Leave 10-minute headroom for queue/clock delays. Templates need a separate flow.
 const lastMs=Date.parse(inbound?.created_at??"");
 if(!Number.isFinite(lastMs)||Date.now()-lastMs>23*60*60*1000||
    lastMs>Date.now()+60*1000)
    return json({error:"service_window_closed_template_required"},409);

 // Reserve outbound ID before hitting a billable provider API.
 // A repeated clientRequestId never causes a second send.
 const requestMarker="ycloud-pending:"+clientRequestId;
 const {data:pending,error:pendingErr}=await db.from("messages").insert({
  tenant_id:tenantId,conversation_id:conversationId,
  direction:"outbound",sender_type:"user",sender_user_id:user.id,
  external_message_id:requestMarker,message_type:"text",body:text,status:"created",
  metadata:{provider:"ycloud",client_request_id:clientRequestId,
   human_approved:true,external_thread_id:conversation.external_thread_id}
 }).select("id").single();
 if(pendingErr||!pending)
   return json({error:"duplicate_or_unavailable"},409);

 let ok=false,providerId:string|null=null;
 try{
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),9000);
  try{
   const response=await fetch("https://api.ycloud.com/v2/whatsapp/messages",{
    method:"POST",signal:controller.signal,
    headers:{"X-API-Key":apiKey,"Content-Type":"application/json"},
    body:JSON.stringify({
      from:route.business_phone_e164,to:recipient,type:"text",
      text:{body:text,preview_url:false},externalId:pending.id
    })
   });
   ok=response.ok;
   if(ok){
    const result=await response.json().catch(()=>({}));
    providerId=typeof result?.id==="string"&&result.id.length<=256?result.id:null;
   }
  }finally{clearTimeout(timeout);}
 }catch{
  // Network ambiguity: do NOT retry automatically; it may have been accepted.
 }
 const {error:saveErr}=await db.from("messages").update({
  status:ok?"queued":"failed",
  ...(ok&&providerId?{external_message_id:providerId}:{}),
  metadata:{provider:"ycloud",client_request_id:clientRequestId,
    human_approved:true,provider_accepted:ok,
    requires_status_confirmation:true,send_ambiguous:!ok}
 }).eq("id",pending.id).eq("tenant_id",tenantId);
 if(saveErr)console.error("ycloud_send_tracking_update_failed",saveErr.code??"db_error");
 if(!ok)return json({error:"provider_send_unconfirmed_review_before_retry"},502);
 return json({accepted:true,queued:true,messageId:pending.id});
});

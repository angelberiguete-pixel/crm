/** Outbound SMS adapter for httpSMS. Human-initiated replies only.
 * Requires HTTPSMS_OUTBOUND_ENABLED=true, HTTPSMS_API_KEY and a verified server-provisioned route.
 * Never accepts an arbitrary sender or recipient number from a browser.
 * Deploy with Supabase JWT verification enabled.
 */
import {createClient} from "npm:@supabase/supabase-js@2.116.0";

const headers={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Cache-Control":"no-store"
};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const e164=(value:unknown):value is string=>
  typeof value==="string" && /^\+[1-9]\d{7,14}$/.test(value);
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{
  status,headers:{"Content-Type":"application/json",...headers}
});

Deno.serve(async request=>{
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers});
  if(request.method!=="POST")return json({error:"method_not_allowed"},405);
  // Keep fail-closed even if another tenant's route is accidentally provisioned.
  if(Deno.env.get("HTTPSMS_OUTBOUND_ENABLED")!=="true")
    return json({error:"sms_send_not_enabled"},503);
  const url=Deno.env.get("SUPABASE_URL")??"";
  const anon=Deno.env.get("SUPABASE_ANON_KEY")??"";
  const serviceRole=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
  const apiKey=Deno.env.get("HTTPSMS_API_KEY")??"";
  if(!url||!anon||!serviceRole||!apiKey)
    return json({error:"sms_gateway_not_configured"},503);

  const bearer=request.headers.get("authorization")??"";
  const match=/^Bearer\s+(.+)$/i.exec(bearer);
  if(!match)return json({error:"sign_in_required"},401);
  const authDb=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false},
    global:{headers:{Authorization:bearer}}});
  const {data:{user},error:authError}=await authDb.auth.getUser(match[1]);
  if(authError||!user)return json({error:"invalid_session"},401);

  let body:Record<string,unknown>;
  try{
    if(Number(request.headers.get("content-length")??"0")>6000)return json({error:"too_large"},413);
    const parsed=await request.json();
    if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw Error();
    body=parsed as Record<string,unknown>;
  }catch{return json({error:"invalid_request"},400);}
  const {tenantId,conversationId,clientRequestId}=body;
  const text=typeof body.text==="string"?body.text.trim():"";
  if(typeof tenantId!=="string"||!uuid.test(tenantId)
    ||typeof conversationId!=="string"||!uuid.test(conversationId)
    ||typeof clientRequestId!=="string"||!uuid.test(clientRequestId)
    ||text.length<1||text.length>480)
    return json({error:"invalid_request"},400);

  const db=createClient(url,serviceRole,{auth:{persistSession:false,autoRefreshToken:false}});
  const [{data:membership},{data:tenant},{data:conversation}]=await Promise.all([
    db.from("memberships").select("role,status").eq("tenant_id",tenantId)
      .eq("user_id",user.id).eq("status","active").maybeSingle(),
    db.from("tenants").select("status").eq("id",tenantId).maybeSingle(),
    db.from("conversations")
      .select("id,channel_id,contact_id,assigned_to,external_thread_id")
      .eq("tenant_id",tenantId).eq("id",conversationId).maybeSingle()
  ]);
  if(!membership||tenant?.status!=="active"||
     !["owner","admin","manager","agent"].includes(membership.role))
    return json({error:"not_authorized"},403);
  if(!conversation?.contact_id)return json({error:"conversation_not_found"},404);
  if(membership.role==="agent"&&conversation.assigned_to!==user.id)
    return json({error:"conversation_not_assigned"},403);

  const [{data:channel},{data:route},{data:contact},{data:lastInbound},{data:recentSends,error:recentError}]=await Promise.all([
    db.from("channels").select("provider,status").eq("tenant_id",tenantId)
      .eq("id",conversation.channel_id).maybeSingle(),
    db.from("sms_gateway_routes").select("sender_e164,enabled,verified_at")
      .eq("tenant_id",tenantId).eq("channel_id",conversation.channel_id)
      .eq("enabled",true).maybeSingle(),
    db.from("contacts").select("phone,whatsapp_phone,metadata")
      .eq("tenant_id",tenantId).eq("id",conversation.contact_id).maybeSingle(),
    db.from("messages").select("body,created_at").eq("tenant_id",tenantId)
      .eq("conversation_id",conversationId).eq("direction","inbound")
      .order("created_at",{ascending:false}).limit(1).maybeSingle(),
    db.from("messages").select("id").eq("tenant_id",tenantId)
      .eq("direction","outbound")
      .gte("created_at",new Date(Date.now()-24*60*60*1000).toISOString())
      .contains("metadata",{provider:"httpsms"})
      .limit(20)
  ]);
  const recipient=conversation.external_thread_id;
  const contactMatches=recipient===contact?.phone||recipient===contact?.whatsapp_phone;
  if(channel?.provider!=="sms"||channel.status!=="connected"||
    !route?.enabled||!route.verified_at||!e164(route.sender_e164)||
    !e164(recipient)||!contactMatches)
    return json({error:"sms_route_unverified"},409);
  // Reply only after a contact has initiated the SMS conversation.
  const lastMs=Date.parse(lastInbound?.created_at??"");
  if(!Number.isFinite(lastMs)||Date.now()-lastMs>30*86400000||
     lastMs>Date.now()+60000)
    return json({error:"no_recent_inbound_consent"},409);
  if(contact?.metadata?.sms_opted_out===true ||
    /^\s*(stop|baja|cancelar|unsubscribe)\s*$/i.test(lastInbound?.body??""))
    return json({error:"sms_opted_out"},409);
  if(recentError||!recentSends||recentSends.length>=20)
    return json({error:"sms_daily_limit_or_unavailable"},429);

  // Unique index guarantees that repeated requests cannot produce two sends.
  const {data:pending,error:pendingError}=await db.from("messages").insert({
    tenant_id:tenantId,conversation_id:conversationId,
    direction:"outbound",sender_type:"user",sender_user_id:user.id,
    external_message_id:"httpsms-pending:"+clientRequestId,
    message_type:"text",body:text,status:"created",
    metadata:{provider:"httpsms",client_request_id:clientRequestId,human_approved:true}
  }).select("id").single();
  if(pendingError||!pending)return json({error:"duplicate_or_unavailable"},409);

  let accepted=false,providerId:string|null=null;
  try{
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),9000);
    try{
      const response=await fetch("https://api.httpsms.com/v1/messages/send",{
        method:"POST",signal:controller.signal,
        headers:{"x-api-key":apiKey,"Content-Type":"application/json","Accept":"application/json"},
        body:JSON.stringify({from:route.sender_e164,to:recipient,content:text,request_id:clientRequestId})
      });
      if(response.ok){
        const result=await response.json().catch(()=>null);
        accepted=result?.status==="success"&&typeof result?.data?.id==="string";
        if(accepted)providerId=result.data.id.slice(0,200);
      }
    }finally{clearTimeout(timer);}
  }catch{
    // Unknown network outcome: never retry automatically.
  }
  const {error:trackingError}=await db.from("messages").update({
    status:accepted?"queued":"failed",
    ...(accepted&&providerId?{external_message_id:providerId}:{}),
    metadata:{provider:"httpsms",client_request_id:clientRequestId,human_approved:true,
      provider_accepted:accepted,delivery_unconfirmed:true,send_ambiguous:!accepted}
  }).eq("tenant_id",tenantId).eq("id",pending.id);
  if(trackingError)console.error("httpsms_tracking_error",trackingError.code??"db_error");
  if(!accepted)return json({error:"sms_unconfirmed_do_not_retry_blindly"},502);
  return json({accepted:true,queued:true,messageId:pending.id});
});

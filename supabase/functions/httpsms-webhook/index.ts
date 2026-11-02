/** Signed httpSMS webhook: inbound SMS and delivery updates.
 * Configure HTTPSMS_WEBHOOK_SIGNING_KEY only as a Supabase secret.
 * Deploy with verify_jwt=false because httpSMS sends its own HS256 Bearer JWT.
 * No tenant ID supplied by the webhook is trusted: the verified Android sender is mapped server-side.
 */
import {createClient} from "npm:@supabase/supabase-js@2.116.0";
import {jwtVerify} from "npm:jose@5.10.0";

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}
});
const e164=(v:unknown):v is string=>typeof v==="string"&&/^\+[1-9]\d{7,14}$/.test(v);
const events=new Set([
  "message.phone.received","message.phone.sent","message.phone.delivered",
  "message.send.failed","message.send.expired"
]);
const mapStatus:Record<string,string>={
  "message.phone.sent":"sent","message.phone.delivered":"delivered",
  "message.send.failed":"failed","message.send.expired":"failed"
};

Deno.serve(async request=>{
  if(request.method!=="POST")return json({error:"method_not_allowed"},405);
  if(Deno.env.get("HTTPSMS_WEBHOOK_ENABLED")!=="true")return json({error:"disabled"},503);
  const secret=Deno.env.get("HTTPSMS_WEBHOOK_SIGNING_KEY")??"";
  const dbUrl=Deno.env.get("SUPABASE_URL")??"";
  const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
  if(secret.length<32||!dbUrl||!service)return json({error:"not_configured"},503);

  const bearer=/^Bearer\s+(.+)$/i.exec(request.headers.get("authorization")??"");
  if(!bearer)return json({error:"unauthorized"},401);
  try{
    await jwtVerify(bearer[1],new TextEncoder().encode(secret),{algorithms:["HS256"]});
  }catch{return json({error:"invalid_signature"},401);}
  if(Number(request.headers.get("content-length")??"0")>16000)
    return json({error:"too_large"},413);
  let cloud:Record<string,unknown>;
  try{
    const value=await request.json();
    if(!value||typeof value!=="object"||Array.isArray(value))throw Error();
    cloud=value as Record<string,unknown>;
  }catch{return json({error:"invalid_json"},400);}
  const eventType=cloud.type;
  const eventId=cloud.id;
  const data=cloud.data;
  if(typeof eventType!=="string"||!events.has(eventType)
    ||eventType!==request.headers.get("X-Event-Type")
    ||typeof eventId!=="string"||eventId.length>200||eventId.length===0
    ||cloud.specversion!=="1.0"||!data||typeof data!=="object"||Array.isArray(data))
    return json({error:"invalid_event"},400);

  const sms=data as Record<string,unknown>;
  const owner=sms.owner;
  const contactPhone=sms.contact;
  if(!e164(owner))return json({error:"invalid_sender"},400);
  const db=createClient(dbUrl,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:route,error:routeError}=await db.from("sms_gateway_routes")
    .select("tenant_id,channel_id,enabled,verified_at")
    .eq("sender_e164",owner).eq("enabled",true).maybeSingle();
  if(routeError)return json({error:"route_lookup_failed"},503);
  if(!route?.verified_at)return json({ok:true,ignored:"unmapped_sender"});
  const {data:channel}=await db.from("channels").select("provider,status")
    .eq("id",route.channel_id).eq("tenant_id",route.tenant_id).maybeSingle();
  if(channel?.provider!=="sms"||channel.status!=="connected")
    return json({ok:true,ignored:"inactive_channel"});

  // Event-level idempotency. Incomplete events may be retried safely.
  const {error:receiptError}=await db.from("sms_gateway_webhook_receipts").upsert({
    event_id:eventId,tenant_id:route.tenant_id,event_type:eventType,
    provider_message_id:typeof sms.message_id==="string"?sms.message_id.slice(0,200):null,
    processed:false
  },{onConflict:"event_id",ignoreDuplicates:true});
  if(receiptError)return json({error:"receipt_unavailable"},503);
  const {data:receipt}=await db.from("sms_gateway_webhook_receipts")
    .select("processed,tenant_id,event_type").eq("event_id",eventId).maybeSingle();
  if(!receipt||receipt.tenant_id!==route.tenant_id||receipt.event_type!==eventType)
    return json({error:"event_collision"},409);
  if(receipt.processed)return json({ok:true,duplicate:true});

  if(eventType==="message.phone.received"){
    if(!e164(contactPhone)||typeof sms.content!=="string"||
      sms.content.length>1600||!sms.content.trim())
      return json({error:"invalid_inbound"},400);
    // Don't silently generate customer profiles or mix ambiguous phone matches.
    const {data:contacts,error:contactsError}=await db.from("contacts")
      .select("id,metadata").eq("tenant_id",route.tenant_id)
      .or("phone.eq."+contactPhone+",whatsapp_phone.eq."+contactPhone).limit(2);
    if(contactsError)return json({error:"contact_lookup_failed"},503);
    if(contacts?.length!==1)return json({ok:true,ignored:"unmatched_contact"});
    const customer=contacts[0];
    const {error:conversationError}=await db.from("conversations").upsert({
      tenant_id:route.tenant_id,channel_id:route.channel_id,contact_id:customer.id,
      external_thread_id:contactPhone,subject:"SMS",status:"open"
    },{onConflict:"tenant_id,channel_id,external_thread_id",ignoreDuplicates:true});
    if(conversationError)return json({error:"conversation_unavailable"},503);
    const {data:conversation}=await db.from("conversations")
      .select("id").eq("tenant_id",route.tenant_id).eq("channel_id",route.channel_id)
      .eq("external_thread_id",contactPhone).maybeSingle();
    if(!conversation)return json({error:"conversation_unavailable"},503);
    const externalId=typeof sms.message_id==="string"&&sms.message_id.length<200
      ?sms.message_id:"httpsms-event:"+eventId;
    const {error:messageError}=await db.from("messages").upsert({
      tenant_id:route.tenant_id,conversation_id:conversation.id,
      direction:"inbound",sender_type:"contact",sender_contact_id:customer.id,
      external_message_id:externalId,message_type:"text",body:sms.content,
      status:"received",metadata:{provider:"httpsms",event_id:eventId}
    },{onConflict:"tenant_id,conversation_id,external_message_id",ignoreDuplicates:true});
    if(messageError)return json({error:"message_unavailable"},503);
    if(/^\s*(stop|baja|cancelar|unsubscribe)\s*$/i.test(sms.content)){
      const prev=customer.metadata&&typeof customer.metadata==="object"
        ?customer.metadata as Record<string,unknown>:{};
      await db.from("contacts").update({metadata:{...prev,sms_opted_out:true,
        sms_optout_source:"inbound_keyword"}}).eq("tenant_id",route.tenant_id)
        .eq("id",customer.id);
    }
  }else{
    if(typeof sms.message_id!=="string"||sms.message_id.length>200)
      return json({error:"invalid_message_id"},400);
    // A provider ID is only searched inside the mapped tenant.
    const update:Record<string,unknown>={status:mapStatus[eventType]};
    if(eventType==="message.phone.delivered")update.delivered_at=new Date().toISOString();
    if(eventType==="message.phone.sent")update.sent_at=new Date().toISOString();
    const {error:messageError}=await db.from("messages").update(update)
      .eq("tenant_id",route.tenant_id).eq("external_message_id",sms.message_id)
      .eq("direction","outbound");
    if(messageError)return json({error:"status_update_failed"},503);
  }
  const {error:markError}=await db.from("sms_gateway_webhook_receipts")
    .update({processed:true}).eq("event_id",eventId).eq("tenant_id",route.tenant_id);
  if(markError)return json({error:"receipt_update_failed"},503);
  return json({ok:true});
});

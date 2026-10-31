/** Signed YCloud WhatsApp webhook receiver for the EXISTING multi-tenant CRM.
 * Receive-only. No Make, paid AI, message sending, client-facing API keys or billing.
 * Subscribed events: whatsapp.inbound_message.received (text).
 * Deploy only after review with verify_jwt=false and YCLOUD_WEBHOOK_SECRET set.
 */
import {createClient} from "npm:@supabase/supabase-js@2.116.0";
import {parseYCloudInboundText,parseYCloudInboundMedia,parseYCloudOutboundStatus,type InboundYCloudMedia} from "../../../lib/ycloud-whatsapp-webhook.ts";
const enc=new TextEncoder();
function json(value:unknown,status=200){
 return new Response(JSON.stringify(value),{status,
  headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
}
function bytesOfHex(hex:string):Uint8Array{
 const bytes=new Uint8Array(hex.length/2);
 for(let i=0;i<bytes.length;i++)bytes[i]=parseInt(hex.slice(i*2,i*2+2),16);
 return bytes;
}
function safeEquals(a:Uint8Array,b:Uint8Array):boolean{
 if(a.length!==b.length)return false;
 let diff=0;
 for(let i=0;i<a.length;i++)diff|=a[i]^b[i];
 return diff===0;
}
async function validSignature(body:string,header:string,secret:string):Promise<boolean>{
 const match=/^t=(\d{9,13}),s=([a-fA-F0-9]{64})$/.exec(header.replace(/\s+/g,""));
 if(!match)return false;
 const timestamp=Number(match[1]);
 if(!Number.isSafeInteger(timestamp)||
    Math.abs(Math.floor(Date.now()/1000)-timestamp)>600)return false;
 const key=await crypto.subtle.importKey("raw",enc.encode(secret),
    {name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const expected=new Uint8Array(await crypto.subtle.sign("HMAC",key,enc.encode(match[1]+"."+body)));
 return safeEquals(expected,bytesOfHex(match[2].toLowerCase()));
}

const MAX_INBOUND_MEDIA_BYTES=8*1024*1024;
function validFileMagic(bytes:Uint8Array,mime:string):boolean{
 if(mime==="application/pdf")return bytes.length>5&&bytes[0]===37&&bytes[1]===80&&bytes[2]===68&&bytes[3]===70&&bytes[4]===45;
 if(mime==="image/jpeg")return bytes.length>4&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 if(mime==="image/png")return bytes.length>8&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v);
 if(mime==="image/webp")return bytes.length>12&&
   [82,73,70,70].every((v,i)=>bytes[i]===v)&&[87,69,66,80].every((v,i)=>bytes[i+8]===v);
 return false;
}
async function downloadVerifiedMedia(media:InboundYCloudMedia,apiKey:string):Promise<Uint8Array>{
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
 try{
  // The media URL was already checked against an exact YCloud origin/path.
  // Redirects are prohibited to prevent SSRF and credential disclosure.
  const response=await fetch(media.downloadUrl,{
   method:"GET",redirect:"error",signal:controller.signal,headers:{"X-API-Key":apiKey}
  });
  if(!response.ok||!response.body)throw Error("provider_download_unavailable");
  const contentLength=Number(response.headers.get("content-length")??"0");
  if(contentLength>MAX_INBOUND_MEDIA_BYTES)throw Error("media_exceeds_private_storage_limit");
  const chunks:Uint8Array[]= [];let size=0;
  const reader=response.body.getReader();
  try{
   while(true){
    const {done,value}=await reader.read();if(done)break;
    size+=value.byteLength;
    if(size>MAX_INBOUND_MEDIA_BYTES)throw Error("media_exceeds_private_storage_limit");
    chunks.push(value);
   }
  }finally{await reader.cancel().catch(()=>{});}
  const bytes=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  if(!validFileMagic(bytes,media.mimeType))throw Error("provider_media_type_mismatch");
  if(media.sha256){
    const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",bytes));
    const hash=btoa(String.fromCharCode(...digest));
    if(hash!==media.sha256)throw Error("provider_media_checksum_mismatch");
  }
  return bytes;
 }finally{clearTimeout(timeout);}
}

Deno.serve(async request=>{
 if(request.method!=="POST")return json({error:"method_not_allowed"},405);
 const secret=Deno.env.get("YCLOUD_WEBHOOK_SECRET")??"";
 const endpointId=Deno.env.get("YCLOUD_WEBHOOK_ENDPOINT_ID")??"";
 const url=Deno.env.get("SUPABASE_URL")??"";
 const serviceRole=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
 if(secret.length<32||!url||!serviceRole)return json({error:"not_configured"},503);
 if(endpointId && request.headers.get("x-webhook-endpoint-id")!==endpointId)
   return json({error:"invalid_endpoint"},401);
 const length=Number(request.headers.get("content-length")??"0");
 if(!Number.isFinite(length)||length>262144)return json({error:"too_large"},413);
 const bytes=new Uint8Array(await request.arrayBuffer());
 if(bytes.length<2||bytes.length>262144)return json({error:"invalid_size"},413);
 const raw=new TextDecoder().decode(bytes);
 const signature=request.headers.get("ycloud-signature")??"";
 if(!(await validSignature(raw,signature,secret)))return json({error:"invalid_signature"},401);
 let event:unknown;
 try{event=JSON.parse(raw);}
 catch{return json({error:"invalid_json"},400);}
 const inbound=parseYCloudInboundText(event);
 const inboundMedia= !inbound ? parseYCloudInboundMedia(event) : null;
 const outgoing= !inbound&&!inboundMedia ? parseYCloudOutboundStatus(event) : null;
 if(!inbound&&!inboundMedia&&!outgoing)return json({received:true,processed:false});
 const db=createClient(url,serviceRole,{auth:{persistSession:false,autoRefreshToken:false}});
 if(outgoing){
   const {data,error}=await db.rpc("ycloud_mark_verified_message_status",{
     p_waba_id:outgoing.wabaId,p_business_phone:outgoing.businessPhone,
     p_external_message_id:outgoing.externalMessageId,p_new_status:outgoing.status
   });
   if(error){console.error("ycloud_status_failed",error.code??"db_error");return json({error:"retry_later"},503);}
   return json({received:true,status:data});
 }

 if(inboundMedia){
   // Explicit pilot gate: no provider downloads before Family Power opts in.
   if(Deno.env.get("YCLOUD_INBOUND_MEDIA_ENABLED")!=="true")
     return json({received:true,processed:false,reason:"inbound_media_not_enabled"});
   const providerKey=Deno.env.get("YCLOUD_API_KEY")??"";
   if(!providerKey)return json({error:"media_provider_not_configured"},503);

   const received=await db.rpc("ingest_verified_ycloud_whatsapp_text",{
     p_waba_id:inboundMedia.wabaId,
     p_business_phone:inboundMedia.businessPhone,
     p_message_id:inboundMedia.externalMessageId,
     p_from:inboundMedia.from,
     p_contact_name:inboundMedia.contactName,
     p_body:inboundMedia.kind==="image"?"Imagen recibida · archivo privado en preparación":
       "Documento PDF recibido · archivo privado en preparación"
   });
   if(received.error){console.error("ycloud_media_ingest_error",received.error.code??"db_error");return json({error:"retry_later"},503);}
   if(received.data==="unverified_route")return json({received:true,processed:false,reason:"unverified_route"});
   if(!["stored","duplicate"].includes(received.data))return json({error:"media_ingest_rejected"},400);

   // Independently resolve the verified business route and exact source message.
   const {data:route,error:routeErr}=await db.from("ycloud_whatsapp_routes")
     .select("tenant_id,channel_id").eq("waba_id",inboundMedia.wabaId)
     .eq("business_phone_e164",inboundMedia.businessPhone)
     .eq("is_enabled",true).not("verified_at","is",null).maybeSingle();
   if(routeErr||!route)return json({error:"route_not_verified"},409);
   const {data:message,error:messageErr}=await db.from("messages")
     .select("id,conversation_id,tenant_id,metadata").eq("tenant_id",route.tenant_id)
     .eq("external_message_id",inboundMedia.externalMessageId)
     .eq("direction","inbound").maybeSingle();
   if(messageErr||!message)return json({error:"message_not_found"},503);
   const {data:conversation}=await db.from("conversations")
     .select("id").eq("tenant_id",route.tenant_id).eq("channel_id",route.channel_id)
     .eq("id",message.conversation_id).eq("external_thread_id",inboundMedia.from).maybeSingle();
   if(!conversation)return json({error:"conversation_mismatch"},409);

   const extension=inboundMedia.mimeType==="application/pdf"?"pdf":
     inboundMedia.mimeType==="image/png"?"png":inboundMedia.mimeType==="image/webp"?"webp":"jpg";
   const objectPath=route.tenant_id+"/whatsapp-inbound/"+message.id+"/"+
     inboundMedia.kind+"-"+inboundMedia.providerMediaId+"."+extension;
   const {data:existing}=await db.from("message_attachments").select("id")
     .eq("tenant_id",route.tenant_id).eq("message_id",message.id)
     .eq("storage_bucket","crm-documents").eq("storage_path",objectPath).maybeSingle();
   if(!existing){
     let fileBytes:Uint8Array;
     try{fileBytes=await downloadVerifiedMedia(inboundMedia,providerKey);}
     catch{console.error("ycloud_media_download_or_checksum_failed");return json({error:"media_download_unconfirmed"},503);}
     const {error:uploadError}=await db.storage.from("crm-documents")
       .upload(objectPath,new Blob([fileBytes.slice().buffer],{type:inboundMedia.mimeType}),{
         contentType:inboundMedia.mimeType,cacheControl:"0",upsert:false
       });
     if(uploadError&&!String(uploadError.message).includes("already exists")){
       console.error("ycloud_media_private_storage_failed");
       return json({error:"media_storage_unavailable"},503);
     }
     const {error:attachmentError}=await db.from("message_attachments").insert({
       tenant_id:route.tenant_id,message_id:message.id,kind:inboundMedia.kind,
       storage_bucket:"crm-documents",storage_path:objectPath,external_url:null,
       file_name:inboundMedia.filename,mime_type:inboundMedia.mimeType,
       size_bytes:fileBytes.byteLength,checksum_sha256:inboundMedia.sha256,
       metadata:{source:"ycloud_verified_webhook",media_id:inboundMedia.providerMediaId}
     });
     if(attachmentError&&attachmentError.code!=="23505"){
       console.error("ycloud_media_metadata_store_failed",attachmentError.code??"db_error");
       return json({error:"media_metadata_unavailable"},503);
     }
   }
   const oldMeta=(message.metadata&&typeof message.metadata==="object"&&!Array.isArray(message.metadata))
     ?message.metadata as Record<string,unknown>:{};
   const {error:updateErr}=await db.from("messages").update({
     message_type:inboundMedia.kind,
     body:inboundMedia.caption||(
       inboundMedia.kind==="image"?"Imagen recibida":"Documento PDF recibido"),
     metadata:{...oldMeta,verified_media_stored:true,provider:"whatsapp",
       provider_adapter:"ycloud",media_id:inboundMedia.providerMediaId}
   }).eq("id",message.id).eq("tenant_id",route.tenant_id);
   if(updateErr)return json({error:"message_media_update_unavailable"},503);
   return json({received:true,stored:true,kind:inboundMedia.kind});
 }

 if(!inbound)return json({received:true,processed:false});
 const {data,error}=await db.rpc("ingest_verified_ycloud_whatsapp_text",{
   p_waba_id:inbound.wabaId,
   p_business_phone:inbound.businessPhone,
   p_message_id:inbound.externalMessageId,
   p_from:inbound.from,
   p_contact_name:inbound.contactName,
   p_body:inbound.body
 });
 if(error){console.error("ycloud_webhook_ingest_failed",error.code??"db_error");return json({error:"retry_later"},503);}
 if(!["stored","duplicate","unverified_route","invalid_message"].includes(data))
   return json({error:"unexpected_result"},503);
 // Only a verified and stored source message may create attribution or a quote action.
 if(data==="stored"||data==="duplicate"){
   if(inbound.replyId){
     const action=await db.rpc("marketing_record_verified_ycloud_quote_reply",{
       p_waba_id:inbound.wabaId,p_business_phone:inbound.businessPhone,
       p_message_id:inbound.externalMessageId,p_reply_id:inbound.replyId
     });
     if(action.error){console.error("ycloud_button_record_failed",action.error.code??"db_error");return json({error:"retry_later"},503);}
   }
   if(inbound.ctwaClickId){
     const attribution=await db.rpc("marketing_record_verified_ycloud_attribution",{
       p_waba_id:inbound.wabaId,p_business_phone:inbound.businessPhone,
       p_message_id:inbound.externalMessageId,p_ctwa_click_id:inbound.ctwaClickId
     });
     if(attribution.error){console.error("ycloud_ctwa_record_failed",attribution.error.code??"db_error");return json({error:"retry_later"},503);}
   }
 }
 return json({received:true,stored:data==="stored"});
});

/** Signed YCloud WhatsApp webhook receiver for the EXISTING multi-tenant CRM.
 * Receive-only. No Make, paid AI, message sending, client-facing API keys or billing.
 * Subscribed events: whatsapp.inbound_message.received (text).
 * Deploy only after review with verify_jwt=false and YCLOUD_WEBHOOK_SECRET set.
 */
import {createClient} from "npm:@supabase/supabase-js@2.116.0";
import {parseYCloudInboundText} from "../../../lib/ycloud-whatsapp-webhook.ts";
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
 // No bulk historical imports, business app sync, media or outbound status changes.
 if(!inbound)return json({received:true,processed:false});
 const db=createClient(url,serviceRole,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await db.rpc("ingest_verified_ycloud_whatsapp_text",{
  p_waba_id:inbound.wabaId,
  p_business_phone:inbound.businessPhone,
  p_message_id:inbound.externalMessageId,
  p_from:inbound.from,
  p_contact_name:inbound.contactName,
  p_body:inbound.body
 });
 if(error){
  // No log of raw payload, customer phone, names, message contents or secrets.
  console.error("ycloud_webhook_ingest_failed",error.code??"db_error");
  return json({error:"retry_later"},503);
 }
 if(!["stored","duplicate","unverified_route","invalid_message"].includes(data))
  return json({error:"unexpected_result"},503);
 return json({received:true,stored:data==="stored"});
});

/** Official 360dialog Channel Webhook receiver (not Meta's HMAC webhook).
 * 360dialog Hub must set Authorization: Bearer <random secret> in Channel Webhook headers.
 * Never reuse Meta's unsigned callback or send secrets to the browser.
 * This is deliberately receive-only: no automatic replies, historical bulk import or paid AI.
 */
import {createClient} from "npm:@supabase/supabase-js@2.116.0";
import {normalize360DialogWhatsAppTexts} from "../../../lib/360dialog-webhook.ts";
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}
});
const encoder=new TextEncoder();
function equal(a:string,b:string):boolean{
 const x=encoder.encode(a),y=encoder.encode(b);
 if(x.length!==y.length)return false;
 let v=0;for(let i=0;i<x.length;i++)v|=x[i]^y[i];
 return v===0;
}
Deno.serve(async request=>{
 if(request.method!=="POST")return response({error:"method_not_allowed"},405);
 const secret=Deno.env.get("D360_WEBHOOK_BEARER_TOKEN")??"";
 const baseUrl=Deno.env.get("SUPABASE_URL")??"";
 const serviceRole=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
 if(secret.length<32||!baseUrl||!serviceRole)return response({error:"not_configured"},503);
 const provided=request.headers.get("authorization")??"";
 if(!equal(provided,"Bearer "+secret))return response({error:"unauthorized"},401);
 const size=Number(request.headers.get("content-length")??"0");
 if(!Number.isFinite(size)||size>262144)return response({error:"too_large"},413);
 const bytes=new Uint8Array(await request.arrayBuffer());
 if(bytes.length>262144||bytes.length<2)return response({error:"invalid_size"},413);
 let payload:unknown;
 try{payload=JSON.parse(new TextDecoder().decode(bytes));}
 catch{return response({error:"invalid_json"},400);}
 const items=normalize360DialogWhatsAppTexts(payload);
 if(items.length===0)return response({received:true});
 const db=createClient(baseUrl,serviceRole,{auth:{persistSession:false,autoRefreshToken:false}});
 for(const item of items){
  // Route is derived only from matching verified WABA+phone IDs in server-controlled DB.
  const [method,params]=item.kind==="inbound"
   ?["ingest_verified_whatsapp_text",{
     p_phone_number_id:item.phoneNumberId,p_waba_id:item.wabaId,
     p_message_id:item.externalMessageId,p_from:item.recipient,
     p_contact_name:item.contactName,p_body:item.body
    }]
   :["ingest_verified_whatsapp_echo",{
     p_phone_number_id:item.phoneNumberId,p_waba_id:item.wabaId,
     p_message_id:item.externalMessageId,p_recipient:item.recipient,p_body:item.body
    }];
  const result=await db.rpc(method,params);
  if(result.error){
   // Do not log message content, phone numbers, IDs, bearer token or contacts.
   console.error("d360_ingest_error",result.error.code??"db_error");
   return response({error:"retry_later"},503);
  }
  if(!["stored","duplicate","unverified_route","invalid_message"].includes(result.data))
   return response({error:"unexpected_router_response"},503);
 }
 return response({received:true});
});

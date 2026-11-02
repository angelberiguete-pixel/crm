/** Family Power inbound CALL ANALYZED webhook; receive-only, disabled until verified routes.
 * Deployment requires verify_jwt=false ONLY with HMAC + RETELL_WEBHOOK_API_KEY secret.
 * Never sends calls/messages, invokes voice AI or stores audio/transcripts.
 */
import {createClient} from "npm:@supabase/supabase-js@2.116.0";
import {parseRetellAnalyzedCall} from "../../../lib/voice-call-contract.ts";
import {verifyRetellWebhookSignature} from "../../../lib/retell-webhook-signature.ts";

function json(value:unknown,status=200){
 return new Response(JSON.stringify(value),{status,headers:{
  "Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
}
Deno.serve(async request=>{
 if(request.method!=="POST")return json({error:"method_not_allowed"},405);
 const key=Deno.env.get("RETELL_WEBHOOK_API_KEY");
 const url=Deno.env.get("SUPABASE_URL");
 const role=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!key||key.length<32||!url||!role)return json({error:"not_configured"},503);
 const claimedLength=Number(request.headers.get("content-length")??"0");
 if(!Number.isFinite(claimedLength)||claimedLength>262_144)return json({error:"too_large"},413);
 let body:string;
 try{
  const bytes=new Uint8Array(await request.arrayBuffer());
  if(bytes.length<2||bytes.length>262_144)return json({error:"invalid_size"},413);
  body=new TextDecoder("utf-8",{fatal:true}).decode(bytes);
 }catch{return json({error:"invalid_encoding"},400);}
 const signature=request.headers.get("x-retell-signature");
 if(!(await verifyRetellWebhookSignature(body,signature,key)))
   return json({error:"invalid_signature"},401);
 let event:unknown;
 try{event=JSON.parse(body);}catch{return json({error:"invalid_json"},400);}
 const call=parseRetellAnalyzedCall(event);
 if(!call||call.direction!=="inbound")
   return json({received:true,processed:false});
 const db=createClient(url,role,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await db.rpc("ingest_verified_retell_voice_call",{
  p_call_id:call.callId,p_agent_id:call.agentId,p_from_number:call.fromNumber,
  p_to_number:call.toNumber,p_summary:call.summary
 });
 if(error){
  console.error("voice_ingest_failed",error.code??"db_error");
  return json({error:"retry_later"},503);
 }
 if(!["stored","duplicate","unverified_route","invalid_event"].includes(data))
   return json({error:"unexpected_result"},503);
 return json({received:true,stored:data==="stored"});
});

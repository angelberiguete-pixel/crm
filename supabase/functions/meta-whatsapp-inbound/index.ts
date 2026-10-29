import {createClient} from "npm:@supabase/supabase-js@2.116.0";
import {normalizeVerifiedWhatsAppTexts} from "./meta-whatsapp-inbound.ts";

const text=(value:string,status=200)=>new Response(value,{status,headers:{
  "Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store"}});
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{
  "Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const enc=new TextEncoder();
async function same(a:string,b:string):Promise<boolean>{
  const x=enc.encode(a),y=enc.encode(b);
  if(x.length!==y.length)return false;
  let diff=0;for(let i=0;i<x.length;i++)diff|=x[i]^y[i];
  return diff===0;
}
async function metaSignatureValid(raw:Uint8Array,sig:string,secret:string):Promise<boolean>{
  if(!/^sha256=[a-fA-F0-9]{64}$/.test(sig))return false;
  const key=await crypto.subtle.importKey("raw",enc.encode(secret),
    {name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const digest=new Uint8Array(await crypto.subtle.sign("HMAC",key,raw));
  const expected="sha256="+Array.from(digest,b=>b.toString(16).padStart(2,"0")).join("");
  return same(sig.toLowerCase(),expected);
}
Deno.serve(async request=>{
  // Public endpoint REQUIRED by Meta. Reject all unsigned event POSTs.
  const secret=Deno.env.get("META_APP_SECRET");
  const token=Deno.env.get("META_WHATSAPP_VERIFY_TOKEN");
  if(!secret||!token||secret.length<16||token.length<16)
    return json({error:"meta_not_configured"},503);
  if(request.method==="GET"){
    const url=new URL(request.url);
    const mode=url.searchParams.get("hub.mode");
    const verify=url.searchParams.get("hub.verify_token")??"";
    const challenge=url.searchParams.get("hub.challenge")??"";
    if(mode==="subscribe"&&await same(verify,token)&&challenge.length>0&&challenge.length<=200)
      return text(challenge);
    return text("unauthorized",403);
  }
  if(request.method!=="POST")return text("method_not_allowed",405);
  const signature=request.headers.get("x-hub-signature-256")??"";
  if(!/^sha256=[a-fA-F0-9]{64}$/.test(signature))return text("invalid_signature",401);
  const length=Number(request.headers.get("content-length")??"0");
  if(length>262144)return text("too_large",413);
  const raw=new Uint8Array(await request.arrayBuffer());
  if(raw.length<2||raw.length>262144)return text("invalid_size",413);
  if(!await metaSignatureValid(raw,signature,secret))return text("invalid_signature",401);
  let payload:unknown;
  try{payload=JSON.parse(new TextDecoder().decode(raw));}
  catch{return text("invalid_json",400);}
  const incoming=normalizeVerifiedWhatsAppTexts(payload);
  if(incoming.length===0)return json({received:true});

  const url=Deno.env.get("SUPABASE_URL");
  const serviceRole=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!serviceRole)return json({error:"server_unavailable"},503);
  const db=createClient(url,serviceRole,{auth:{persistSession:false,autoRefreshToken:false}});
  for(const message of incoming){
    // Database SQL atomically maps ONLY a previously verified Meta phone ID
    // and WABA to its tenant; no route comes from a client/browser parameter.
    const result=await db.rpc("ingest_verified_whatsapp_text",{
      p_phone_number_id:message.phoneNumberId,p_waba_id:message.wabaId,
      p_message_id:message.externalMessageId,p_from:message.sender,
      p_contact_name:message.contactName,p_body:message.body,
    });
    if(result.error){
      // Do not log names, numbers, body, tokens or raw event data.
      console.error("whatsapp_ingest_error",result.error.code??"db_unavailable");
      return json({error:"retry_later"},503);
    }
    if(!["stored","duplicate","unverified_route","invalid_message"].includes(result.data))
      return json({error:"unexpected_router_response"},503);
    // Unknown routes: fail closed without creating contacts or linking businesses.
  }
  return json({received:true});
});

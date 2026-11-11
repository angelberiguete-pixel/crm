import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.116.0";

// Disabled until explicitly configured and QA reviewed.
// FP_WEB_ALLOWED_ORIGINS = comma-separated exact HTTPS origins
// FP_WEB_ALLOW_PUBLIC_SUBMISSIONS = true, FP_WEB_PRIVACY_URL = approved policy URL
// FP_WEB_ALLOW_PUBLIC_CHAT = true
// FP_WEB_VERIFIED_WHATSAPP and FP_WEB_VERIFIED_PIXEL_ID are optional and verified.
const allowed = new Set((Deno.env.get("FP_WEB_ALLOWED_ORIGINS")||"")
 .split(",").map(s=>s.trim()).filter(s=>/^https:\/\/[a-z0-9.-]+(?::\d+)?$/.test(s)));
const policy=Deno.env.get("FP_WEB_PRIVACY_URL")||"";
const url=Deno.env.get("SUPABASE_URL")||"";
const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const enc=new TextEncoder();
const clean=(v:unknown,n:number)=>typeof v==="string"?v.trim().slice(0,n):"";
const isUUID=(v:unknown)=>typeof v==="string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const isEnabled=(v:string)=>Deno.env.get(v)==="true";
const isQuotesReady=()=>Boolean(isEnabled("FP_WEB_ALLOW_PUBLIC_SUBMISSIONS") && /^https:\/\/[a-z0-9.-]+\/.+$/i.test(policy) && allowed.size && key && url);
const isChatReady=()=>Boolean(isEnabled("FP_WEB_ALLOW_PUBLIC_CHAT") && allowed.size && key && url);
const whatsApp=()=>{const v=Deno.env.get("FP_WEB_VERIFIED_WHATSAPP")||"";return /^\d{10,15}$/.test(v)?v:null;};
const pixel=()=>{const v=Deno.env.get("FP_WEB_VERIFIED_PIXEL_ID")||"";return /^\d{10,20}$/.test(v)?v:null;};
const headers=(origin:string)=>({
 "Access-Control-Allow-Origin":origin,"Access-Control-Allow-Methods":"GET,POST,OPTIONS",
 "Access-Control-Allow-Headers":"content-type","Vary":"Origin",
 "Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});
function respond(origin:string,status:number,obj:unknown){
 return new Response(JSON.stringify(obj),{status,headers:{"Content-Type":"application/json; charset=utf-8",...headers(origin)}});
}
async function hash(value:string){const digest=await crypto.subtle.digest("SHA-256",enc.encode(value));return [...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,"0")).join("");}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("Origin")||"";
 if(!allowed.has(origin))return new Response(JSON.stringify({ok:false,error:"origin_not_allowed"}),{status:403,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:headers(origin)});
 if(req.method==="GET"){
   if(new URL(req.url).searchParams.get("action")!=="status")return respond(origin,404,{ok:false});
   return respond(origin,200,{ok:true,quotes:isQuotesReady(),chat:isChatReady(),
     whatsapp:whatsApp(),pixel_id:pixel(),policy_url:isQuotesReady()?policy:null});
 }
 if(req.method!=="POST")return respond(origin,405,{ok:false,error:"method_not_allowed"});
 if(Number(req.headers.get("content-length")||0)>10000)return respond(origin,413,{ok:false,error:"too_large"});
 let data:Record<string,unknown>;
 try{const payload=await req.text();if(payload.length>10000)throw Error();data=JSON.parse(payload);
     if(!data || typeof data!=="object" || Array.isArray(data))throw Error();}
 catch{return respond(origin,400,{ok:false,error:"invalid_payload"});}
 const action=data.action;
 if(!["quote","message","history"].includes(String(action)))return respond(origin,400,{ok:false,error:"invalid_action"});
 if(action==="quote"&&!isQuotesReady())return respond(origin,503,{ok:false,error:"quote_unavailable"});
 if(action!=="quote"&&!isChatReady())return respond(origin,503,{ok:false,error:"chat_unavailable"});
 const ip=(req.headers.get("cf-connecting-ip")||req.headers.get("x-real-ip")||
    req.headers.get("x-forwarded-for")?.split(",")[0]||"unknown").trim().slice(0,72);
 const rateHash=await hash(key+":fpweb:"+ip+":"+new Date().toISOString().slice(0,10));
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 if(action==="quote"){
   const name=clean(data.full_name,121),phone=clean(data.phone,31),note=clean(data.note,1501);
   const started=Number(data.started_at),elapsed=Date.now()-started;
   if(!isUUID(data.request_id)||data.consent!==true||clean(data.website_check,100)
      ||!Number.isFinite(started)||elapsed<1200||elapsed>7200000||name.length<2||name.length>120
      || !/^\+?[\d\s().-]{8,25}$/.test(phone)||note.length<12||note.length>1500)
     return respond(origin,422,{ok:false,error:"invalid_submission"});
   if(!Array.isArray(data.items)||data.items.length<1||data.items.length>10||
     data.items.some((item:any)=>!item||typeof item.description!=="string"
        ||item.description.trim().length<2||item.description.length>160||
        !Number.isInteger(item.quantity)||item.quantity<1||item.quantity>100))
     return respond(origin,422,{ok:false,error:"invalid_items"});
   const utm=data.utm&&typeof data.utm==="object"&&!Array.isArray(data.utm)?data.utm:{};
   const safeUtm=Object.fromEntries(["source","medium","campaign"].map(k=>[k,clean((utm as Record<string,unknown>)[k],90)]));
   try{
     const {data:result,error}=await db.rpc("family_power_web_capture_quote",{
       p_request_id:data.request_id,p_full_name:name,p_phone:phone,p_items:(data.items as any[]).map(item=>({description:item.description.trim(),quantity:item.quantity})),
       p_note:note,p_location:clean(data.location,80),p_consent:true,p_rate_hash:rateHash,p_utm:safeUtm});
     if(error||!result?.ok)return respond(origin,503,{ok:false,error:"crm_unavailable"});
     return respond(origin,201,{ok:true,request_id:result.request_id,quotation_id:result.quotation_id,
        opportunity_id:result.opportunity_id,conversation_id:result.conversation_id,event_id:data.request_id});
   }catch{return respond(origin,503,{ok:false,error:"crm_unavailable"});}
 }
 if(!isUUID(data.session_id))return respond(origin,422,{ok:false,error:"invalid_session"});
 const sessionHash=await hash(key+":fpwebsession:"+data.session_id);
 try{
  if(action==="history"){
    const {data:result,error}=await db.rpc("family_power_web_chat_history",{p_token_hash:sessionHash});
    return error?respond(origin,503,{ok:false,error:"history_unavailable"}):respond(origin,200,result||{ok:false,error:"empty"});
  }
  const message=clean(data.text,901);
  if(data.consent!==true||message.length<1||message.length>900||clean(data.website_check,100))
    return respond(origin,422,{ok:false,error:"invalid_message"});
  const {data:result,error}=await db.rpc("family_power_web_chat_message",{
    p_token_hash:sessionHash,p_rate_hash:rateHash,p_text:message});
  if(error||!result?.ok)return respond(origin,503,{ok:false,error:"crm_unavailable"});
  return respond(origin,201,{ok:true,conversation_id:result.conversation_id,message_id:result.message_id,
    delivery:"received_by_crm",agent_response:false});
 }catch{return respond(origin,503,{ok:false,error:"crm_unavailable"});}
});

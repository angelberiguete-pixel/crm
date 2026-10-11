import { createClient } from "@supabase/supabase-js";
import { processAutomationEvents, type EventRow } from "./worker.ts";

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json; charset=utf-8"}});

Deno.serve(async(req)=>{
  if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);
  const key=req.headers.get("x-automation-worker-key")??"";
  if(!key)return json({ok:false,error:"worker_key_required"},401);

  const url=Deno.env.get("SUPABASE_URL")!;
  const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});

  const authorized=await db.rpc("automation_worker_authorized",{p_key:key});
  if(authorized.error||authorized.data!==true)return json({ok:false,error:"worker_not_authorized"},403);

  const body=await req.json().catch(()=>({}));
  const limit=Math.max(1,Math.min(Number(body?.limit??5)||5,5));
  const claimed=await db.rpc("claim_automation_events",{p_limit:limit});
  if(claimed.error)return json({ok:false,error:"claim_failed",detail:claimed.error.message},500);

  const events=(claimed.data??[]) as EventRow[];
  const summary=await processAutomationEvents(db,events);
  return json({ok:true,claimed:events.length,events:summary});
});

import {createHmac,timingSafeEqual} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {NextRequest,NextResponse} from "next/server";

export const runtime="nodejs";
export const dynamic="force-dynamic";

const respond=(body:unknown,status=200)=>NextResponse.json(body,{
  status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}
});

export async function GET(request:NextRequest){
  const token=process.env.CRM_PAYPAL_RELAY_CRON_SECRET;
  const got=request.headers.get("authorization")??"";
  if(!token || !got.startsWith("Bearer ")) return respond({error:"Unauthorized"},401);
  const expected=Buffer.from(token,"utf8");
  const received=Buffer.from(got.slice(7),"utf8");
  if(expected.length!==received.length || !timingSafeEqual(expected,received))
    return respond({error:"Unauthorized"},401);

  const url=process.env.CRM_PAYPAL_SUPABASE_URL;
  const service=process.env.CRM_PAYPAL_SUPABASE_SERVICE_ROLE_KEY;
  const bridge=process.env.EMPRESIA_PAYPAL_BRIDGE_URL;
  const secret=process.env.EMPRESIA_PAYPAL_BRIDGE_SECRET;
  const allowed=process.env.PAYPAL_ALLOWED_TENANT_ID;
  if(!url||!service||!bridge||!secret||!allowed)
    return respond({error:"Relay not configured"},503);
  let destination:URL;
  try {
    destination=new URL(bridge);
    if(destination.protocol!=="https:" || destination.username || destination.password)
      return respond({error:"Invalid relay destination"},503);
  } catch { return respond({error:"Invalid relay destination"},503); }

  const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const pending=await db.from("crm_paypal_erp_outbox")
    .select("id,tenant_id,event_type,payload,attempts,status")
    .eq("tenant_id",allowed).in("status",["pending","failed"])
    .lt("attempts",10).order("created_at",{ascending:true}).limit(10);
  if(pending.error) return respond({error:"ERP relay queue unavailable"},503);
  let delivered=0,failed=0;
  for(const row of pending.data??[]){
    // Atomic claim: only one dispatcher may send the event at a time.
    const claim=await db.from("crm_paypal_erp_outbox")
      .update({status:"processing",attempts:row.attempts+1})
      .eq("id",row.id).eq("status",row.status)
      .eq("attempts",row.attempts).select("id").maybeSingle();
    if(claim.error||!claim.data)continue;
    const raw=JSON.stringify({
      version:1,event_id:row.id,event_type:row.event_type,
      tenant_id:row.tenant_id,...row.payload
    });
    const timestamp=String(Math.floor(Date.now()/1000));
    const signature="sha256="+createHmac("sha256",secret).update(timestamp+"."+raw).digest("hex");
    try {
      const sent=await fetch(destination,{
        method:"POST",headers:{
          "Content-Type":"application/json",
          "X-Empresia-Timestamp":timestamp,
          "X-Empresia-Signature":signature
        },
        body:raw,cache:"no-store",signal:AbortSignal.timeout(12000)
      });
      const ack=sent.ok?await sent.json().catch(()=>null):null;
      if(!sent.ok || ack?.accepted!==true)throw new Error("ERP did not acknowledge event");
      const done=await db.from("crm_paypal_erp_outbox")
        .update({status:"synced",processed_at:new Date().toISOString()})
        .eq("id",row.id).eq("status","processing");
      if(done.error) throw new Error("Could not confirm relay delivery");
      delivered++;
    }catch{
      failed++;
      await db.from("crm_paypal_erp_outbox").update({status:"failed"})
        .eq("id",row.id).eq("status","processing");
    }
  }
  return respond({delivered,failed});
}

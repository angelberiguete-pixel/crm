/** Cita-24 approved utility reminders via YCloud.
 * Designed for an external authenticated scheduler; NEVER public callable.
 * Disabled by default. Requires CITA24_REMINDERS_ENABLED=true,
 * CITA24_DISPATCH_SECRET, YCLOUD_API_KEY and verified per-tenant routes.
 * Each message is accepted by provider at most once; ambiguous timeouts require human review.
 */
import {createClient} from "npm:@supabase/supabase-js@2.116.0";
const api="https://api.ycloud.com/v2/whatsapp";
const e164=/^\+[1-9]\d{7,14}$/;
function fixedEqual(x:string,y:string){
 if(x.length!==y.length)return false;
 let diff=0;for(let i=0;i<x.length;i++)diff|=x.charCodeAt(i)^y.charCodeAt(i);
 return diff===0;
}
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,
 headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
Deno.serve(async request=>{
 if(request.method!=="POST")return reply({error:"method_not_allowed"},405);
 if(Deno.env.get("CITA24_REMINDERS_ENABLED")!=="true")
   return reply({error:"reminders_disabled"},503);
 const secret=Deno.env.get("CITA24_DISPATCH_SECRET")??"";
 const provided=request.headers.get("x-cita24-dispatch-secret")??"";
 if(secret.length<32||!fixedEqual(provided,secret))return reply({error:"not_authorized"},401);
 const url=Deno.env.get("SUPABASE_URL")??"";
 const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
 const ycloud=Deno.env.get("YCLOUD_API_KEY")??"";
 if(!url||!key||ycloud.length<10)return reply({error:"provider_not_configured"},503);
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const now=new Date().toISOString();
 const queue=await db.from("cita24_reminder_outbox")
  .select("id,tenant_id,contact_id,appointment_id,due_at,status")
  .eq("status","queued").lte("due_at",now)
  .order("due_at",{ascending:true}).limit(5);
 if(queue.error)return reply({error:"queue_unavailable"},503);
 let submitted=0,blocked=0,uncertain=0;
 for(const job of queue.data??[]){
  const claimed=await db.from("cita24_reminder_outbox")
    .update({status:"processing",attempts:1,updated_at:new Date().toISOString()})
    .eq("id",job.id).eq("status","queued").select("id").maybeSingle();
  if(claimed.error||!claimed.data)continue;
  let finalState:"submitted"|"failed"|"uncertain"|"cancelled"="failed";
  let reason="not_ready";
  let providerId:string|null=null;
  let sendStarted=false;
  try{
   const [{data:config},{data:contact},{data:appointment},{data:tenant},{data:routes}]=await Promise.all([
    db.from("cita24_portal_configs")
      .select("whatsapp_reminders_enabled,reminder_template_name,reminder_template_language")
      .eq("tenant_id",job.tenant_id).maybeSingle(),
    db.from("contacts").select("phone,whatsapp_phone,metadata")
      .eq("tenant_id",job.tenant_id).eq("id",job.contact_id).maybeSingle(),
    db.from("calendar_events").select("starts_at,status,metadata")
      .eq("tenant_id",job.tenant_id).eq("id",job.appointment_id).maybeSingle(),
    db.from("tenants").select("status,slug").eq("id",job.tenant_id).maybeSingle(),
    db.from("ycloud_whatsapp_routes")
      .select("channel_id,waba_id,business_phone_e164,is_enabled,verified_at")
      .eq("tenant_id",job.tenant_id).eq("is_enabled",true),
   ]);
   const phone=contact?.whatsapp_phone||contact?.phone||"";
   const optin=contact?.metadata?.cita24_whatsapp_admin_consent===true;
   const optedOut=contact?.metadata?.cita24_whatsapp_opted_out===true;
   const templateName=config?.reminder_template_name??"";
   const lang=config?.reminder_template_language??"es";
   if(tenant?.status!=="active"||tenant?.slug==="family-power"||
     config?.whatsapp_reminders_enabled!==true||!optin||optedOut||
     appointment?.metadata?.module!=="cita24"||appointment?.status!=="scheduled"||
     new Date(appointment.starts_at).getTime()<=Date.now()||!e164.test(phone)||
     !/^[a-z0-9_]{1,120}$/.test(templateName)||
     !/^[a-z]{2}(_[A-Z]{2})?$/.test(lang)||
     !Array.isArray(routes)||routes.length!==1||!routes[0].verified_at||
     !e164.test(routes[0].business_phone_e164)){
      finalState="cancelled";reason="consent_or_verified_connection_missing";
   }else{
    const route=routes[0];
    const channel=await db.from("channels").select("status,provider")
     .eq("tenant_id",job.tenant_id).eq("id",route.channel_id).maybeSingle();
    if(channel.error||channel.data?.status!=="connected"||
       channel.data?.provider!=="whatsapp"){
      finalState="cancelled";reason="channel_not_verified";
    }else{
     // Inspect approval every time to prevent sending paused or changed templates.
     const templateUrl=api+"/templates/"+encodeURIComponent(route.waba_id)+
       "/"+encodeURIComponent(templateName)+"/"+encodeURIComponent(lang);
     const lookup=await fetch(templateUrl,{
      headers:{"X-API-Key":ycloud,"Accept":"application/json"},
      signal:AbortSignal.timeout(8000)
     });
     if(!lookup.ok){finalState="failed";reason="provider_template_unavailable";}
     else{
      const approved=await lookup.json();
      const variableContent=JSON.stringify(approved.components??[]);
      if(approved.status!=="APPROVED"||approved.category!=="UTILITY"||
         approved.wabaId!==route.waba_id||
         variableContent.includes("{{")){
       finalState="failed";reason="template_not_approved_or_has_variables";
      }else{
       const body={
        from:route.business_phone_e164,to:phone,type:"template",
        template:{name:templateName,language:{code:lang}},
        externalId:job.id,
        filterUnsubscribed:true,filterBlocked:true
       };
       sendStarted=true;
       const accepted=await fetch(api+"/messages",{
        method:"POST",
        headers:{"X-API-Key":ycloud,"Content-Type":"application/json"},
        body:JSON.stringify(body),signal:AbortSignal.timeout(15000)
       });
       if(!accepted.ok){finalState="failed";reason="provider_rejected";}
       else{
        const result=await accepted.json();
        if(typeof result.id!=="string"||!result.id){
         finalState="uncertain";reason="provider_result_unconfirmed";
        }else{
         finalState="submitted";reason="provider_accepted";
         providerId=result.id;
        }
       }
      }
     }
    }
   }
  }catch{
   finalState=sendStarted?"uncertain":"failed";
   reason=sendStarted?"provider_outcome_unknown":"preflight_unavailable";
  }
  const result=await db.from("cita24_reminder_outbox").update({
   status:finalState,provider_error:finalState==="submitted"?null:reason,
   external_message_id:providerId,updated_at:new Date().toISOString()
  }).eq("id",job.id).eq("status","processing");
  if(result.error){console.error("cita24_outbox_status_error",result.error.code??"database");}
  if(finalState==="submitted")submitted++;
  else if(finalState==="uncertain")uncertain++;
  else blocked++;
 }
 return reply({ok:true,processed:(queue.data??[]).length,submitted,blocked,uncertain,
   note:"submitted means accepted by provider, not delivered to patient"});
});

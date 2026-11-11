import {db,paypal,fulfill} from "../../../../lib/server";
export const dynamic="force-dynamic";
export async function POST(request){
 try{
 const body=await request.text();
 if(body.length>250000)return Response.json({error:"Too large"},{status:413});
 const event=JSON.parse(body);
 if(!process.env.PAYPAL_WEBHOOK_ID)return Response.json({error:"Not configured"},{status:503});
 const h=request.headers;
 const verified=await paypal("/v1/notifications/verify-webhook-signature","POST",{
 auth_algo:h.get("paypal-auth-algo"),cert_url:h.get("paypal-cert-url"),transmission_id:h.get("paypal-transmission-id"),
 transmission_sig:h.get("paypal-transmission-sig"),transmission_time:h.get("paypal-transmission-time"),
 webhook_id:process.env.PAYPAL_WEBHOOK_ID,webhook_event:event
 });
 if(verified.verification_status!=="SUCCESS")return Response.json({error:"Invalid signature"},{status:401});
 if(!event.id || typeof event.id!=="string")return Response.json({error:"Missing event ID"},{status:400});
 const admin=db();
 const {data:existing}=await admin.from("commerce_webhook_events").select("processed").eq("id",event.id).maybeSingle();
 if(existing?.processed)return Response.json({ok:true,duplicate:true});
 if(!existing){const added=await admin.from("commerce_webhook_events").insert({id:event.id,event_type:event.event_type,processed:false});if(added.error && added.error.code!=="23505")throw added.error;}
 if(event.event_type==="PAYMENT.CAPTURE.COMPLETED"){
 const capture=event.resource;const orderId=capture?.supplementary_data?.related_ids?.order_id;
 if(orderId){
 const {data:order}=await admin.from("commerce_orders").select("*").eq("paypal_order_id",orderId).maybeSingle();
 if(order && order.status!=="refunded" && order.status!=="cancelled")await fulfill(order,capture);
 }
 }
 if(["PAYMENT.CAPTURE.REFUNDED","PAYMENT.CAPTURE.REVERSED"].includes(event.event_type)){
 const captureId=event.resource?.supplementary_data?.related_ids?.capture_id || event.resource?.id;
 const {data:order}=await admin.from("commerce_orders").select("id").eq("capture_id",captureId).maybeSingle();
 if(order){const a=await admin.from("commerce_orders").update({status:"refunded"}).eq("id",order.id);if(a.error)throw a.error;const b=await admin.from("commerce_entitlements").update({status:"revoked"}).eq("order_id",order.id);if(b.error)throw b.error;}
 }
 const {error}=await admin.from("commerce_webhook_events").update({processed:true}).eq("id",event.id);
 if(error)throw error;
 return Response.json({ok:true});
 }catch(e){return Response.json({error:"Webhook processing failed"},{status:500});}
}

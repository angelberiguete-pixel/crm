import {NextRequest,NextResponse} from "next/server";
import {paypalRequest} from "../../../../../lib/payments/paypal";
export const runtime="nodejs";
export async function POST(req:NextRequest){
 const webhookId=process.env.PAYPAL_WEBHOOK_ID;
 if(!webhookId)return NextResponse.json({error:"Webhook not configured"},{status:503});
 const raw=await req.text();
 let event:unknown;
 try{event=JSON.parse(raw);}catch{return NextResponse.json({error:"Invalid JSON"},{status:400});}
 const headers=req.headers;
 const transmissionId=headers.get("paypal-transmission-id");
 const transmissionTime=headers.get("paypal-transmission-time");
 const certUrl=headers.get("paypal-cert-url");
 const authAlgo=headers.get("paypal-auth-algo");
 const transmissionSig=headers.get("paypal-transmission-sig");
 if(!transmissionId||!transmissionTime||!certUrl||!authAlgo||!transmissionSig)return NextResponse.json({error:"Missing signature"},{status:400});
 try{
  const verification=await paypalRequest("/v1/notifications/verify-webhook-signature","POST",{
   auth_algo:authAlgo,cert_url:certUrl,transmission_id:transmissionId,transmission_sig:transmissionSig,transmission_time:transmissionTime,webhook_id:webhookId,webhook_event:event
  }) as {verification_status?:string};
  if(verification.verification_status!=="SUCCESS")return NextResponse.json({error:"Signature rejected"},{status:401});
  // Intentionally do not acknowledge as processed until an idempotent durable event ledger exists.
  return NextResponse.json({error:"Verified but durable processing not configured"},{status:503});
 }catch{return NextResponse.json({error:"Webhook verification unavailable"},{status:503});}
}

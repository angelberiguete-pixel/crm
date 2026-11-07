import {createClient} from "@supabase/supabase-js";
import {NextRequest,NextResponse} from "next/server";
import {capturePayPalOrder,paypalMerchantId,verifyPayPalWebhook} from "@/lib/paypal-server";
import {extractPayPalCapture} from "@/lib/paypal-core";

export const runtime="nodejs";
export const dynamic="force-dynamic";

const respond=(body:unknown,status=200)=>NextResponse.json(body,{
  status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}
});

export async function POST(request:NextRequest){
  const size=Number(request.headers.get("content-length")??0);
  if(size>100000) return respond({error:"Payload too large"},413);
  const url=process.env.CRM_PAYPAL_SUPABASE_URL;
  const service=process.env.CRM_PAYPAL_SUPABASE_SERVICE_ROLE_KEY;
  const tenantAllowed=process.env.PAYPAL_ALLOWED_TENANT_ID;
  if(!url || !service || !tenantAllowed) return respond({error:"Not configured"},503);
  let event:Record<string,unknown>;
  try {
    const raw=await request.text();
    if(raw.length>100000) return respond({error:"Payload too large"},413);
    event=JSON.parse(raw) as Record<string,unknown>;
    if(!event || typeof event!=="object" || Array.isArray(event)) return respond({error:"Invalid webhook"},400);
    if(!(await verifyPayPalWebhook(request.headers,event)))
      return respond({error:"Invalid signature"},401);
  }catch {
    return respond({error:"Cannot verify PayPal webhook"},400);
  }
  if(typeof event.id!=="string" || event.id.length<6 || event.id.length>160)
    return respond({error:"Invalid event ID"},400);

  const elevated=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const eventType=event.event_type;

  if(eventType==="CHECKOUT.ORDER.APPROVED"){
    const resource=event.resource as Record<string,unknown>|undefined;
    if(!resource || typeof resource.id!=="string" || !/^[A-Za-z0-9]{6,64}$/.test(resource.id))
      return respond({error:"Invalid PayPal order"},400);
    const lookup=await elevated.from("crm_paypal_checkouts").select("id,tenant_id,status")
      .eq("paypal_order_id",resource.id).maybeSingle();
    if(lookup.error) return respond({error:"Storage unavailable"},503);
    if(!lookup.data || lookup.data.tenant_id!==tenantAllowed) return respond({ignored:true});
    if(lookup.data.status==="completed") return respond({received:true});
    if(!["created","pending"].includes(lookup.data.status))
      return respond({error:"Checkout not capturable"},409);
    try{
      await capturePayPalOrder(resource.id);
      // The signed PAYMENT.CAPTURE.COMPLETED webhook is the sole authority
      // for recording confirmed payment in the CRM and ERP outbox.
      return respond({received:true});
    }catch {
      return respond({error:"Capture failed; PayPal may retry"},503);
    }
  }

  const capture=extractPayPalCapture(event);
  if(!capture) return respond({ignored:true});
  try {
    // Prevent a verified event sent to this PayPal account from being applied
    // to an unconfigured tenant or a different merchant account.
    if(capture.merchantId!==paypalMerchantId())
      return respond({error:"Merchant mismatch"},403);
    const lookup=await elevated.from("crm_paypal_checkouts").select("id,tenant_id")
      .eq("paypal_order_id",capture.orderId).maybeSingle();
    if(lookup.error) return respond({error:"Storage unavailable"},503);
    if(!lookup.data || lookup.data.tenant_id!==tenantAllowed) return respond({ignored:true});
    const applied=await elevated.rpc("crm_paypal_apply_capture",{
      p_event_id:event.id,
      p_event_type:eventType,
      p_order_id:capture.orderId,
      p_capture_id:capture.captureId,
      p_amount_minor:capture.amountMinor,
      p_currency:capture.currency
    });
    if(applied.error) return respond({error:"Payment reconciliation failed"},503);
    return respond({received:true});
  }catch{
    return respond({error:"PayPal webhook processing unavailable"},503);
  }
}

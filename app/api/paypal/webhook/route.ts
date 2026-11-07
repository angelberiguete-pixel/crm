import {NextRequest,NextResponse} from "next/server";
import {
  evaluatePaypalCapture,paypalSandboxAccessToken,verifyPaypalSandboxWebhook
} from "@/lib/paypal-checkout";
import {paypalSandboxServerConfiguration} from "@/lib/paypal-crm-server";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const fail=(status:number)=>NextResponse.json({error:"PayPal webhook no procesado."},
  {status,headers:{"Cache-Control":"no-store"}});

export async function POST(request:NextRequest){
  try{
    const {config,admin}=paypalSandboxServerConfiguration();
    const length=Number(request.headers.get("content-length")??"0");
    if(length>256*1024)return fail(413);
    const rawBody=await request.text();
    if(Buffer.byteLength(rawBody,"utf8")>256*1024)return fail(413);

    const token=await paypalSandboxAccessToken(config);
    const event=await verifyPaypalSandboxWebhook({
      rawBody,headers:request.headers,config,token
    });
    if(event.event_type!=="PAYMENT.CAPTURE.COMPLETED")
      return NextResponse.json({received:true,processed:false},
        {headers:{"Cache-Control":"no-store"}});

    const externalOrderId=event.resource?.supplementary_data?.related_ids?.order_id;
    if(typeof externalOrderId!=="string"||!/^[A-Z0-9]{8,32}$/.test(externalOrderId))
      return fail(400);
    // The tenant always comes from the server-owned PayPal order ledger.
    // Never trust tenant_id or invoice_id values within a webhook.
    const linked=await admin.from("paypal_checkout_orders")
      .select("tenant_id,invoice_id,merchant_id,amount_cents,currency,status")
      .eq("paypal_order_id",externalOrderId).maybeSingle();
    if(linked.error)return fail(503);
    if(!linked.data)return NextResponse.json({received:true,processed:false},
      {headers:{"Cache-Control":"no-store"}});

    const invoice=await admin.from("billing_invoices")
      .select("id,tenant_id,status,currency,amount_due_cents,total_cents")
      .eq("id",linked.data.invoice_id).eq("tenant_id",linked.data.tenant_id).maybeSingle();
    if(invoice.error)return fail(503);
    if(!invoice.data)return fail(409);
    const verdict=evaluatePaypalCapture({
      event,expectedOrderId:externalOrderId,expectedInvoice:invoice.data,
      expectedMerchantId:config.merchantId
    });
    if(!verdict.accepted){
      if(verdict.reason==="invoice_not_open"&&linked.data.status==="paid")
        return NextResponse.json({received:true,processed:false},
          {headers:{"Cache-Control":"no-store"}});
      // A signed PayPal event might still belong to another merchant
      // or amount. Do not create any payment or mark invoice paid.
      return fail(409);
    }
    if(linked.data.merchant_id!==config.merchantId||
       linked.data.currency!=="USD"||
       linked.data.amount_cents!==invoice.data.amount_due_cents)
      return fail(409);

    const applied=await admin.rpc("apply_verified_paypal_capture",{
      p_order_id:externalOrderId,
      p_capture_id:verdict.captureId!,
      p_event_id:verdict.eventId!,
      p_merchant_id:config.merchantId,
      p_amount_cents:invoice.data.amount_due_cents,
      p_currency:"USD"
    });
    if(applied.error)return fail(503);
    if(!["recorded","duplicate_event","already_paid"].includes(String(applied.data)))
      return fail(409);
    return NextResponse.json({received:true,
      processed:applied.data==="recorded"},
      {headers:{"Cache-Control":"no-store"}});
  }catch(e){
    const code=e instanceof Error?e.message:"";
    if(code.includes("webhook_signature")||code.includes("missing_webhook_signature")||
       code.includes("untrusted_certificate")||code.includes("unapproved_signature"))
      return fail(401);
    if(code.startsWith("paypal_invalid_webhook")||code==="paypal_stale_webhook")
      return fail(400);
    return fail(503);
  }
}

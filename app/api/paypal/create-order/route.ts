import {createClient} from "@supabase/supabase-js";
import {NextRequest,NextResponse} from "next/server";
import {createPayPalOrder} from "@/lib/paypal-server";
import {isPayPalCurrency} from "@/lib/paypal-core";

export const runtime="nodejs";
export const dynamic="force-dynamic";

const response=(data:unknown,status=200)=>NextResponse.json(data,{
  status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}
});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request:NextRequest){
  if(Number(request.headers.get("content-length")??0)>4096)
    return response({error:"Invalid request"},413);
  const authorization=request.headers.get("authorization")??"";
  if(!/^Bearer [A-Za-z0-9._~+\/=-]{40,4096}$/.test(authorization))
    return response({error:"Authentication required"},401);
  const token=authorization.slice(7);
  const payload=await request.json().catch(()=>null) as {orderId?:unknown}|null;
  if(!payload || typeof payload.orderId!=="string" || !uuid.test(payload.orderId))
    return response({error:"Invalid CRM order ID"},400);
  const url=process.env.CRM_PAYPAL_SUPABASE_URL;
  const anon=process.env.CRM_PAYPAL_SUPABASE_PUBLISHABLE_KEY;
  const service=process.env.CRM_PAYPAL_SUPABASE_SERVICE_ROLE_KEY;
  const tenantAllowed=process.env.PAYPAL_ALLOWED_TENANT_ID;
  if(!url||!anon||!service||!tenantAllowed)
    return response({error:"PayPal backend not configured"},503);
  try{
    const scoped=createClient(url,anon,{
      global:{headers:{Authorization:authorization}},
      auth:{persistSession:false,autoRefreshToken:false}
    });
    const {data:userInfo,error:authError}=await scoped.auth.getUser(token);
    if(authError || !userInfo.user) return response({error:"Invalid session"},401);
    // SECURITY DEFINER RPC independently enforces active membership + tenant admin,
    // and reads the amount/currency from the stored commercial order.
    const prepared=await scoped.rpc("crm_paypal_prepare_order",{p_order_id:payload.orderId});
    if(prepared.error) return response({error:"Order cannot be charged through PayPal"},403);
    const checkout=prepared.data as {
      id:string;tenant_id:string;currency:unknown;amount_minor:number;
      status:string;paypal_order_id:string|null;approval_url:string|null;
    };
    if(checkout.tenant_id!==tenantAllowed || !isPayPalCurrency(checkout.currency))
      return response({error:"PayPal is not enabled for this business"},403);
    if(checkout.status==="created" && checkout.approval_url)
      return response({checkoutId:checkout.id,approvalUrl:checkout.approval_url,status:"created"});
    if(checkout.status!=="draft") return response({error:"Checkout requires reconciliation"},409);
    const order=await createPayPalOrder({
      checkoutId:checkout.id,
      amountMinor:checkout.amount_minor,
      currency:checkout.currency
    });
    const elevated=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
    const saved=await elevated.from("crm_paypal_checkouts")
      .update({paypal_order_id:order.id,approval_url:order.approvalUrl,status:"created",updated_at:new Date().toISOString()})
      .eq("id",checkout.id).eq("tenant_id",checkout.tenant_id).eq("status","draft")
      .is("paypal_order_id",null).select("id").maybeSingle();
    if(saved.error || !saved.data) {
      // Never return an unpersisted checkout link: webhook mapping would fail.
      return response({error:"Could not persist checkout; retry safely"},503);
    }
    return response({checkoutId:checkout.id,approvalUrl:order.approvalUrl,status:"created"},201);
  }catch{
    return response({error:"PayPal checkout unavailable; no payment confirmed"},503);
  }
}

import {NextRequest,NextResponse} from "next/server";
import {createPaypalSandboxOrder,paypalSandboxAccessToken} from "@/lib/paypal-checkout";
import {paypalInvoiceFromAuthorizedUser,paypalSandboxServerConfiguration,paypalSmallJson} from "@/lib/paypal-crm-server";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const fail=(status:number,message:string)=>NextResponse.json({error:message},
  {status,headers:{"Cache-Control":"private, no-store"}});

export async function POST(request:NextRequest){
  try{
    const {config,admin,sandboxDb}=paypalSandboxServerConfiguration();
    const data=await paypalSmallJson(request);
    const {invoice}=await paypalInvoiceFromAuthorizedUser(request,data.invoiceId,sandboxDb);
    if(invoice.currency!=="USD"||invoice.status!=="open"||invoice.amount_due_cents<=0)
      return fail(409,"Factura no elegible para pago PayPal en USD.");
    const existing=await admin.from("paypal_checkout_orders")
      .select("paypal_order_id,merchant_id,currency,amount_cents,status,approval_url")
      .eq("invoice_id",invoice.id).eq("tenant_id",invoice.tenant_id).maybeSingle();
    if(existing.error)return fail(503,"No fue posible consultar el registro del cobro.");
    if(existing.data){
      if(existing.data.merchant_id!==config.merchantId||existing.data.currency!=="USD"||
         existing.data.amount_cents!==invoice.amount_due_cents)
        return fail(409,"La factura y la orden de PayPal no coinciden.");
      if(existing.data.status!=="created")
        return fail(409,"Ya existe un pago iniciado para esta factura.");
      return NextResponse.json({status:"sandbox_approval_required",
        orderId:existing.data.paypal_order_id,
        approvalUrl:existing.data.approval_url},
        {headers:{"Cache-Control":"private, no-store"}});
    }
    const returnUrl=process.env.PAYPAL_SANDBOX_RETURN_URL??"";
    const cancelUrl=process.env.PAYPAL_SANDBOX_CANCEL_URL??"";
    const token=await paypalSandboxAccessToken(config);
    const order=await createPaypalSandboxOrder({invoice,returnUrl,cancelUrl,token});
    const recorded=await admin.from("paypal_checkout_orders").insert({
      tenant_id:invoice.tenant_id,invoice_id:invoice.id,
      paypal_order_id:order.orderId,
      merchant_id:config.merchantId,amount_cents:invoice.amount_due_cents,
      currency:"USD",approval_url:order.approvalUrl,status:"created"
    }).select("id").single();
    // The PayPal Request-Id is stable per invoice. If a DB/network error
    // occurs, retrying order creation should reuse the provider order.
    if(recorded.error)return fail(503,"PayPal generó una orden pero no se pudo registrar. Reintenta desde la factura.");
    return NextResponse.json({status:"sandbox_approval_required",
      orderId:order.orderId,approvalUrl:order.approvalUrl},
      {headers:{"Cache-Control":"private, no-store"}});
  }catch(e){
    const code=e instanceof Error?e.message:"paypal_unavailable";
    if(code==="paypal_login_required"||code==="paypal_invoice_not_authorized")
      return fail(403,"Debes iniciar sesión y ser administrador de la empresa.");
    if(code.startsWith("paypal_invalid"))return fail(400,"Solicitud de pago no válida.");
    if(code.includes("invoice_already_managed"))return fail(409,"Factura con otro proveedor o parcialmente pagada.");
    return fail(503,"PayPal Sandbox no está disponible o autorizado para esta factura.");
  }
}

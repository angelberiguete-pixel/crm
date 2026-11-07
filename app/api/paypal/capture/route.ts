import {NextRequest,NextResponse} from "next/server";
import {PAYPAL_SANDBOX_API,paypalSandboxAccessToken} from "@/lib/paypal-checkout";
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
    if(invoice.status!=="open"||invoice.currency!=="USD")return fail(409,"Factura no abierta en USD.");
    const linked=await admin.from("paypal_checkout_orders")
      .select("id,paypal_order_id,merchant_id,currency,amount_cents,status")
      .eq("invoice_id",invoice.id).eq("tenant_id",invoice.tenant_id).maybeSingle();
    if(linked.error||!linked.data)return fail(404,"No se encontró una orden PayPal autorizada.");
    if(linked.data.merchant_id!==config.merchantId||
       linked.data.amount_cents!==invoice.amount_due_cents||
       linked.data.currency!==invoice.currency)return fail(409,"Orden y factura no coinciden.");
    if(linked.data.status==="paid")return fail(409,"Factura pagada.");
    if(linked.data.status==="capture_requested")
      return NextResponse.json({status:"pending_paypal_webhook"},
        {headers:{"Cache-Control":"private, no-store"}});
    if(linked.data.status!=="created")return fail(409,"Orden no disponible.");
    const token=await paypalSandboxAccessToken(config);
    const response=await fetch(PAYPAL_SANDBOX_API+
      "/v2/checkout/orders/"+linked.data.paypal_order_id+"/capture",{
      method:"POST",
      headers:{Authorization:"Bearer "+token,"Content-Type":"application/json",
        "Accept":"application/json","PayPal-Request-Id":"capture-"+linked.data.id},
      body:"{}",cache:"no-store"
    });
    if(!response.ok)return fail(409,"PayPal no confirmó la captura. Revisa la autorización del comprador.");
    const payload:unknown=await response.json().catch(()=>null);
    if(!payload||typeof payload!=="object")return fail(503,"Respuesta PayPal no verificable.");
    const result=payload as {id?:unknown;status?:unknown};
    if(result.id!==linked.data.paypal_order_id)
      return fail(503,"PayPal devolvió una orden diferente.");
    const saved=await admin.from("paypal_checkout_orders")
      .update({status:"capture_requested",updated_at:new Date().toISOString()})
      .eq("id",linked.data.id).eq("status","created").select("id").maybeSingle();
    // Race: an authentic webhook may have already marked the order paid.
    if(saved.error)return fail(503,"No se pudo registrar la captura.");
    return NextResponse.json({status:"pending_paypal_webhook",
      paypalOrderStatus:String(result.status??"UNKNOWN")},
      {headers:{"Cache-Control":"private, no-store"}});
  }catch(e){
    const code=e instanceof Error?e.message:"";
    if(code==="paypal_login_required"||code==="paypal_invoice_not_authorized")
      return fail(403,"Debes iniciar sesión y ser administrador de la empresa.");
    if(code.startsWith("paypal_invalid"))return fail(400,"Solicitud de pago no válida.");
    return fail(503,"Captura PayPal Sandbox no disponible.");
  }
}

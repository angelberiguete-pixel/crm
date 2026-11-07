/**
 * PayPal Orders v2 adapter for Look Social Media CRM/ARM (SANDBOX ONLY).
 *
 * No direct database writes, no tenant identification from client payloads,
 * no live merchant routing and no customer-facing payment endpoint.
 * Only a trusted backend should call this module after verifying tenant
 * permissions, the invoice in billing_invoices and payee ownership.
 *
 * Deliberately not imported from "use client" components.
 */
export type PaypalSandboxCredentials={
  clientId:string;
  clientSecret:string;
  webhookId:string;
  merchantId:string;
};

export type CrmPayableInvoice={
  id:string;
  tenant_id:string;
  status:string;
  currency:string;
  amount_due_cents:number;
  total_cents:number;
};

type FetchLike=typeof fetch;
type PaypalOrderResponse={
  id?:unknown;status?:unknown;
  links?:Array<{href?:unknown;rel?:unknown;method?:unknown}>;
};
type VerifiedWebhook={
  id?:unknown;event_type?:unknown;
  resource?:{id?:unknown;status?:unknown;amount?:{value?:unknown;currency_code?:unknown};
    payee?:{merchant_id?:unknown};
    supplementary_data?:{related_ids?:{order_id?:unknown}}};
};

export const PAYPAL_SANDBOX_API="https://api-m.sandbox.paypal.com";
const USD=/^(0|[1-9]\d{0,8})\.\d{2}$/;
const UUID=/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const ORDER_ID=/^[A-Z0-9]{8,32}$/;
const PAYPAL_ID=/^[A-Za-z0-9_-]{4,128}$/;

export function loadPaypalSandboxCredentials(env:Record<string,string|undefined>):PaypalSandboxCredentials{
  // No silent fallback to live. Explicitly deny integration until the
  // merchant identity is verified and sandbox credentials are configured.
  if(env.PAYPAL_MODE!=="sandbox"||env.PAYPAL_ARM_SANDBOX_ENABLED!=="true")
    throw new Error("paypal_sandbox_not_enabled");
  const c={
    clientId:env.PAYPAL_SANDBOX_CLIENT_ID??"",
    clientSecret:env.PAYPAL_SANDBOX_CLIENT_SECRET??"",
    webhookId:env.PAYPAL_SANDBOX_WEBHOOK_ID??"",
    merchantId:env.PAYPAL_SANDBOX_MERCHANT_ID??"",
  };
  if(Object.values(c).some(v=>!v||v.length>512)||!PAYPAL_ID.test(c.merchantId))
    throw new Error("paypal_sandbox_config_incomplete");
  return c;
}

export function formatPayPalUsdCents(amount:number):string{
  if(!Number.isSafeInteger(amount)||amount<=0||amount>999_999_999)
    throw new Error("paypal_invalid_invoice_amount");
  return (Math.floor(amount/100)).toString()+"."+(amount%100).toString().padStart(2,"0");
}

export function parsePayPalUsdCents(value:unknown):number{
  if(typeof value!=="string"||!USD.test(value))throw new Error("paypal_invalid_capture_amount");
  const [whole,cents]=value.split(".");
  const n=Number(whole)*100+Number(cents);
  if(!Number.isSafeInteger(n)||n<=0)throw new Error("paypal_invalid_capture_amount");
  return n;
}

export function buildSandboxOrderPayload(
  invoice:CrmPayableInvoice,returnUrl:string,cancelUrl:string
){
  // Authorization, invoice provenance and ownership have to be established
  // by trusted server code before this pure formatter is called.
  if(!UUID.test(invoice.id)||!UUID.test(invoice.tenant_id))
    throw new Error("paypal_invalid_invoice_identity");
  if(invoice.status!=="open"||invoice.currency!=="USD")
    throw new Error("paypal_invoice_not_eligible_or_currency_unsupported");
  if(!Number.isSafeInteger(invoice.total_cents)||invoice.total_cents<invoice.amount_due_cents)
    throw new Error("paypal_invalid_invoice_balance");
  const amount=formatPayPalUsdCents(invoice.amount_due_cents);
  for(const url of [returnUrl,cancelUrl]){
    let parsed:URL;
    try{parsed=new URL(url)}catch{throw new Error("paypal_invalid_redirect");}
    if(parsed.protocol!=="https:"||parsed.username||parsed.password||!parsed.hostname
       ||!["443",""].includes(parsed.port))throw new Error("paypal_invalid_redirect");
  }
  return {
    intent:"CAPTURE",
    purchase_units:[{
      reference_id:invoice.id,custom_id:invoice.id,
      description:"Factura CRM/ARM",
      amount:{currency_code:"USD",value:amount},
    }],
    payment_source:{paypal:{experience_context:{
      return_url:returnUrl,cancel_url:cancelUrl,user_action:"PAY_NOW",
    }}},
  };
}

async function paypalJson(response:Response):Promise<Record<string,unknown>>{
  const body:unknown=await response.json().catch(()=>null);
  if(!response.ok||!body||typeof body!=="object"||Array.isArray(body))
    throw new Error("paypal_remote_operation_failed");
  return body as Record<string,unknown>;
}

export async function paypalSandboxAccessToken(
  config:PaypalSandboxCredentials,fetcher:FetchLike=fetch,
):Promise<string>{
  const auth=Buffer.from(config.clientId+":"+config.clientSecret).toString("base64");
  const response=await fetcher(PAYPAL_SANDBOX_API+"/v1/oauth2/token",{
    method:"POST",
    headers:{"Authorization":"Basic "+auth,
      "Content-Type":"application/x-www-form-urlencoded","Accept":"application/json"},
    body:"grant_type=client_credentials",cache:"no-store",
  });
  const data=await paypalJson(response);
  if(typeof data.access_token!=="string"||!data.access_token)
    throw new Error("paypal_missing_access_token");
  return data.access_token;
}

export async function createPaypalSandboxOrder(input:{
    invoice:CrmPayableInvoice;
    returnUrl:string;
    cancelUrl:string;
    token:string;
    fetcher?:FetchLike;
}):Promise<{orderId:string;approvalUrl:string;providerStatus:string}>{
  const payload=buildSandboxOrderPayload(input.invoice,input.returnUrl,input.cancelUrl);
  if(!input.token)throw new Error("paypal_access_token_missing");
  const fetcher=input.fetcher??fetch;
  // Stable invoice UUID prevents duplicate order creation on HTTP retries.
  // The real connector must store orderId/approvalUrl transactionally before
  // showing the link. No money can be marked paid from this response alone.
  const response=await fetcher(PAYPAL_SANDBOX_API+"/v2/checkout/orders",{
    method:"POST",
    headers:{"Authorization":"Bearer "+input.token,"Content-Type":"application/json",
      "Accept":"application/json","PayPal-Request-Id":input.invoice.id,
      "Prefer":"return=representation"},
    body:JSON.stringify(payload),cache:"no-store",
  });
  const value=(await paypalJson(response)) as PaypalOrderResponse;
  if(typeof value.id!=="string"||!ORDER_ID.test(value.id))
    throw new Error("paypal_invalid_order_id");
  const approval=value.links?.find(l=>l.rel==="payer-action"||l.rel==="approve")?.href;
  if(typeof approval!=="string")throw new Error("paypal_approval_url_missing");
  let u:URL;
  try{u=new URL(approval)}catch{throw new Error("paypal_invalid_approval_url");}
  if(u.protocol!=="https:"||u.hostname!=="www.sandbox.paypal.com"||u.username||u.password)
    throw new Error("paypal_invalid_approval_url");
  return {orderId:value.id,approvalUrl:approval,providerStatus:String(value.status??"UNKNOWN")};
}

export function readPaypalWebhookHeaders(headers:Headers){
  const transmissionId=headers.get("paypal-transmission-id")??"";
  const transmissionTime=headers.get("paypal-transmission-time")??"";
  const transmissionSig=headers.get("paypal-transmission-sig")??"";
  const authAlgo=headers.get("paypal-auth-algo")??"";
  const certUrl=headers.get("paypal-cert-url")??"";
  if(!transmissionId||!transmissionTime||!transmissionSig||!authAlgo||!certUrl||
     !PAYPAL_ID.test(transmissionId)||transmissionSig.length>4096)
    throw new Error("paypal_missing_webhook_signature");
  // Webhook verification uses only the fixed sandbox PayPal API; do not fetch
  // certUrl, ever. The postback verifier sees this URL as signed metadata.
  if(!/^https:\/\/api\.sandbox\.paypal\.com\/v1\/notifications\/certs\/[A-Za-z0-9_-]+$/.test(certUrl))
    throw new Error("paypal_untrusted_certificate_url");
  if(authAlgo!=="SHA256withRSA")throw new Error("paypal_unapproved_signature_algorithm");
  const time=Date.parse(transmissionTime);
  if(!Number.isFinite(time)||time>Date.now()+5*60*1000||Date.now()-time>3*24*60*60*1000+5*60*1000)
    throw new Error("paypal_stale_webhook");
  return {transmissionId,transmissionTime,transmissionSig,authAlgo,certUrl};
}

export async function verifyPaypalSandboxWebhook(input:{
  rawBody:string;headers:Headers;config:PaypalSandboxCredentials;
  token:string;fetcher?:FetchLike;
}):Promise<VerifiedWebhook>{
  if(!input.rawBody||Buffer.byteLength(input.rawBody,"utf8")>256*1024)
    throw new Error("paypal_invalid_webhook_size");
  const h=readPaypalWebhookHeaders(input.headers);
  let event:unknown;
  try{event=JSON.parse(input.rawBody)}catch{throw new Error("paypal_invalid_webhook_json");}
  if(!event||typeof event!=="object"||Array.isArray(event)||
     !PAYPAL_ID.test(String((event as {id?:unknown}).id??"")))
    throw new Error("paypal_invalid_webhook_event");
  if(!input.token||!input.config.webhookId)
    throw new Error("paypal_webhook_verification_not_configured");
  const response=await (input.fetcher??fetch)(PAYPAL_SANDBOX_API+"/v1/notifications/verify-webhook-signature",{
    method:"POST",headers:{"Authorization":"Bearer "+input.token,
      "Accept":"application/json","Content-Type":"application/json"},
    // Do not parse + reserialize the signed PayPal event: PayPal's
    // postback verifier can reject altered event serialization.
    body:"{"+
      '"transmission_id":'+JSON.stringify(h.transmissionId)+","+
      '"transmission_time":'+JSON.stringify(h.transmissionTime)+","+
      '"cert_url":'+JSON.stringify(h.certUrl)+","+
      '"auth_algo":'+JSON.stringify(h.authAlgo)+","+
      '"transmission_sig":'+JSON.stringify(h.transmissionSig)+","+
      '"webhook_id":'+JSON.stringify(input.config.webhookId)+","+
      '"webhook_event":'+input.rawBody+"}",
    cache:"no-store",
  });
  const check=await paypalJson(response);
  if(check.verification_status!=="SUCCESS")
    throw new Error("paypal_webhook_signature_not_verified");
  return event as VerifiedWebhook;
}

export function evaluatePaypalCapture(input:{
  event:VerifiedWebhook;expectedOrderId:string;expectedInvoice:CrmPayableInvoice;
  expectedMerchantId:string;
}):{accepted:boolean;reason:string;captureId?:string;eventId?:string}{
  const r=input.event.resource;
  if(input.event.event_type!=="PAYMENT.CAPTURE.COMPLETED")return {accepted:false,reason:"not_completed_event"};
  if(r?.status!=="COMPLETED")return {accepted:false,reason:"capture_not_completed"};
  if(!ORDER_ID.test(input.expectedOrderId)||r.supplementary_data?.related_ids?.order_id!==input.expectedOrderId)
    return {accepted:false,reason:"order_mismatch"};
  if(!input.expectedMerchantId||r.payee?.merchant_id!==input.expectedMerchantId)
    return {accepted:false,reason:"merchant_mismatch"};
  if(r.amount?.currency_code!=="USD"||input.expectedInvoice.currency!=="USD")
    return {accepted:false,reason:"currency_mismatch"};
  if(input.expectedInvoice.status!=="open")return {accepted:false,reason:"invoice_not_open"};
  let cents:number;
  try{cents=parsePayPalUsdCents(r.amount?.value)}catch{return {accepted:false,reason:"invalid_amount"};}
  if(cents!==input.expectedInvoice.amount_due_cents)
    return {accepted:false,reason:"amount_mismatch"};
  if(!PAYPAL_ID.test(String(r.id??""))||!PAYPAL_ID.test(String(input.event.id??"")))
    return {accepted:false,reason:"invalid_payment_identity"};
  return {accepted:true,reason:"verified_capture_requires_idempotent_ledger_commit",
    captureId:String(r.id),eventId:String(input.event.id)};
}

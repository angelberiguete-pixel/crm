import {minorToPayPalAmount, type PayPalCurrency} from "@/lib/paypal-core";

type PayPalLink = {rel?:string;href?:string};
type PayPalOrderResponse = {id?:string;status?:string;links?:PayPalLink[]};
const timeout = 12000;

function paypalBaseUrl() {
  return process.env.PAYPAL_MODE === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

function configured(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`PayPal environment variable missing: ${name}`);
  return value;
}

export function paypalMerchantId(): string {
  return configured("PAYPAL_MERCHANT_ID");
}

async function paypalAccessToken(): Promise<string> {
  const id = configured("PAYPAL_CLIENT_ID");
  const secret = configured("PAYPAL_CLIENT_SECRET");
  const auth = Buffer.from(`${id}:${secret}`).toString("base64");
  const response = await fetch(`${paypalBaseUrl()}/v1/oauth2/token`,{
    method:"POST",
    headers:{"Authorization":`Basic ${auth}`,"Content-Type":"application/x-www-form-urlencoded"},
    body:"grant_type=client_credentials",
    cache:"no-store",
    signal:AbortSignal.timeout(timeout)
  });
  if (!response.ok) throw new Error("PayPal token request failed");
  const body = await response.json() as {access_token?:string};
  if (!body.access_token) throw new Error("PayPal token response missing access_token");
  return body.access_token;
}

async function paypalPost<T>(path:string,payload:unknown,requestId?:string):Promise<T> {
  const token = await paypalAccessToken();
  const response = await fetch(`${paypalBaseUrl()}${path}`,{
    method:"POST",
    headers:{
      "Authorization":`Bearer ${token}`,
      "Content-Type":"application/json",
      ...(requestId?{"PayPal-Request-Id":requestId}:{})
    },
    body:JSON.stringify(payload),
    cache:"no-store",
    signal:AbortSignal.timeout(timeout)
  });
  if(!response.ok) throw new Error(`PayPal API failed (${response.status})`);
  return response.json() as Promise<T>;
}

export async function createPayPalOrder(input:{
  checkoutId:string;
  amountMinor:number;
  currency:PayPalCurrency;
}):Promise<{id:string;approvalUrl:string}> {
  const base = new URL(configured("PAYPAL_PUBLIC_BASE_URL"));
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash)
    throw new Error("PAYPAL_PUBLIC_BASE_URL must be an HTTPS origin");
  const origin = base.origin;
  const result = await paypalPost<PayPalOrderResponse>("/v2/checkout/orders",{
    intent:"CAPTURE",
    purchase_units:[{
      reference_id:input.checkoutId,
      custom_id:input.checkoutId,
      amount:{currency_code:input.currency,value:minorToPayPalAmount(input.amountMinor)}
    }],
    payment_source:{paypal:{experience_context:{
      user_action:"PAY_NOW",
      return_url:`${origin}/paypal/return?checkout=${encodeURIComponent(input.checkoutId)}`,
      cancel_url:`${origin}/paypal/cancel?checkout=${encodeURIComponent(input.checkoutId)}`
    }}}
  },`crm-create-${input.checkoutId}`);
  if(!result.id || !/^[A-Za-z0-9]{6,64}$/.test(result.id)) throw new Error("PayPal order ID missing");
  const approval = result.links?.find(link=>link.rel==="payer-action"||link.rel==="approve")?.href;
  if(!approval) throw new Error("PayPal approval URL missing");
  const parsed = new URL(approval);
  if(parsed.protocol!=="https:" || !["www.paypal.com","www.sandbox.paypal.com"].includes(parsed.hostname))
    throw new Error("Unexpected PayPal approval host");
  return {id:result.id,approvalUrl:approval};
}

export async function capturePayPalOrder(orderId:string):Promise<void> {
  if(!/^[A-Za-z0-9]{6,64}$/.test(orderId)) throw new Error("Invalid PayPal order ID");
  await paypalPost<PayPalOrderResponse>(
    `/v2/checkout/orders/${orderId}/capture`,{},`crm-capture-${orderId}`
  );
}

// The postback signature verification API is called BEFORE trusting any event.
// Only real sandbox/live webhooks work with this verification method;
// PayPal's simulator uses a different webhook ID.
export async function verifyPayPalWebhook(headers:Headers,event:unknown):Promise<boolean> {
  const keys = [
    "paypal-transmission-id","paypal-transmission-time",
    "paypal-cert-url","paypal-auth-algo","paypal-transmission-sig"
  ] as const;
  if(keys.some(key=>!headers.get(key))) return false;
  const timestamp=Date.parse(headers.get("paypal-transmission-time")!);
  if(!Number.isFinite(timestamp) || Math.abs(Date.now()-timestamp)>15*60*1000) return false;
  const body = {
    transmission_id:headers.get("paypal-transmission-id"),
    transmission_time:headers.get("paypal-transmission-time"),
    cert_url:headers.get("paypal-cert-url"),
    auth_algo:headers.get("paypal-auth-algo"),
    transmission_sig:headers.get("paypal-transmission-sig"),
    webhook_id:configured("PAYPAL_WEBHOOK_ID"),
    webhook_event:event
  };
  const result=await paypalPost<{verification_status?:string}>(
    "/v1/notifications/verify-webhook-signature",body
  );
  return result.verification_status==="SUCCESS";
}

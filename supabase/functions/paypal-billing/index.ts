import { createClient } from "npm:@supabase/supabase-js@2.116.0";

/**
 * PayPal invoice reconciliation for Family Power (and other tracked tenants).
 * NEVER accepts a client-side "paid" flag as evidence. PayPal API is the authority.
 * Secrets: PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_WEBHOOK_ID, PAYPAL_ENVIRONMENT.
 * Endpoint: https://ygipjqgyreeahslzorik.supabase.co/functions/v1/paypal-billing
 * POST signed PayPal webhooks OR authenticated {action:"sync",invoice_id:"..."}.
 */
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const env = (key: string) => Deno.env.get(key)?.trim() ?? "";
const isPaypalInvoiceId = (value: unknown): value is string =>
  typeof value === "string" && /^INV2-[A-Z0-9-]{8,100}$/.test(value);
const isUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);

const projectUrl = env("SUPABASE_URL");
const publishableKey = env("SUPABASE_ANON_KEY") ||
  ((): string => {
    try { return JSON.parse(env("SUPABASE_PUBLISHABLE_KEYS")).default ?? ""; }
    catch { return ""; }
  })();
const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY") ||
  ((): string => {
    try { return JSON.parse(env("SUPABASE_SECRET_KEYS")).default ?? ""; }
    catch { return ""; }
  })();
const admin = createClient(projectUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function paypalApi(): string {
  const mode = env("PAYPAL_ENVIRONMENT");
  if (mode === "live") return "https://api-m.paypal.com";
  if (mode === "sandbox") return "https://api-m.sandbox.paypal.com";
  throw Error("paypal_environment_missing");
}

async function paypalToken(): Promise<string> {
  const clientId = env("PAYPAL_CLIENT_ID");
  const clientSecret = env("PAYPAL_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw Error("paypal_credentials_missing");
  const basic = btoa(clientId + ":" + clientSecret);
  const response = await fetch(paypalApi() + "/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: "Basic " + basic,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw Error("paypal_auth_failed");
  const result = await response.json();
  if (typeof result?.access_token !== "string") throw Error("paypal_token_missing");
  return result.access_token;
}

async function paypalInvoice(invoiceId: string, token: string) {
  const response = await fetch(paypalApi() + "/v2/invoicing/invoices/" + encodeURIComponent(invoiceId), {
    headers: { Authorization: "Bearer " + token, Accept: "application/json" },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw Error("paypal_invoice_lookup_failed");
  const result = await response.json();
  if (result.id !== invoiceId) throw Error("paypal_invoice_id_mismatch");
  return result;
}

function cents(value: unknown): number {
  if (typeof value !== "string" || !/^\d+(\.\d{1,2})?$/.test(value)) return NaN;
  const [whole, decimal = ""] = value.split(".");
  const amount = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
  return Number.isSafeInteger(amount) ? amount : NaN;
}

async function reconcile(invoiceId: string, token: string) {
  const invoice = await paypalInvoice(invoiceId, token);
  if (invoice.status !== "PAID") {
    return { status: "unpaid", paypal_status: String(invoice.status ?? "UNKNOWN") };
  }
  const currency = invoice.amount?.currency_code ?? invoice.detail?.currency_code;
  const invoiceAmount = cents(invoice.amount?.value);
  if (currency !== "USD" || !Number.isSafeInteger(invoiceAmount) || invoiceAmount <= 0) {
    throw Error("paypal_invoice_amount_invalid");
  }
  const result = await admin.rpc("paypal_confirm_invoice_from_api", {
    p_provider_invoice_id: invoiceId,
    p_total_cents: invoiceAmount,
  });
  if (result.error) throw Error("invoice_reconciliation_failed");
  return result.data;
}

async function verifyPaypalWebhook(event: unknown, headers: Headers, token: string): Promise<boolean> {
  const webhookId = env("PAYPAL_WEBHOOK_ID");
  if (!webhookId) throw Error("paypal_webhook_id_missing");
  const fields = [
    "paypal-auth-algo", "paypal-cert-url", "paypal-transmission-id",
    "paypal-transmission-sig", "paypal-transmission-time",
  ];
  if (fields.some(k => !headers.get(k))) return false;
  const response = await fetch(paypalApi() + "/v1/notifications/verify-webhook-signature", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({
      auth_algo: headers.get("paypal-auth-algo"),
      cert_url: headers.get("paypal-cert-url"),
      transmission_id: headers.get("paypal-transmission-id"),
      transmission_sig: headers.get("paypal-transmission-sig"),
      transmission_time: headers.get("paypal-transmission-time"),
      webhook_id: webhookId,
      webhook_event: event,
    }),
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw Error("paypal_webhook_verification_unavailable");
  return (await response.json()).verification_status === "SUCCESS";
}

const isPaypalSubscriptionId = (v:unknown):v is string =>
  typeof v==="string" && /^I-[A-Z0-9]{6,100}$/.test(v);
const safeEventId = (v:unknown):v is string =>
  typeof v==="string" && v.length>=5 && v.length<=190;
const safeObject = (v:unknown):Record<string,unknown> =>
  v!==null && typeof v==="object" && !Array.isArray(v) ? v as Record<string,unknown> : {};

async function paypalSubscription(id:string,token:string){
  const r=await fetch(paypalApi()+"/v1/billing/subscriptions/"+encodeURIComponent(id),{
    headers:{Authorization:"Bearer "+token,Accept:"application/json"},
    signal:AbortSignal.timeout(12000)
  });
  if(!r.ok)throw Error("paypal_subscription_lookup_failed");
  const body=await r.json();
  if(body.id!==id)throw Error("paypal_subscription_id_mismatch");
  return body;
}

async function subscriptionEvent(event:Record<string,unknown>,token:string){
  const name=event.event_type;
  const eventId=event.id;
  const resource=safeObject(event.resource);
  const subscriptionId=resource.id;
  const accepted=[
    "BILLING.SUBSCRIPTION.ACTIVATED","BILLING.SUBSCRIPTION.CANCELLED",
    "BILLING.SUBSCRIPTION.EXPIRED","BILLING.SUBSCRIPTION.SUSPENDED",
    "BILLING.SUBSCRIPTION.PAYMENT.FAILED"
  ];
  if(!accepted.includes(String(name))||!safeEventId(eventId)||!isPaypalSubscriptionId(subscriptionId))
    return {status:"ignored"};
  const pp=await paypalSubscription(subscriptionId,token);
  const expected:Record<string,string>={
    "BILLING.SUBSCRIPTION.ACTIVATED":"ACTIVE",
    "BILLING.SUBSCRIPTION.CANCELLED":"CANCELLED",
    "BILLING.SUBSCRIPTION.EXPIRED":"EXPIRED",
    "BILLING.SUBSCRIPTION.SUSPENDED":"SUSPENDED"
  };
  if(expected[String(name)] && pp.status!==expected[String(name)])
    return {status:"stale_or_unverified"};
  const {data,error}=await admin.rpc("crm_record_verified_billing_event",{
    p_event_id:eventId,
    p_event_type:name,
    p_provider_subscription_id:subscriptionId,
    p_occurred_at:typeof event.create_time==="string" ? event.create_time:null
  });
  if(error)throw Error("subscription_event_storage_failed");
  return data;
}

async function subscriptionSale(event:Record<string,unknown>,token:string){
  const resource=safeObject(event.resource),eventId=event.id,saleId=resource.id;
  const subscriptionId=resource.billing_agreement_id;
  if(!safeEventId(eventId)||typeof saleId!=="string"||saleId.length<5
     ||!isPaypalSubscriptionId(subscriptionId))
    return {status:"ignored"};
  const saleResponse=await fetch(paypalApi()+"/v1/payments/sale/"+encodeURIComponent(saleId),{
    headers:{Authorization:"Bearer "+token,Accept:"application/json"},
    signal:AbortSignal.timeout(12000)
  });
  if(!saleResponse.ok)throw Error("paypal_sale_lookup_failed");
  const sale=await saleResponse.json();
  const amount=safeObject(sale.amount);
  const centsValue=cents(amount.total);
  if(sale.id!==saleId || sale.billing_agreement_id!==subscriptionId
     ||String(sale.state??"").toLowerCase()!=="completed"
     ||amount.currency!=="USD"||!Number.isSafeInteger(centsValue)||centsValue<=0)
    throw Error("paypal_sale_invalid");
  const pp=await paypalSubscription(subscriptionId,token);
  if(pp.status!=="ACTIVE")return {status:"manual_review"};
  // Reconcile from PayPal itself even when the activation event arrived late.
  const {error:activationError}=await admin.rpc("crm_record_verified_billing_event",{
    p_event_id:"verified-"+subscriptionId+"-ACTIVE",
    p_event_type:"BILLING.SUBSCRIPTION.ACTIVATED",
    p_provider_subscription_id:subscriptionId
  });
  if(activationError)throw Error("subscription_activation_storage_failed");
  const next=safeObject(pp.billing_info).next_billing_time;
  const {data,error}=await admin.rpc("crm_record_verified_subscription_sale",{
    p_event_id:eventId,
    p_sale_id:saleId,
    p_provider_subscription_id:subscriptionId,
    p_amount_cents:centsValue,
    p_currency:"USD",
    p_payment_time:typeof sale.update_time==="string"?sale.update_time:null,
    p_next_billing_time:typeof next==="string"?next:null
  });
  if(error)throw Error("subscription_sale_storage_failed");
  return data;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    if (!projectUrl || !publishableKey || !serviceKey) throw Error("supabase_config_missing");
    if (Number(req.headers.get("content-length") ?? "0") > 262144) {
      return json({ error: "payload_too_large" }, 413);
    }
    const raw = await req.text();
    if (raw.length > 262144) return json({ error: "payload_too_large" }, 413);
    let payload: Record<string, unknown>;
    try { payload = JSON.parse(raw); } catch { return json({ error: "invalid_json" }, 400); }
    if (payload === null || typeof payload !== "object" || Array.isArray(payload))
      return json({ error: "invalid_json" }, 400);

    // Public webhook path: PayPal does not present a Supabase JWT.
    if (req.headers.has("paypal-transmission-id")) {
      const token = await paypalToken();
      if (!await verifyPaypalWebhook(payload, req.headers, token))
        return json({ error: "invalid_signature" }, 401);
      if (payload.event_type === "INVOICING.INVOICE.PAID") {
        const invoiceId = safeObject(payload.resource).id;
        if (!isPaypalInvoiceId(invoiceId)) return json({ ok: true, ignored: true });
        const reconciled = await reconcile(invoiceId, token);
        return json({ ok: true, status: reconciled?.status ?? "unknown" });
      }
      if (payload.event_type === "PAYMENT.SALE.COMPLETED") {
        const settled=await subscriptionSale(payload,token);
        return json({ ok:true,status:settled?.status??"ignored" });
      }
      if (typeof payload.event_type==="string" && payload.event_type.startsWith("BILLING.SUBSCRIPTION.")) {
        const subscription=await subscriptionEvent(payload,token);
        return json({ok:true,status:subscription?.status??"ignored"});
      }
      return json({ok:true,ignored:true});
    }

    // Optional user-driven reconciliation if a PayPal event is delayed.
    // Authorization is checked by Supabase and invoicing SELECT RLS.
    if (payload.action !== "sync" || !isUuid(payload.invoice_id))
      return json({ error: "invalid_request" }, 400);
    const auth = req.headers.get("authorization") ?? "";
    if (!/^Bearer /i.test(auth)) return json({ error: "unauthorized" }, 401);
    const userClient = createClient(projectUrl, publishableKey, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userResult, error: userError } =
      await userClient.auth.getUser(auth.substring(7));
    if (userError || !userResult?.user) return json({ error: "unauthorized" }, 401);
    const { data: tracked, error: readError } =
      await userClient.from("billing_invoices")
        .select("id,provider_invoice_id,status")
        .eq("id", payload.invoice_id).eq("provider", "paypal").maybeSingle();
    if (readError || !tracked || !isPaypalInvoiceId(tracked.provider_invoice_id))
      return json({ error: "invoice_not_available" }, 403);
    const token = await paypalToken();
    const result = await reconcile(tracked.provider_invoice_id, token);
    return json({ ok: true, status: result?.status ?? "unknown" });
  } catch (err) {
    const code = err instanceof Error ? err.message : "integration_error";
    const config = ["paypal_credentials_missing","paypal_environment_missing","paypal_webhook_id_missing","supabase_config_missing"].includes(code);
    // Deliberately avoid echoing providers' API payloads or credentials.
    return json({ error: config ? "integration_not_configured" : "paypal_verification_failed" }, 503);
  }
});

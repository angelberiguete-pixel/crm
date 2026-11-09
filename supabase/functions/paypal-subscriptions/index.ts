import { createClient } from "npm:@supabase/supabase-js@2.116.0";

/**
 * Subscription REST gateway. PayPal is the billing authority; no card data or secrets
 * reach a browser. Deploy separately from the existing invoice reconciliation function.
 * Keep verify_jwt=false ONLY because PayPal cannot send a Supabase user JWT:
 * every non-webhook route verifies user JWT; webhooks verify PayPal signature.
 * This first plan is Family Power USD 80/month under Angel Beriguete's merchant.
 */
const getEnv = (key: string) => Deno.env.get(key)?.trim() ?? "";
const projectUrl = getEnv("SUPABASE_URL");
const userKey = getEnv("SUPABASE_ANON_KEY") || (() => {
  try { return JSON.parse(getEnv("SUPABASE_PUBLISHABLE_KEYS")).default ?? ""; }
  catch { return ""; }
})();
const serviceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY") || (() => {
  try { return JSON.parse(getEnv("SUPABASE_SECRET_KEYS")).default ?? ""; }
  catch { return ""; }
})();
const service = createClient(projectUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-client-info",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Cache-Control": "no-store",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json" },
});
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const subscriptionPattern = /^I-[A-Z0-9]{7,50}$/;
const PLAN_KEY = "family-power-arm-usd80-month";

function apiBase(): string {
  const env = getEnv("PAYPAL_ENVIRONMENT");
  if (env === "live") return "https://api-m.paypal.com";
  if (env === "sandbox") return "https://api-m.sandbox.paypal.com";
  throw Error("paypal_environment_not_configured");
}

async function token(): Promise<string> {
  const id = getEnv("PAYPAL_CLIENT_ID"), secret = getEnv("PAYPAL_CLIENT_SECRET");
  if (!id || !secret) throw Error("paypal_credentials_not_configured");
  const response = await fetch(apiBase() + "/v1/oauth2/token", {
    method: "POST",
    headers: { Authorization: "Basic " + btoa(id + ":" + secret), "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials", signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw Error("paypal_oauth_unavailable");
  const body = await response.json();
  if (typeof body.access_token !== "string") throw Error("paypal_oauth_invalid");
  return body.access_token;
}
async function paypal(path: string, access: string, method = "GET", body?: unknown, key?: string) {
  const headers: Record<string, string> = { Authorization: "Bearer " + access, Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (key) headers["PayPal-Request-Id"] = key;
  const response = await fetch(apiBase() + path, {
    method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw Error("paypal_request_failed_" + response.status);
  return response.status === 204 ? {} : response.json();
}

function approvalUrl(links: unknown): string | null {
  if (!Array.isArray(links)) return null;
  const candidate = links.find((item) => item?.rel === "approve" && item?.method === "GET");
  if (!candidate || typeof candidate.href !== "string") return null;
  try {
    const u = new URL(candidate.href);
    const expectedHost = getEnv("PAYPAL_ENVIRONMENT") === "live" ? "www.paypal.com" : "www.sandbox.paypal.com";
    if (u.protocol !== "https:" || u.hostname !== expectedHost || u.username || u.password) return null;
    return u.toString();
  } catch { return null; }
}

function isUsd80Monthly(plan: any): boolean {
  const cycles = plan?.billing_cycles;
  if (!Array.isArray(cycles)) return false;
  const regular = cycles.filter((c: any) => c.tenure_type === "REGULAR");
  return regular.length === 1 && cycles.length === 1 &&
    regular[0]?.frequency?.interval_unit === "MONTH" && regular[0]?.frequency?.interval_count === 1 &&
    regular[0]?.total_cycles === 0 &&
    regular[0]?.pricing_scheme?.fixed_price?.currency_code === "USD" &&
    regular[0]?.pricing_scheme?.fixed_price?.value === "80.00" &&
    plan?.status === "ACTIVE";
}

async function clientFor(req: Request) {
  const bearer = req.headers.get("authorization") || "";
  if (!/^Bearer [^\s]+$/i.test(bearer)) throw Error("unauthorized");
  const user = createClient(projectUrl, userKey, {
    global: { headers: { Authorization: bearer } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const result = await user.auth.getUser(bearer.replace(/^Bearer /i, ""));
  if (result.error || !result.data.user) throw Error("unauthorized");
  return user;
}

async function exactPlan() {
  const { data, error } = await service.from("billing_gateway_plans")
    .select("id,plan_key,description,amount_cents,currency,interval_count,interval_unit,provider_product_id,provider_plan_id,status")
    .eq("plan_key", PLAN_KEY).maybeSingle();
  if (error || !data || data.amount_cents !== 8000 || data.currency !== "USD" ||
      data.interval_unit !== "MONTH" || data.interval_count !== 1) throw Error("plan_not_available");
  return data;
}

async function provision(req: Request) {
  const user = await clientFor(req);
  // The existing SELECT policy allows this row ONLY to the platform owner.
  const { data: permitted, error: aclError } = await user.from("billing_gateway_plans")
    .select("id").eq("plan_key", PLAN_KEY).maybeSingle();
  if (aclError || !permitted) return json({ error: "forbidden" }, 403);
  if (getEnv("PAYPAL_SUBSCRIPTIONS_ENABLED") !== "true") return json({ error: "subscriptions_not_enabled" }, 503);

  const plan = await exactPlan();
  if (plan.status === "ready" && plan.provider_plan_id) return json({ ok: true, status: "ready" });
  if (plan.status !== "pending") return json({ error: "plan_requires_operator_review", status: plan.status }, 409);
  // Fail before locking the plan if credentials and webhook endpoint are not configured.
  if (!getEnv("PAYPAL_SUBSCRIPTIONS_WEBHOOK_ID")) throw Error("webhook_not_configured");
  const access = await token();
  // Atomic compare-and-set: simultaneous operator clicks cannot create two products.
  const { data: claimed, error: claimError } = await service.from("billing_gateway_plans")
    .update({ status: "provisioning", updated_at: new Date().toISOString() })
    .eq("id", plan.id).eq("status", "pending").select("id").maybeSingle();
  if (claimError || !claimed) return json({ error: "plan_already_in_progress" }, 409);
  try {
    let productId = plan.provider_product_id;
    if (!productId) {
      const product = await paypal("/v1/catalogs/products", access, "POST", {
        name: "Family Power ARM", description: "Licencia y soporte de plataforma ARM",
        type: "SERVICE", category: "SOFTWARE",
      }, "ab-fp-prod-" + plan.id);
      if (typeof product?.id !== "string" || !product.id.startsWith("PROD-")) throw Error("paypal_product_invalid");
      productId = product.id;
      const saved = await service.from("billing_gateway_plans").update({
        provider_product_id: productId, updated_at: new Date().toISOString(),
      }).eq("id", plan.id).eq("status", "provisioning");
      if (saved.error) throw Error("product_persistence_failed");
    }
    const remote = await paypal("/v1/billing/plans", access, "POST", {
      product_id: productId,
      name: "Family Power ARM US$80 mensual",
      description: "Soporte y licencia mensual, sin cargo de instalación en este plan",
      status: "ACTIVE",
      billing_cycles: [{
        frequency: { interval_unit: "MONTH", interval_count: 1 },
        tenure_type: "REGULAR", sequence: 1, total_cycles: 0,
        pricing_scheme: { fixed_price: { value: "80.00", currency_code: "USD" } },
      }],
      payment_preferences: {
        auto_bill_outstanding: true, setup_fee: { value: "0.00", currency_code: "USD" },
        setup_fee_failure_action: "CONTINUE", payment_failure_threshold: 3,
      },
    }, "ab-fp-plan-" + plan.id);
    if (!/^P-[A-Z0-9]{7,50}$/.test(remote?.id ?? "")) throw Error("paypal_plan_invalid");
    const verified = await paypal("/v1/billing/plans/" + encodeURIComponent(remote.id), access);
    if (!isUsd80Monthly(verified)) throw Error("paypal_plan_amount_not_verified");
    const saved = await service.from("billing_gateway_plans").update({
      provider_plan_id: remote.id, provider_product_id: productId,
      status: "ready", updated_at: new Date().toISOString(),
    }).eq("id", plan.id).eq("status", "provisioning");
    if (saved.error) throw Error("plan_persistence_failed");
    return json({ ok: true, status: "ready" });
  } catch (error) {
    // Never silently retry an uncertain PayPal create: operator must reconcile
    // provider resources before resetting the state to avoid duplicate products.
    await service.from("billing_gateway_plans").update({
      status: "error", updated_at: new Date().toISOString(),
    }).eq("id", plan.id).eq("status", "provisioning");
    throw error;
  }
}

async function ensureAuthorizedTenant(user: any, tenantId: string) {
  if (!uuidPattern.test(tenantId)) throw Error("invalid_tenant");
  const membership = await user.rpc("list_my_tenants");
  if (membership.error) throw Error("authorization_unavailable");
  const row = (membership.data || []).find((m: any) =>
    m.tenant_id === tenantId && m.tenant_slug === "family-power" &&
    m.is_active === true && ["owner", "admin"].includes(m.membership_role));
  if (!row) throw Error("forbidden");
}

async function startSubscription(req: Request, payload: Record<string, unknown>) {
  const user = await clientFor(req);
  const tenantId = payload.tenant_id;
  if (typeof tenantId !== "string") return json({ error: "invalid_tenant" }, 400);
  await ensureAuthorizedTenant(user, tenantId);
  if (getEnv("PAYPAL_SUBSCRIPTIONS_ENABLED") !== "true") return json({ error: "subscriptions_not_enabled" }, 503);
  const { data: invoice, error: invoiceError } = await user.from("billing_invoices")
    .select("id,status,currency,total_cents,amount_paid_cents,amount_due_cents")
    .eq("tenant_id", tenantId).contains("metadata", { billing_stage: "initial" })
    .eq("status", "paid").maybeSingle();
  if (invoiceError || !invoice || invoice.currency !== "USD" || invoice.total_cents !== 19700 ||
      invoice.amount_due_cents !== 0 || invoice.amount_paid_cents < 19700)
    return json({ error: "initial_invoice_not_paid" }, 409);
  const plan = await exactPlan();
  if (plan.status !== "ready" || !/^P-[A-Z0-9]{7,50}$/.test(plan.provider_plan_id ?? ""))
    return json({ error: "paypal_plan_not_ready" }, 409);
  const { data: sub, error: subError } = await service.from("tenant_subscriptions")
    .select("id,tenant_id,provider,provider_subscription_id,provider_approval_state,provider_approval_url,custom_monthly_price_cents,current_period_end")
    .eq("tenant_id", tenantId).maybeSingle();
  if (subError || !sub) throw Error("tenant_subscription_missing");
  if (sub.provider_approval_state === "awaiting_buyer" && sub.provider_subscription_id && sub.provider_approval_url) {
    return json({ ok: true, status: "awaiting_buyer", approval_url: sub.provider_approval_url });
  }
  if (sub.provider_approval_state !== "not_requested" || sub.provider_subscription_id)
    return json({ error: "existing_subscription_requires_review" }, 409);
  if (sub.custom_monthly_price_cents !== 8000)
    return json({ error: "monthly_price_not_confirmed" }, 409);
  const start = new Date(sub.current_period_end ?? "");
  if (Number.isNaN(start.getTime()) || start.getTime() <= Date.now() + 60_000)
    return json({ error: "billing_start_date_not_configured" }, 409);
  if (!getEnv("PAYPAL_SUBSCRIPTIONS_WEBHOOK_ID")) throw Error("webhook_not_configured");
  const returnOrigin = getEnv("PAYPAL_RETURN_ORIGIN") || "https://crm-revenue-os.vercel.app";
  if (returnOrigin !== "https://crm-revenue-os.vercel.app" && returnOrigin !== "https://crm-look.vercel.app")
    throw Error("return_origin_not_configured");
  const access = await token();
  const remotePlan = await paypal("/v1/billing/plans/" + encodeURIComponent(plan.provider_plan_id), access);
  if (!isUsd80Monthly(remotePlan)) return json({ error: "paypal_plan_mismatch" }, 409);
  // Atomically reserve one approval request. A concurrent call gets a 409.
  const { data: claimed, error: claimError } = await service.from("tenant_subscriptions")
    .update({ provider_approval_state: "awaiting_buyer", provider: "paypal", provider_plan_id: plan.provider_plan_id })
    .eq("id", sub.id).eq("provider_approval_state", "not_requested")
    .is("provider_subscription_id", null).select("id").maybeSingle();
  if (claimError || !claimed) return json({ error: "approval_already_started" }, 409);
  try {
    const remote = await paypal("/v1/billing/subscriptions", access, "POST", {
      plan_id: plan.provider_plan_id,
      start_time: start.toISOString(),
      custom_id: "tenant:" + tenantId,
      application_context: {
        brand_name: "Angel Beriguete",
        locale: "es-ES", shipping_preference: "NO_SHIPPING",
        user_action: "SUBSCRIBE_NOW",
        return_url: returnOrigin + "/crm/pagos",
        cancel_url: returnOrigin + "/crm/pagos",
      },
    }, "ab-fp-sub-" + sub.id);
    const url = approvalUrl(remote?.links);
    if (!subscriptionPattern.test(remote?.id ?? "") || remote.status !== "APPROVAL_PENDING" || !url ||
        remote.plan_id !== plan.provider_plan_id) throw Error("paypal_subscription_invalid");
    const saved = await service.from("tenant_subscriptions").update({
      provider_subscription_id: remote.id, provider_approval_url: url,
      provider_approval_state: "awaiting_buyer", updated_at: new Date().toISOString(),
    }).eq("id", sub.id).eq("provider_approval_state", "awaiting_buyer").is("provider_subscription_id", null);
    if (saved.error) throw Error("subscription_persistence_failed");
    return json({ ok: true, status: "awaiting_buyer", approval_url: url });
  } catch (error) {
    // Do not allow a repeat API create if a PayPal subscription may already exist.
    // Operator must check PayPal before resetting this locked state.
    throw error;
  }
}

async function verifyWebhook(req: Request, event: unknown, access: string) {
  const webhookId = getEnv("PAYPAL_SUBSCRIPTIONS_WEBHOOK_ID");
  if (!webhookId) throw Error("webhook_not_configured");
  const keys = ["paypal-auth-algo", "paypal-cert-url", "paypal-transmission-id",
    "paypal-transmission-sig", "paypal-transmission-time"];
  if (keys.some((name) => !req.headers.has(name))) return false;
  const result = await paypal("/v1/notifications/verify-webhook-signature", access, "POST", {
    auth_algo: req.headers.get("paypal-auth-algo"),
    cert_url: req.headers.get("paypal-cert-url"),
    transmission_id: req.headers.get("paypal-transmission-id"),
    transmission_sig: req.headers.get("paypal-transmission-sig"),
    transmission_time: req.headers.get("paypal-transmission-time"),
    webhook_id: webhookId, webhook_event: event,
  });
  return result?.verification_status === "SUCCESS";
}

async function webhook(req: Request, event: Record<string, any>) {
  const access = await token();
  if (!await verifyWebhook(req, event, access)) return json({ error: "bad_paypal_signature" }, 401);
  const permitted = [
    "BILLING.SUBSCRIPTION.ACTIVATED", "BILLING.SUBSCRIPTION.CANCELLED",
    "BILLING.SUBSCRIPTION.EXPIRED", "BILLING.SUBSCRIPTION.SUSPENDED",
    "BILLING.SUBSCRIPTION.PAYMENT.FAILED", "PAYMENT.SALE.COMPLETED",
  ];
  if (!permitted.includes(event.event_type)) return json({ ok: true, ignored: true });
  if (typeof event.id !== "string" || event.id.length < 5 || event.id.length > 190)
    return json({ error: "invalid_event" }, 400);
  const subId = event.event_type === "PAYMENT.SALE.COMPLETED"
    ? event.resource?.billing_agreement_id : event.resource?.id;
  if (typeof subId !== "string" || !subscriptionPattern.test(subId))
    return json({ ok: true, ignored: true });
  const { data: sub, error: subError } = await service.from("tenant_subscriptions")
    .select("id,provider_plan_id,provider_subscription_id,custom_monthly_price_cents")
    .eq("provider", "paypal").eq("provider_subscription_id", subId).maybeSingle();
  if (subError || !sub || sub.custom_monthly_price_cents !== 8000)
    return json({ ok: true, ignored: true });
  const remote = await paypal("/v1/billing/subscriptions/" + encodeURIComponent(subId), access);
  if (remote.id !== subId || remote.plan_id !== sub.provider_plan_id)
    return json({ error: "subscription_mismatch" }, 409);
  const expected: Record<string, string[]> = {
    "BILLING.SUBSCRIPTION.ACTIVATED": ["ACTIVE"],
    "BILLING.SUBSCRIPTION.CANCELLED": ["CANCELLED"],
    "BILLING.SUBSCRIPTION.EXPIRED": ["EXPIRED"],
    "BILLING.SUBSCRIPTION.SUSPENDED": ["SUSPENDED"],
  };
  if (expected[event.event_type] && !expected[event.event_type].includes(remote.status))
    return json({ ok: true, ignored: true, reason: "stale_event" });
  let amountCents: number | null = null;
  let currency: string | null = null;
  if (event.event_type === "PAYMENT.SALE.COMPLETED") {
    const money = event.resource?.amount;
    currency = money?.currency ?? money?.currency_code;
    const strAmount = money?.total ?? money?.value;
    if (currency !== "USD" || strAmount !== "80.00")
      return json({ ok: true, ignored: true, reason: "unexpected_payment_amount" });
    amountCents = 8000;
  }
  const { data, error } = await service.rpc("crm_record_verified_billing_event", {
    p_event_id: event.id, p_event_type: event.event_type,
    p_provider_subscription_id: subId, p_amount_cents: amountCents,
    p_currency: currency, p_occurred_at: event.create_time ?? null,
  });
  if (error) throw Error("event_ledger_failed");
  return json({ ok: true, status: data?.status ?? "unknown" });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!projectUrl || !userKey || !serviceKey) return json({ error: "service_not_configured" }, 503);
  try {
    if (Number(req.headers.get("content-length") || "0") > 65536) return json({ error: "request_too_large" }, 413);
    const raw = await req.text();
    if (raw.length > 65536) return json({ error: "request_too_large" }, 413);
    let data: Record<string, any>;
    try { data = JSON.parse(raw); } catch { return json({ error: "invalid_json" }, 400); }
    if (!data || typeof data !== "object" || Array.isArray(data)) return json({ error: "invalid_json" }, 400);
    if (req.headers.has("paypal-transmission-id")) return await webhook(req, data);
    if (data.action === "provision_plan") return await provision(req);
    if (data.action === "start_subscription") return await startSubscription(req, data);
    return json({ error: "unsupported_action" }, 400);
  } catch (error) {
    const code = error instanceof Error ? error.message : "unexpected_error";
    if (code === "unauthorized") return json({ error: "unauthorized" }, 401);
    if (code === "forbidden" || code === "invalid_tenant") return json({ error: code }, 403);
    // A safe error string, never provider secrets, tokens, card details, or raw payloads.
    const known = [
      "paypal_credentials_not_configured", "paypal_environment_not_configured",
      "return_origin_not_configured", "webhook_not_configured",
      "plan_not_available", "tenant_subscription_missing", "authorization_unavailable",
      "paypal_plan_amount_not_verified", "paypal_plan_invalid", "paypal_product_invalid",
      "paypal_subscription_invalid", "subscription_persistence_failed",
      "product_persistence_failed", "plan_persistence_failed", "event_ledger_failed",
    ];
    return json({ error: known.includes(code) ? code : "payment_provider_unavailable" }, 503);
  }
});

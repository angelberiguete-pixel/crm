import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const edge = readFileSync(new URL("../supabase/functions/paypal-subscriptions/index.ts", import.meta.url), "utf8");
const portal = readFileSync(new URL("../components/family-power-billing-portal.tsx", import.meta.url), "utf8");
const owner = readFileSync(new URL("../components/platform-billing-reviews.tsx", import.meta.url), "utf8");

test("creates fixed monthly USD 80 plan only after platform-owner read policy", () => {
  assert.match(edge, /const PLAN_KEY = "family-power-arm-usd80-month"/);
  assert.match(edge, /user\.from\("billing_gateway_plans"\)/);
  assert.match(edge, /if \(aclError \|\| !permitted\).*403/);
  assert.match(edge, /amount_cents !== 8000/);
  assert.match(edge, /"MONTH"/);
  assert.match(edge, /fixed_price: \{ value: "80.00", currency_code: "USD" \}/);
  assert.match(edge, /isUsd80Monthly\(verified\)/);
});

test("plan provisioning has atomic claim and no automatic retry after unknown result", () => {
  assert.match(edge, /eq\("status", "pending"\)\.select\("id"\)\.maybeSingle\(\)/);
  assert.match(edge, /"PayPal-Request-Id"/);
  assert.match(edge, /status: "error"/);
  assert.match(owner, /provisionMonthlyPlan/);
  assert.match(owner, /window\.confirm/);
});

test("buyer authorization requires authenticated tenant admin and verified initial payment", () => {
  assert.match(edge, /user\.auth\.getUser/);
  assert.match(edge, /user\.rpc\("list_my_tenants"\)/);
  assert.match(edge, /m\.tenant_slug === "family-power"/);
  assert.match(edge, /\["owner", "admin"\]/);
  assert.match(edge, /initial_invoice_not_paid/);
  assert.match(edge, /invoice\.amount_due_cents !== 0/);
  assert.match(edge, /invoice\.amount_paid_cents < 19700/);
  assert.match(edge, /sub\.custom_monthly_price_cents !== 8000/);
  assert.match(edge, /start_time: start\.toISOString\(\)/);
  assert.match(edge, /status: "awaiting_buyer"/);
  assert.match(edge, /approval_already_started/);
  assert.match(portal, /start_subscription/);
});

test("subscription approval is hosted on PayPal, never implied by a redirect", () => {
  assert.match(edge, /shipping_preference: "NO_SHIPPING"/);
  assert.match(edge, /u\.protocol !== "https:"/);
  assert.match(edge, /u\.hostname !== expectedHost/);
  assert.match(portal, /Autorizar suscripción en PayPal/);
  assert.doesNotMatch(edge, /status: "active"/);
});

test("webhooks check PayPal signature and verify remote subscription before logging events", () => {
  assert.match(edge, /verify-webhook-signature/);
  assert.match(edge, /verification_status === "SUCCESS"/);
  assert.match(edge, /paypal\("\/v1\/billing\/subscriptions\/"/);
  assert.match(edge, /remote\.plan_id !== sub\.provider_plan_id/);
  assert.match(edge, /unexpected_payment_amount/);
  assert.match(edge, /crm_record_verified_billing_event/);
  assert.match(edge, /"BILLING.SUBSCRIPTION.CANCELLED"/);
  assert.match(edge, /"BILLING.SUBSCRIPTION.PAYMENT.FAILED"/);
});

test("manual PayPal link is not treated as a recurring subscription", () => {
  assert.doesNotMatch(edge, /PLB-CAHFX5WVEL52/);
  assert.doesNotMatch(portal, /PLB-CAHFX5WVEL52/);
  assert.match(portal, /No se activa un cargo recurrente automático sin autorizar una suscripción/);
});

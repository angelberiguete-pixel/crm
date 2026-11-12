import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../app/empresia/pay/page.tsx", import.meta.url), "utf8");
const checkout = readFileSync(new URL("../app/empresia/checkout/page.tsx", import.meta.url), "utf8");
const edge = readFileSync(new URL("../supabase/functions/empresia-commerce/index.ts", import.meta.url), "utf8");

test("Empresia Pay is restricted to the authenticated platform owner", () => {
  assert.match(page, /supabase\.auth\.getUser\(\)/);
  assert.match(page, /crm_billing_financial_snapshot/);
  assert.match(page, /p_tenant_id: null/);
  assert.match(page, /if \(accessError\)/);
  assert.match(page, /authorized === false/);
});

test("Console is read-only and reuses existing checkout instead of creating money", () => {
  assert.match(page, /\.from\("empresia_checkout_orders"\)/);
  assert.match(page, /\.from\("empresia_subscription_sales"\)/);
  assert.match(page, /href="\/empresia\/comercio"/);
  assert.match(page, /href="\/empresia\/tienda"/);
  assert.match(checkout, /action:"checkout"/);
  assert.match(edge, /PAYPAL_CLIENT_SECRET/);
  assert.doesNotMatch(page, /\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
  assert.doesNotMatch(page, /PAYPAL_CLIENT_SECRET|SUPABASE_SERVICE_ROLE_KEY/);
});

test("Only PayPal captured one-time orders or verified recurring sales count as collected", () => {
  assert.match(page, /order\.status === "paid" && Boolean\(order\.paypal_capture_id\)/);
  assert.match(page, /sales\.map\(sale =>/);
  assert.match(page, /movement\.status === "confirmed"/);
  assert.match(page, /confirmed\.reduce/);
  assert.doesNotMatch(page, /order\.status === "active"\s*\?/);
});

test("Console does not misrepresent revenue as a bank balance or offer unauthorized transfers", () => {
  assert.match(page, /no saldo de PayPal ni saldo bancario disponible/);
  assert.match(page, /comisiones, disputas, reembolsos y liquidaciones bancarias/);
  assert.match(page, /falta una integración bancaria autorizada/);
  assert.match(page, /No se muestran como habilitados/);
  assert.match(page, /limit\(100\)/);
});

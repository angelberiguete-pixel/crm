import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const admin = source("app/empresia/comercio/page.tsx");
const edge = source("supabase/functions/empresia-commerce/index.ts");
const schema = source("supabase/migrations/20261109050000_empresia_commercial_checkout.sql");

test("Only the official three plans and their existing USD prices are bulk-activated", () => {
  assert.match(admin, /slug:"empresia-essential",cents:8000/);
  assert.match(admin, /slug:"empresia-growth",cents:46000/);
  assert.match(admin, /slug:"empresia-scale",cents:80000/);
  assert.match(admin, /catalogReady=fixedPlans\.every/);
  assert.match(admin, /allPublished=catalogReady/);
  assert.match(admin, /Activar los tres planes en PayPal Live/);
  assert.match(admin, /window\.confirm/);
});

test("Live provisioning is owner-authorized and validates provider plan status, price and interval", () => {
  assert.match(admin, /crm_billing_financial_snapshot/);
  assert.match(admin, /body:\{action:"publish_plan",offer_id:offer\.id\}/);
  assert.match(admin, /ready\?\.environment!=="live"/);
  assert.match(admin, /saved\?\.paypal_plan_id!==ready\.plan_id/);
  assert.match(admin, /\.eq\("paypal_plan_id",ready\.plan_id\)/);
  assert.match(edge, /if\(action==="publish_plan"\)/);
  assert.match(edge, /if\(access\)return reply\(\{error:"platform_owner_required"\},403\)/);
  assert.match(edge, /PAYPAL_ENVIRONMENT"\)!=="live"/);
  assert.match(edge, /\/v1\/billing\/plans\//);
  assert.match(edge, /detail\.status!=="ACTIVE"/);
  assert.match(edge, /recurring\?\.frequency\?\.interval_unit!=="MONTH"/);
  assert.match(edge, /recurring\?\.frequency\?\.interval_count!==1/);
  assert.match(edge, /parseAmount\(recurring\?\.pricing_scheme\?\.fixed_price\?\.value\)!==offer\.usd_price_cents/);
  assert.match(edge, /environment:"live"/);
});

test("No customer is subscribed or charged by activating the catalogue", () => {
  assert.doesNotMatch(admin, /action:"checkout"|action:"capture"|\.rpc\("empresia_confirm_checkout_capture"/);
  assert.doesNotMatch(admin, /PAYPAL_CLIENT_SECRET|SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(edge, /action==="checkout"/);
  assert.match(edge, /buyer\.id/);
  assert.match(schema, /status<>'published' or kind='one_time' or paypal_plan_id is not null/);
  assert.match(admin, /cada cliente debe autorizar su propia suscripción/);
});

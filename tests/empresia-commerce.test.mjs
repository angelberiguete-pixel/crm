import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const sql=read("supabase/migrations/20261109050000_empresia_commercial_checkout.sql");
const lock=read("supabase/migrations/20261109053000_empresia_checkout_hardening.sql");
const edge=read("supabase/functions/empresia-commerce/index.ts");
const webhook=read("supabase/functions/paypal-billing/index.ts");
const catalog=read("app/empresia/tienda/page.tsx");
const checkout=read("app/empresia/checkout/page.tsx");
const purchases=read("app/empresia/mis-compras/page.tsx");
const admin=read("app/empresia/comercio/page.tsx");
const login=read("app/login/page.tsx");

test("Offers are draft by default, priced in USD and never invented by migration",()=>{
 assert.match(sql,/create table if not exists public\.empresia_offers/);
 assert.match(sql,/status text not null default 'draft'/);
 assert.match(sql,/usd_price_cents bigint not null/);
 assert.match(sql,/check\(kind in \('one_time','monthly'\)\)/);
 assert.doesNotMatch(sql,/insert into public\.empresia_offers\s*\(/);
 assert.match(catalog,/\.eq\("status","published"\)/);
 assert.match(admin,/Guardar borrador/);
});
test("Catalogue admin writes require platform owner and offer payment terms freeze once sold",()=>{
 assert.match(sql,/private\.crm_is_platform_owner\(\)/);
 assert.match(sql,/billing_invoice/);
 assert.match(lock,/empresia_lock_offer_price/);
 assert.match(lock,/new\.usd_price_cents is distinct from old\.usd_price_cents/);
 assert.match(lock,/one_unfinished_subscription_per_buyer/);
 assert.match(admin,/crm_billing_financial_snapshot/);
});
test("Buyer and entitlement access are scoped with RLS and cannot self-report paid",()=>{
 assert.match(sql,/empresia_checkout_orders enable row level security/);
 assert.match(sql,/empresia_entitlements enable row level security/);
 assert.match(sql,/buyer_id=\(select auth\.uid\(\)\)/);
 assert.match(sql,/revoke all on public\.empresia_checkout_orders from public,anon,authenticated/);
 assert.match(sql,/revoke all on public\.empresia_entitlements from public,anon,authenticated/);
 assert.match(purchases,/empresia_entitlements/);
});
test("PayPal is called server side and checkout cannot set arbitrary price",()=>{
 assert.match(edge,/PAYPAL_CLIENT_SECRET/);
 assert.match(edge,/PAYPAL_ENVIRONMENT/);
 assert.match(edge,/intent:"CAPTURE"/);
 assert.match(edge,/usd\(offer\.usd_price_cents\)/);
 assert.match(edge,/offer\.status/);
 assert.match(edge,/\.eq\("status","published"\)/);
 assert.doesNotMatch(checkout,/PAYPAL_CLIENT_SECRET/);
 assert.match(edge,/too_many_attempts/);
});
test("One-time orders only settle after approved capture and server lookup",()=>{
 assert.match(edge,/current\.status==="APPROVED"/);
 assert.match(edge,/\/v2\/checkout\/orders\//);
 assert.match(edge,/\/capture"/);
 assert.match(edge,/paypal_order_mismatch/);
 assert.match(edge,/empresia_confirm_checkout_capture/);
 assert.match(sql,/v_order\.amount_cents<>p_cents/);
 assert.match(sql,/on conflict\(provider,provider_invoice_id\) do nothing/);
 assert.match(webhook,/verifyPaypalWebhook/);
 assert.match(webhook,/PAYMENT\.CAPTURE\.COMPLETED/);
 assert.match(webhook,/empresiaCapture\(payload,token\)/);
});
test("Monthly subscriptions are opt-in; only active provider state creates entitlement",()=>{
 assert.match(edge,/application_context/);
 assert.match(edge,/SUBSCRIBE_NOW/);
 assert.match(edge,/paypal_plan_id/);
 assert.match(edge,/empresia_confirm_subscription_state/);
 assert.match(sql,/if p_paypal_state='ACTIVE'/);
 assert.match(webhook,/empresiaRecurringSale\(payload,token\)/);
 assert.match(sql,/empresia_confirm_subscription_sale/);
 assert.match(sql,/paypal_sale_id text not null unique/);
});
test("Frontend has public catalog, authenticated checkout and purchase history",()=>{
 assert.match(catalog,/EMPRESIA/);
 assert.match(checkout,/Acceder o registrarme para comprar/);
 assert.match(checkout,/paypal==="approved"/);
 assert.match(checkout,/action:"checkout"/);
 assert.match(purchases,/Mis compras y suscripciones/);
 assert.match(login,/^.*next && .*empresia.*\(checkout\|mis-compras\)/m);
});

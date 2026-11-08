import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const get=p=>readFileSync(new URL(p,import.meta.url),"utf8");
const edge=get("../supabase/functions/paypal-billing/index.ts");
const sql=get("../supabase/migrations/20261108070500_paypal_api_reconciliation.sql");
const portal=get("../components/family-power-billing-portal.tsx");

test("PayPal API credentials are server-side runtime secrets only",()=>{
 for(const name of ["PAYPAL_CLIENT_ID","PAYPAL_CLIENT_SECRET","PAYPAL_WEBHOOK_ID","PAYPAL_ENVIRONMENT"])
   assert.match(edge,new RegExp(name));
 assert.doesNotMatch(portal,/PAYPAL_CLIENT_SECRET|PAYPAL_WEBHOOK_ID/);
 assert.match(edge,/paypalToken\(\)/);
});
test("signed event is verified and invoice status fetched from PayPal before credit",()=>{
 assert.match(edge,/verify-webhook-signature/);
 assert.match(edge,/verification_status === "SUCCESS"/);
 assert.match(edge,/INVOICING\.INVOICE\.PAID/);
 assert.match(edge,/\/v2\/invoicing\/invoices\//);
 assert.match(edge,/invoice\.status !== "PAID"/);
 assert.match(edge,/paypal_confirm_invoice_from_api/);
});
test("on-demand sync verifies JWT and RLS invoice before calling PayPal",()=>{
 assert.match(edge,/userClient\.auth\.getUser/);
 assert.match(edge,/\.from\("billing_invoices"\)/);
 assert.match(edge,/\.eq\("id", payload\.invoice_id\)/);
 assert.match(portal,/supabase\.functions\.invoke\("paypal-billing"/);
 assert.match(portal,/Comprobar pago en PayPal/);
});
test("DB reconciliation requires service role and is idempotent",()=>{
 assert.match(sql,/grant execute on function public\.paypal_confirm_invoice_from_api\(text,bigint\)\s+to service_role/);
 assert.match(sql,/from public, anon, authenticated/);
 assert.match(sql,/status='already_paid'/);
 assert.match(sql,/amount_paid_cents<>0/);
 assert.match(sql,/custom_monthly_price_cents=8000/);
});

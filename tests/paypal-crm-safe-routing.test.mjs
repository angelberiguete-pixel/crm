import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("PayPal staging must be isolated from the canonical CRM production database",()=>{
  const server=source("lib/paypal-crm-server.ts");
  assert.match(server,/requireIsolatedPaypalSandboxDatabase/);
  assert.match(server,/url\.origin===PRODUCTION_SUPABASE_URL/);
  assert.match(server,/PAYPAL_SANDBOX_SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(server,/PAYPAL_SANDBOX_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(server,/process\.env\.VERCEL_ENV==="production"/);
  assert.doesNotMatch(server,/process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
});
test("Every PayPal order and capture checks the current user's RLS-authorized invoice",()=>{
  const order=source("app/api/paypal/orders/route.ts");
  const capture=source("app/api/paypal/capture/route.ts");
  const server=source("lib/paypal-crm-server.ts");
  assert.match(server,/client\.auth\.getUser\(accessToken\)/);
  assert.match(server,/from\("billing_invoices"\)/);
  assert.match(server,/invoice\.provider!=="manual"/);
  for(const body of [order,capture]){
    assert.match(body,/paypalInvoiceFromAuthorizedUser\(request,data\.invoiceId,sandboxDb\)/);
    assert.match(body,/paypalSandboxServerConfiguration\(\)/);
    assert.doesNotMatch(body,/NEXT_PUBLIC_PAYPAL_/);
  }
  assert.match(order,/paypal_checkout_orders/);
  assert.match(capture,/pending_paypal_webhook/);
});
test("Only a verified webhook and private atomic ledger can mark invoices paid",()=>{
  const webhook=source("app/api/paypal/webhook/route.ts");
  const migration=source("supabase/migrations/20261107090000_paypal_sandbox_checkout_ledger.sql");
  assert.match(webhook,/verifyPaypalSandboxWebhook/);
  assert.match(webhook,/evaluatePaypalCapture/);
  assert.match(webhook,/apply_verified_paypal_capture/);
  assert.match(migration,/enable row level security/i);
  assert.match(migration,/revoke all on public\.paypal_checkout_orders from public, anon, authenticated/i);
  assert.match(migration,/service_role/);
  assert.match(migration,/on conflict \(provider,provider_event_id\) do nothing/i);
  assert.match(migration,/on conflict \(provider,provider_payment_id\) do nothing/i);
  assert.match(migration,/update public\.billing_invoices/i);
});

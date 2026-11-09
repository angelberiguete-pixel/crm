import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const get=p=>readFileSync(new URL(p,import.meta.url),"utf8");
const sql=get("../supabase/migrations/20261108090000_shared_billing_finance.sql");
const sales=get("../supabase/migrations/20261108101500_verified_monthly_paypal_sales.sql");
const planApi=get("../supabase/functions/paypal-subscriptions/index.ts");
const invoiceApi=get("../supabase/functions/paypal-billing/index.ts");
const dashboard=get("../components/billing-financial-dashboard.tsx");
const portal=get("../components/family-power-billing-portal.tsx");
const admin=get("../components/platform-admin.tsx");
const gate=get("../components/tenant-permission-gate.tsx");

test("financial snapshot requires platform owner or specific tenant admin",()=>{
  assert.match(sql,/private\.crm_is_platform_owner\(\)/);
  assert.match(sql,/private\.is_tenant_admin\(p_tenant_id\)/);
  assert.match(sql,/private\.crm_active_tenant_matches\(p_tenant_id\)/);
  assert.match(sql,/revoke all on function public\.crm_billing_financial_snapshot\(uuid\) from public,anon/);
  assert.match(dashboard,/crm_billing_financial_snapshot/);
});
test("financial dashboard uses real database aggregates, not mock data",()=>{
  assert.match(dashboard,/received_cents/);
  assert.match(dashboard,/pending_cents/);
  assert.match(dashboard,/overdue_cents/);
  assert.match(dashboard,/verified_subscription_failures/);
  assert.match(dashboard,/monthly_collected/);
  assert.doesNotMatch(dashboard,/Math\.random|sampleData|mockData/);
});
test("billing is shared across tenants with owner/admin protection",()=>{
  assert.doesNotMatch(gate,/familyOnlySections=\[[^\]]*"pagos"/);
  assert.match(portal,/\["owner","admin"\]/);
  assert.match(admin,/BillingFinancialDashboard/);
  assert.match(portal,/BillingFinancialDashboard/);
});
test("PayPal recurring plan is fixed to $80 and only owner can provision it",()=>{
  assert.match(sql,/family-power-arm-usd80-month/);
  assert.match(planApi,/crm_billing_financial_snapshot/);
  assert.match(planApi,/p_tenant_id:null/);
  assert.match(planApi,/family-power-arm-usd80-month/);
  assert.match(planApi,/value:"80\.00",currency_code:"USD"/);
  assert.match(planApi,/PayPal-Request-Id/);
});
test("recurring subscription requires initial paid and buyer approval",()=>{
  assert.match(planApi,/initial_fee_not_verified/);
  assert.match(planApi,/status:"awaiting_buyer"/);
  assert.match(planApi,/rel==="approve"/);
  assert.match(portal,/Autorizar US\$80 mensuales en PayPal/);
  assert.match(portal,/initial\?\.status!=="paid"/);
  assert.doesNotMatch(portal,/PAYPAL_CLIENT_SECRET/);
});
test("webhook signatures and official PayPal lookups precede recorded recurring revenue",()=>{
  assert.match(invoiceApi,/verify-webhook-signature/);
  assert.match(invoiceApi,/paypalSubscription\(subscriptionId,token\)/);
  assert.match(invoiceApi,/\/v1\/payments\/sale\//);
  assert.match(invoiceApi,/crm_record_verified_subscription_sale/);
  assert.match(sales,/provider_approval_state<>'approved'/);
  assert.match(sales,/on conflict\(provider,provider_invoice_id\) do nothing/);
  assert.match(sales,/from public,anon,authenticated/);
});
test("stored plan and events do not grant user payment-confirmation rights",()=>{
  assert.match(sql,/alter table public\.billing_provider_events enable row level security/);
  assert.match(sql,/grant select on public\.billing_provider_events to authenticated/);
  assert.match(sql,/to service_role/);
  assert.match(sales,/crm_record_verified_billing_event/);
  assert.match(sales,/crm_record_verified_subscription_sale/);
});

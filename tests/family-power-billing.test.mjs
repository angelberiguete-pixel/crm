import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const get=(p)=>readFileSync(new URL(p,import.meta.url),"utf8");
const registration=get("../app/family-power/registro/page.tsx");
const step=get("../app/family-power/pagos/page.tsx");
const portal=get("../components/family-power-billing-portal.tsx");
const banner=get("../components/family-power-billing-banner.tsx");
const gate=get("../components/tenant-permission-gate.tsx");
const router=get("../app/crm/[[...slug]]/page.tsx");
const admin=get("../components/platform-billing-reviews.tsx");
const sql=get("../supabase/migrations/20261107081500_family_power_billing_portal.sql");

test("signup points to optional payment step and never approves user automatically",()=>{
 assert.match(registration,/window.location.assign\("\/family-power\/pagos"\)/);
 assert.doesNotMatch(registration,/platform_add_member|platform_review_family_power_registration/);
 assert.match(step,/href="\/family-power\/login"/);
 assert.match(step,/Pagar más tarde/);
});
test("only existing PayPal invoice 0002 charges the fixed initial $197",()=>{
 assert.match(step,/invoice\/p\/#HSYZR25YC89AXNJ5/);
 assert.match(step,/US\$197\.00/);
 assert.doesNotMatch(step,/ncp\/payment/);
 assert.match(sql,/INV2-HSYZ-R25Y-C89A-XNJ5/);
 assert.match(sql,/on conflict \(provider,provider_invoice_id\) do nothing/);
});
test("billing resides in the authorized CRM portal and cannot grant access",()=>{
 assert.match(router,/section === "pagos"/);
 assert.match(gate,/pagos: "dashboard"/);
 assert.doesNotMatch(gate,/familyOnlySections=.*"pagos"/);
 assert.match(gate,/\["settings","pagos"\].includes\(section\)/);
 assert.match(portal,/const isFamilyPower=tenant\?\.tenant_slug==="family-power"/);
 assert.match(portal,/\["owner","admin"\]/);
 assert.match(banner,/crm_implementation_contract_summary/);
});
test("reported payments remain pending until platform owner verifies",()=>{
 assert.match(portal,/from\("billing_payment_reports"\)\.insert/);
 assert.match(portal,/No se marca pagado hasta verificar/);
 assert.match(sql,/create policy billing_payment_reports_submit/);
 assert.match(sql,/submitted_by=\(select auth.uid\(\)\)/);
 assert.match(sql,/create or replace function public.platform_confirm_billing_invoice/);
 assert.match(sql,/private.crm_is_platform_owner\(\)/);
 assert.match(admin,/platform_confirm_billing_invoice/);
 assert.match(admin,/window.confirm/);
});
test("US$80 monthly plan only after full RD$30,000 implementation settlement",()=>{
  const contractSql=get("../supabase/migrations/20261109010000_implementation_contract_dop_installments.sql");
  const paypalApi=get("../supabase/functions/paypal-subscriptions/index.ts");
  assert.match(step,/US\$493\.75/);
  assert.match(step,/Primera cuota/);
  assert.match(portal,/implementationStatus!=="settled"/);
  assert.match(contractSql,/custom_monthly_price_cents=8000/);
  assert.match(paypalApi,/implementation_contract_not_settled/);
  assert.match(step,/no está activado/);
});

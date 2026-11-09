import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(p)=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const sql=read("supabase/migrations/20261109010000_implementation_contract_dop_installments.sql");
const subscription=read("supabase/functions/paypal-subscriptions/index.ts");
const checkout=read("app/family-power/pagos/page.tsx");
const portal=read("components/family-power-billing-portal.tsx");
const banner=read("components/family-power-billing-banner.tsx");
const ledger=read("components/implementation-contract-ledger.tsx");
const admin=read("components/platform-admin.tsx");

test("implementation contract is RD$30,000, with existing PayPal invoice USD197 as installment 1",()=>{
 assert.match(sql,/3000000/);
 assert.match(sql,/family-power-implementation-2026/);
 assert.match(sql,/INV2-HSYZ-R25Y-C89A-XNJ5/);
 assert.match(sql,/implementation_installment/);
 assert.match(sql,/'installment_number',1/);
 assert.match(checkout,/US\$493\.75/);
 assert.match(checkout,/US\$197\.00/);
 assert.match(checkout,/Primera cuota/);
});
test("no USD to DOP credit is invented before collecting money and recording exchange rate",()=>{
 assert.match(sql,/p_rate_dop_per_usd is null/);
 assert.match(sql,/Invoice not fully paid and verified for this contract/);
 assert.match(sql,/v_amount:=round\(v_source\*p_rate_dop_per_usd\)::bigint/);
 assert.match(sql,/credited_dop_cents/);
 assert.match(ledger,/Tasa acordada RD\$ por US\$1/);
 assert.match(ledger,/platform_apply_implementation_credit/);
 assert.match(ledger,/credited_to_contract/);
});
test("client cannot mark payments verified or edit contract directly",()=>{
 assert.match(sql,/billing_implementation_contracts enable row level security/);
 assert.match(sql,/billing_implementation_credits enable row level security/);
 assert.match(sql,/revoke all on public\.billing_implementation_credits from public,anon,authenticated/);
 assert.match(sql,/private\.crm_is_platform_owner\(\)/);
 assert.match(sql,/private\.is_tenant_admin\(tenant_id\)/);
 assert.match(sql,/Only the platform owner can allocate verified implementation payments/);
 assert.match(ledger,/ownerControls&&contract.status==="open"/);
});
test("USD197 payment does not activate USD80 recurring billing",()=>{
 assert.match(subscription,/implementation_contract_not_settled/);
 assert.match(subscription,/contract.status!=="settled"/);
 assert.match(portal,/implementationStatus!=="settled"/);
 assert.match(sql,/if v_remaining=0 then/);
 assert.doesNotMatch(sql,/if v_invoice.metadata->>'billing_stage'='initial' then/);
 assert.match(ledger,/mensualidad de US\$80 es independiente/);
});
test("the client and central owner see DOP balance and verified installments",()=>{
 assert.match(portal,/ImplementationContractLedger tenantId=\{tenantId\}/);
 assert.match(admin,/ImplementationContractLedger tenantId=\{selectedId\} ownerControls/);
 assert.match(banner,/crm_implementation_contract_summary/);
 assert.match(banner,/new Intl.NumberFormat\("en-US"/);
 assert.match(ledger,/Historial de abonos confirmados/);
 assert.match(ledger,/transferencia o efectivo/);
});

test("Family Power pricing is USD-first but does not silently rewrite the DOP contract",()=>{
 const display=read("supabase/migrations/20261109033000_implementation_usd_display_reference.sql");
 assert.match(display,/60\.7601/);
 assert.match(display,/BCRD, tasa de venta/);
 assert.match(display,/usd_reference_total_cents/);
 assert.match(display,/usd_reference_remaining_cents/);
 assert.match(display,/private\.crm_active_tenant_matches\(p_tenant_id\)/);
 assert.match(ledger,/usdReference\(contract\.usd_reference_total_cents\)/);
 assert.match(ledger,/usdReference\(contract\.usd_reference_remaining_cents\)/);
 assert.match(banner,/usd_reference_remaining_cents/);
 assert.match(checkout,/US\$493\.75/);
 assert.match(checkout,/RD\$30,000/);
});

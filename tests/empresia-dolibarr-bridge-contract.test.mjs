import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(path)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const bridge=read("supabase/functions/empresia-dolibarr/index.ts");
const protocol=read("supabase/functions/_shared/dolibarr-protocol.ts");
const panel=read("components/empresia-erp-overview.tsx");
const migration=read("supabase/migrations/20261109112351_empresia_dolibarr_erp_provider_readonly_v1.sql");

test("server-only token, no dynamic browser-supplied origin, no API mutations",()=>{
  assert.match(bridge, /Deno\.env\.get\("DOLIBARR_API_KEY"\)/);
  assert.match(bridge, /Deno\.env\.get\("DOLIBARR_API_BASE_URL"\)/);
  assert.match(bridge, /Deno\.env\.get\("DOLIBARR_READONLY_ENABLED"\) === "true"/);
  assert.match(protocol, /DOLAPIKEY: apiKey/);
  assert.match(protocol, /method: "GET", redirect: "error"/);
  assert.doesNotMatch(bridge,/\b(postToDolibarr|sendInvoice|createProduct|syncInvoice)\b/);
  assert.doesNotMatch(bridge, /body\.(?:url|base_url|api_key|password)/i);
  assert.doesNotMatch(panel,/DOLIBARR_API_KEY|DOLAPIKEY|DOLIBARR_API_BASE_URL/);
});

test("only authenticated platform tenant owners/admins can use Dolibarr bridge",()=>{
  assert.match(bridge,/client\.auth\.getUser/);
  assert.match(bridge,/client\.rpc\("list_my_tenants"\)/);
  assert.match(bridge,/entry\.tenant_slug === "eurevector"/);
  assert.match(bridge,/entry\.is_active === true/);
  assert.match(bridge,/entry\.membership_role === "owner"/);
  assert.match(bridge,/entry\.membership_role === "admin"/);
  assert.match(bridge,/DOLIBARR_EXPECTED_TENANT_ID/);
  assert.match(bridge,/expectedTenant === tenantId/);
  assert.match(bridge,/if \(!await authorize\(req, tenantId\)\)/);
});

test("only safe status probe and limited product list, not fake active ERP",()=>{
  assert.match(bridge,/body\.action === "status"/);
  assert.match(bridge,/body\.action === "probe"/);
  assert.match(bridge,/body\.action !== "products"/);
  assert.match(bridge,/provider_not_configured/);
  assert.match(bridge,/connected_read_only/);
  assert.match(bridge,/listDolibarrProducts/);
  assert.match(protocol,/input\.limit > 25/);
  assert.match(protocol,/provider_response_too_large/);
  assert.match(protocol,/provider_invalid_products/);
  assert.match(protocol,/^export type DolibarrProduct/m);
  assert.match(panel,/Probar conexión Dolibarr/);
  assert.match(panel,/Consultar 10 productos/);
  assert.match(panel,/Sin servidor Dolibarr autorizado/);
});

test("database compatibility uses RLS-invoker view, no public viewer or invoice changes",()=>{
  assert.match(migration,/provider IN \('odoo', 'dolibarr'\)/);
  assert.match(migration,/security_invoker = true/);
  assert.match(migration,/REVOKE ALL.*FROM PUBLIC, anon/);
  assert.match(migration,/GRANT SELECT.*TO authenticated/);
  assert.match(migration,/WHERE e\.provider = 'dolibarr'/);
  assert.doesNotMatch(migration,/\b(INSERT|UPDATE|DELETE|TRUNCATE)\b\s+(?:INTO|public\.)/i);
  assert.doesNotMatch(migration,/billing_invoices|tenant_subscriptions/);
});

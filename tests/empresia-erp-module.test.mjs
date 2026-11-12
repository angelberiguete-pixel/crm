import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const panel=read("components/empresia-erp-overview.tsx");
const workspace=read("components/crm-workspace.tsx");
const gate=read("components/tenant-permission-gate.tsx");

test("ERP uses the current Empresia workspace and native inventory",()=>{
  assert.match(panel,/Empresia · Plataforma principal/);
  assert.match(panel,/href="\/crm\/inventory"/);
  assert.match(panel,/useActiveTenant/);
  assert.doesNotMatch(panel,/functions\.invoke\("empresia-dolibarr"/);
});
test("native inventory is registered behind the existing operations permission",()=>{
  assert.match(gate,/inventory: "operations"/);
  assert.match(workspace,/inventory:"operations"/);
  assert.match(workspace,/section === "inventory" && <ErpNativeInventory/);
});
test("inventory client delegates writes to checked database transactions",()=>{
  const inventory=read("components/erp-native-inventory.tsx");
  assert.match(inventory,/erp_inventory_move/);
  assert.match(inventory,/erp_inventory_item_save/);
  assert.match(inventory,/p_tenant_id/);
  assert.match(inventory,/p_idempotency_key/);
  assert.doesNotMatch(inventory,/from\("inventory_(?:items|movements)"\)\.(?:insert|update|delete|upsert)\(/);
  assert.doesNotMatch(inventory,/service_role|SERVICE_ROLE_KEY/);
});
test("ERP overview does not claim fiscal certification or expose secrets",()=>{
  assert.match(panel,/DGII/);
  assert.match(panel,/autorización fiscal/);
  assert.doesNotMatch(panel,/SUPABASE_SERVICE_ROLE_KEY|PAYPAL_CLIENT_SECRET|DB_PASSWORD/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const panel = read("components/empresia-erp-overview.tsx");
const workspace = read("components/crm-workspace.tsx");
const gate = read("components/tenant-permission-gate.tsx");

test("ERP is one module of Empresia, not a second public brand or external CRM", () => {
  assert.match(panel, /Empresia · Plataforma principal/);
  assert.match(panel, /motor Dolibarr/i);
  assert.match(panel, /Integración operativa/);
  assert.match(panel, /Sin verificar/);
  assert.match(workspace, /\["erp", "ERP", Boxes\]/);
  assert.match(workspace, /section === "erp" && <EmpresiaErpOverview/);
  assert.doesNotMatch(panel, /status: "connected"/);
});

test("access to ERP denies non-platform tenants, including Family Power", () => {
  assert.match(gate, /erp: "settings"/);
  assert.match(gate, /section === "erp" && \(activeTenant\.tenant_slug !== "eurevector"/);
  assert.match(gate, /\["owner", "admin"\]\.includes\(activeTenant\.membership_role\)/);
  assert.match(gate, /&& !restrictedErp/);
  assert.match(workspace, /if\(key==="erp"&&\(member\.tenant_slug!=="eurevector"/);
  assert.match(panel, /tenant\?\.tenant_slug === "eurevector"/);
  assert.match(panel, /\["owner", "admin"\]\.includes\(tenant\.membership_role\)/);
});

test("ERP state is tenant-scoped and missing data means unconnected", () => {
  assert.match(panel, /from\("tenant_erp_status"\)/);
  assert.match(panel, /\.eq\("tenant_id", tenantId\)\.maybeSingle\(\)/);
  assert.match(panel, /!configuredConnection \? "Sin conexión"/);
  assert.match(panel, /última comprobación|Última comprobación/);
  assert.match(panel, /No se pudo comprobar la configuración ERP/);
  assert.match(panel, /return \(\) => \{ live = false; \}/);
});

test("Odoo legacy data is never rebranded as verified Dolibarr data", () => {
  assert.match(panel, /existingProvider === "odoo"/);
  assert.match(panel, /existingProvider === "dolibarr"/);
  assert.match(panel, /Odoo, no Dolibarr/);
  assert.match(workspace, /if\(isEmpresia\)return notice\("Dolibarr aún no está conectado/);
  assert.match(workspace, /!isEmpresia&&<button className="button" type="button" onClick=\{syncFromOdoo\}/);
  assert.match(workspace, /!family&&!isEmpresia&&<button className="button primary" onClick=\{\(\)=>syncQuotationToOdoo/);
  assert.match(workspace, /isEmpresia\?<section className="card"/);
  assert.match(workspace, /!isFamilyPower&&\["arm","tasks","reports","web-analytics"\]\.includes\(key\)/);
});

test("ERP overview is observational; no new tables, secrets, writes or fictional balances", () => {
  assert.doesNotMatch(panel, /\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/);
  assert.doesNotMatch(panel, /SUPABASE_SERVICE_ROLE_KEY|PAYPAL_CLIENT_SECRET|DB_PASSWORD|admin_password/i);
  assert.doesNotMatch(panel, /\b(100|500|1000)\s*productos sincronizados/);
  assert.match(panel, /No se automatizarán cobros ni se publicarán facturas/);
});

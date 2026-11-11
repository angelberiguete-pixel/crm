import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const bridge = readFileSync(new URL("../supabase/functions/empresia-dolibarr/index.ts", import.meta.url), "utf8");
test("ERP bridge permits the official Empresia portal origin", () => {
  assert.match(bridge, /https:\/\/portal-empresia\.vercel\.app/);
});
test("ERP bridge does not grant CORS to unknown origins", () => {
  assert.match(bridge, /permittedOrigins\.includes\(origin\) \? \{ "Access-Control-Allow-Origin": origin \} : \{\}/);
  assert.doesNotMatch(bridge, /permittedOrigins\[0\]/);
});
test("ERP bridge is read-only and tenant restricted", () => {
  assert.match(bridge, /DOLIBARR_READONLY_ENABLED/);
  assert.match(bridge, /DOLIBARR_EXPECTED_TENANT_ID/);
  assert.match(bridge, /membership_role === "owner"/);
  assert.doesNotMatch(bridge, /action === "invoice_create"/);
});

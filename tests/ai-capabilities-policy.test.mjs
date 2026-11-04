import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import vm from "node:vm";
const source = readFileSync(new URL("../src/lib/ai-capabilities/policy.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const module = { exports: {} };
vm.runInNewContext(js, { module, exports: module.exports });
const { evaluateCapability } = module.exports;
const policy = { tenantId: "family-power", enabled: ["security-audit"], version: "0.1.0", approvedBy: "owner", approvedAt: "2026-11-04" };
test("allows approved capability only within authenticated tenant", () => {
  assert.equal(evaluateCapability({ authenticatedTenantId: "family-power", requestedTenantId: "family-power", capability: "security-audit", policy }).allowed, true);
});
test("blocks another tenant even with an approved policy", () => {
  assert.equal(evaluateCapability({ authenticatedTenantId: "other-company", requestedTenantId: "family-power", capability: "security-audit", policy }).reason, "tenant_mismatch");
});
test("defaults to deny when policy missing", () => {
  assert.equal(evaluateCapability({ authenticatedTenantId: "family-power", requestedTenantId: "family-power", capability: "security-audit", policy: null }).allowed, false);
});
test("blocks disabled capability", () => {
  assert.equal(evaluateCapability({ authenticatedTenantId: "family-power", requestedTenantId: "family-power", capability: "agent-browser", policy }).reason, "capability_disabled");
});
test("blocks unapproved policies", () => {
  assert.equal(evaluateCapability({ authenticatedTenantId: "family-power", requestedTenantId: "family-power", capability: "security-audit", policy: { ...policy, approvedBy: "" } }).allowed, false);
});

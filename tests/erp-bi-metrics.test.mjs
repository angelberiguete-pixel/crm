import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import vm from "node:vm";

const source = readFileSync(new URL("../lib/erp-bi/metrics.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
vm.runInNewContext(compiled, { module, exports: module.exports, Error });
const { calculateBusinessSnapshot } = module.exports;
const base = { tenantId: "tenant-a", currency: "DOP", period: { from: "2026-11-01", to: "2026-11-30" }, paidSalesMinor: 100000, refundsMinor: 10000, costOfGoodsMinor: 45000, quotesIssued: 20, quotesAccepted: 5, receivablesMinor: 12000 };

test("computes net revenue, margin and conversion", () => {
  const result = calculateBusinessSnapshot(base);
  assert.equal(result.netRevenueMinor, 90000);
  assert.equal(result.grossProfitMinor, 45000);
  assert.equal(result.grossMarginPercent, 50);
  assert.equal(result.quoteConversionPercent, 25);
  assert.equal(result.tenantId, "tenant-a");
});
test("returns null rates with zero denominators", () => {
  const result = calculateBusinessSnapshot({ ...base, paidSalesMinor: 0, refundsMinor: 0, costOfGoodsMinor: 0, quotesIssued: 0, quotesAccepted: 0 });
  assert.equal(result.grossMarginPercent, null);
  assert.equal(result.quoteConversionPercent, null);
});
test("rejects inconsistent and invalid inputs", () => {
  for (const input of [
    { ...base, tenantId: "" },
    { ...base, refundsMinor: 100001 },
    { ...base, quotesAccepted: 21 },
    { ...base, paidSalesMinor: Number.NaN },
    { ...base, period: { from: "2026-12-01", to: "2026-11-01" } },
  ]) assert.throws(() => calculateBusinessSnapshot(input));
});

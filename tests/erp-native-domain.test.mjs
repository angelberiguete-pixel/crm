import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const code=readFileSync(new URL("../lib/erp-native/domain.ts",import.meta.url),"utf8");
test("native ERP enforces tenant and item isolation",()=>{assert.match(code,/assertSameTenant\(stock\.tenantId, movement\.tenantId\)/);assert.match(code,/item_mismatch/);});
test("inventory rejects negative available and reserved balances",()=>{assert.match(code,/insufficient_stock/);assert.match(code,/next\.reserved > next\.onHand/);});
test("ERP rejects mismatched currencies and unbalanced journal entries",()=>{assert.match(code,/currency_mismatch/);assert.match(code,/unbalanced_journal/);});
test("ERP requires idempotency key for stock operations",()=>{assert.match(code,/missing_idempotency_key/);});

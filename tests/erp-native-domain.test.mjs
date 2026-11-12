import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const code=readFileSync(new URL("../lib/erp-native/domain.ts",import.meta.url),"utf8");
const js=ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {applyStockMovement,needsReorder,outstanding,addMoney,validateJournal}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const stock={tenantId:'alpha',itemId:'item',onHand:10,reserved:2,reorderLevel:3};
const move=(kind,quantity,extra={})=>({tenantId:'alpha',itemId:'item',idempotencyKey:'request-1',kind,quantity,...extra});
test('stock operations execute and preserve input',()=>{
  assert.equal(applyStockMovement(stock,move('receipt',3)).onHand,13);
  assert.equal(applyStockMovement(stock,move('issue',8)).onHand,2);
  assert.equal(applyStockMovement(stock,move('reserve',4)).reserved,6);
  assert.equal(applyStockMovement(stock,move('release',2)).reserved,0);
  assert.equal(stock.onHand,10);assert.equal(stock.reserved,2);
});
test('tenant and item isolation fail closed',()=>{
  assert.throws(()=>applyStockMovement(stock,move('receipt',1,{tenantId:'beta'})),/tenant_mismatch/);
  assert.throws(()=>applyStockMovement(stock,move('receipt',1,{itemId:'other'})),/item_mismatch/);
});
test('stock cannot be spent or released beyond availability',()=>{
  for(const [kind,qty] of [['issue',9],['reserve',9],['release',3]])assert.throws(()=>applyStockMovement(stock,move(kind,qty)),/insufficient_stock/);
});
test('malformed quantities, kinds, overflow and empty keys are rejected',()=>{
  for(const qty of [0,-1,NaN,Infinity,0.5,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>applyStockMovement(stock,move('receipt',qty)));
  assert.throws(()=>applyStockMovement(stock,move('unknown',1)),/invalid_movement_kind/);
  assert.throws(()=>applyStockMovement(stock,move('receipt',1,{idempotencyKey:' '})),/missing_idempotency_key/);
  assert.throws(()=>applyStockMovement(stock,move('receipt',Number.MAX_SAFE_INTEGER)),/insufficient_stock/);
});
test('minimum stock compares available stock',()=>{
  assert.equal(needsReorder(stock),false);assert.equal(needsReorder({...stock,reserved:7}),true);
});
test('balances use integer minor units, enforce currency, prevent overpayment',()=>{
  const total={currency:'DOP',minor:1050};
  assert.deepEqual(outstanding(total,{currency:'DOP',minor:400}),{currency:'DOP',minor:650});
  assert.deepEqual(addMoney(total,total),{currency:'DOP',minor:2100});
  assert.throws(()=>outstanding(total,{currency:'DOP',minor:1100}),/invalid_due/);
  assert.throws(()=>outstanding(total,{currency:'USD',minor:400}),/currency_mismatch/);
});
test('double entry rejects unbalanced and malformed journals',()=>{
  const debit={accountId:'cash',side:'debit',minor:10000},credit={accountId:'sales',side:'credit',minor:10000};
  assert.deepEqual(validateJournal([debit,credit]),{debits:10000,credits:10000,balanced:true});
  for(const lines of [[debit],[debit,{...credit,minor:9999}],[debit,{...credit,minor:0}],[debit,{...credit,accountId:''}],[debit,{...credit,side:'unknown'}]])assert.throws(()=>validateJournal(lines));
});

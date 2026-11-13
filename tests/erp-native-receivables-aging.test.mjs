import test from 'node:test';
import assert from 'node:assert/strict';
import {buildReceivablesAging,formatReceivableMoney} from '../lib/erp-native/receivables-aging.ts';
const row=(id,due_date,outstanding,currency='DOP',tenant_id='tenant-a')=>({
  id,tenant_id,currency,due_date,total:outstanding,amount_paid:'0.00',outstanding,
});
test('categorizes overdue amounts against an explicit day, respecting boundaries and settled rows',()=>{
  const invoices=[row('today','2026-11-13','4.00'),row('d30','2026-10-14','10.00'),
    row('d31','2026-10-13','20.00'),row('d60','2026-09-14','30.00'),
    row('d61','2026-09-13','40.00'),row('d90','2026-08-15','50.00'),
    row('d91','2026-08-14','60.00'),{...row('paid','2026-01-01','0.00'),total:'12.00',amount_paid:'12.00'}];
  const summary=buildReceivablesAging(invoices,'tenant-a','2026-11-13');
  assert.equal(summary.examinedInvoices,8);
  const [dop]=summary.currencies;
  assert.deepEqual(dop.buckets.map(b=>b.amountMinor),['400','1000','5000','9000','6000']);
  assert.deepEqual(dop.buckets.map(b=>b.count),[1,1,2,2,1]);
  assert.equal(dop.totalMinor,'21400');assert.equal(dop.overdueMinor,'21000');
  assert.equal(dop.openInvoices,7);assert.equal(dop.overdueInvoices,6);
});
test('separates currencies and preserves exact sums beyond safe Number range',()=>{
  const result=buildReceivablesAging([
    row('d','2026-11-12','9999999999999999.99'),row('e','2026-11-12','9999999999999999.99'),
    row('u','2026-11-14','20.11','USD'),row('eur','2026-11-14','30.01','EUR'),
  ],'tenant-a','2026-11-13');
  const byCurrency=Object.fromEntries(result.currencies.map(c=>[c.currency,c]));
  assert.equal(formatReceivableMoney(byCurrency.DOP.totalMinor,'DOP'),'DOP 19,999,999,999,999,999.98');
  assert.equal(byCurrency.USD.totalMinor,'2011');assert.equal(byCurrency.EUR.totalMinor,'3001');
  assert.equal(byCurrency.USD.overdueMinor,'0');
});
test('rejects mixed tenant, duplicate invoices, forged sums and invalid dates',()=>{
  assert.throws(()=>buildReceivablesAging([row('1','2026-11-12','5.00','DOP','tenant-b')],'tenant-a','2026-11-13'),/tenant_mismatch/);
  assert.throws(()=>buildReceivablesAging([row('1','2026-11-12','5.00'),row('1','2026-11-12','5.00')],'tenant-a','2026-11-13'),/duplicate/);
  assert.throws(()=>buildReceivablesAging([{...row('1','2026-11-12','5.00'),total:'6.00'}],'tenant-a','2026-11-13'),/invoice_balance_mismatch/);
  assert.throws(()=>buildReceivablesAging([row('1','2026-02-30','5.00')],'tenant-a','2026-11-13'),/invalid_aging_date/);
  assert.throws(()=>buildReceivablesAging([],'tenant-a','2026-02-30'),/invalid_aging_date/);
  assert.throws(()=>formatReceivableMoney('10','XXX'),/invalid_aging_amount/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { decimalToMinor, minorToDecimal, validateLedgerEntry, prepareReversal, trialBalance, financialWorkpapers } from "../lib/erp-native/accounting.ts";
import { formatEncf, dgiiCertificationUrls, prepareExemptCertificationXml } from "../lib/erp-native/fiscal.ts";
import { projectErpContext, erpContextInstructions, suggestedReplenishment } from "../lib/erp-native/intelligence.ts";

const accounts = [
  {tenantId:"tenant-a",id:"cash",code:"100",name:"Cash",category:"asset"},
  {tenantId:"tenant-a",id:"sales",code:"400",name:"Sales",category:"income"},
];
const entry = {tenantId:"tenant-a",id:"entry-a",date:"2026-11-11",currency:"DOP",status:"posted",lines:[
  {accountId:"cash",side:"debit",minor:"123456789012345678"},
  {accountId:"sales",side:"credit",minor:"123456789012345678"},
]};
test("accounting uses exact decimal strings beyond JS safe integer range",()=>{
  assert.equal(decimalToMinor("1234567890123456.78"),"123456789012345678");
  assert.equal(minorToDecimal("123456789012345678"),"1234567890123456.78");
  for(const amount of ["1.001","1e4","NaN","-1.00","01.00"]) assert.throws(()=>decimalToMinor(amount));
  assert.deepEqual(validateLedgerEntry("tenant-a",entry,accounts),{debitMinor:"123456789012345678",creditMinor:"123456789012345678"});
});
test("accounting rejects cross-company, unknown accounts, duplicate entries and currency mixing",()=>{
  assert.throws(()=>validateLedgerEntry("tenant-b",entry,accounts),/tenant_mismatch/);
  assert.throws(()=>validateLedgerEntry("tenant-a",{...entry,lines:[...entry.lines,{accountId:"foreign",side:"debit",minor:"1"}]},accounts),/unknown_account/);
  assert.throws(()=>trialBalance("tenant-a","DOP",accounts,[entry,entry],"2026-11-11"),/duplicate_entry/);
  assert.throws(()=>trialBalance("tenant-a","USD",accounts,[entry],"2026-11-11"),/currency_mismatch/);
  assert.throws(()=>validateLedgerEntry("tenant-a",{...entry,date:"2026-02-30"},accounts),/invalid_entry/);
});
test("workpapers exclude drafts and future entries and compute profit without float arithmetic",()=>{
  const reports=financialWorkpapers("tenant-a","DOP",accounts,[entry,{...entry,id:"draft",status:"draft"},{...entry,id:"future",date:"2026-12-01"}],"2026-11-11");
  assert.equal(reports.debitMinor,"123456789012345678");
  assert.equal(reports.incomeStatement.profitMinor,"123456789012345678");
  assert.equal(reports.balanceSheet.balanced,true);
});
test("reversal is an immutable draft requiring human approval and leaves original intact",()=>{
  const before=JSON.stringify(entry);
  const reverse=prepareReversal("tenant-a",entry,accounts,"reversal-a","2026-11-12");
  assert.equal(reverse.entry.status,"draft");assert.equal(reverse.requiresHumanApproval,true);
  assert.equal(reverse.entry.lines[0].side,"credit");assert.equal(JSON.stringify(entry),before);
  assert.ok(Object.isFrozen(reverse.entry.lines[0]));
  assert.throws(()=>prepareReversal("tenant-a",{...entry,status:"draft"},accounts,"reverse","2026-11-11"),/posted_entry_required/);
});

const config={tenantId:"tenant-a",environment:"certification",rnc:"000000000",legalName:"Synthetic company & test",address:"Synthetic address"};
const invoice={tenantId:"tenant-a",encf:"E310000000001",issueDate:"2026-11-11",sequenceExpiresAt:"2026-12-31",buyerRnc:"000000001",buyerLegalName:"Synthetic buyer",lines:[{name:"Test <item>",quantity:3,unitPriceMinor:"999",kind:"good"}]};
test("DGII helpers only prepare certification drafts; production is rejected",()=>{
  assert.equal(formatEncf("31","1"),invoice.encf);
  assert.throws(()=>formatEncf("31","0"),/invalid_encf/);
  assert.throws(()=>dgiiCertificationUrls("production"),/disabled/);
  const draft=prepareExemptCertificationXml(config,invoice);
  assert.equal(draft.totalMinor,"2997");
  assert.equal(draft.submittable,false);assert.equal(draft.schemaValidated,false);assert.equal(draft.signed,false);
  assert.match(draft.xml,/<MontoTotal>29\.97<\/MontoTotal>/);
  assert.match(draft.xml,/Test &lt;item&gt;/);assert.match(draft.xml,/company &amp; test/);
  assert.doesNotMatch(draft.xml,/<Signature/);
});
test("DGII draft rejects tenant crossover, invalid dates, expired sequence and XML controls",()=>{
  assert.throws(()=>prepareExemptCertificationXml(config,{...invoice,tenantId:"tenant-b"}),/tenant_mismatch/);
  assert.throws(()=>prepareExemptCertificationXml(config,{...invoice,issueDate:"2026-02-30"}),/invalid_fiscal_date/);
  assert.throws(()=>prepareExemptCertificationXml(config,{...invoice,sequenceExpiresAt:"2026-01-01"}),/expired/);
  assert.throws(()=>prepareExemptCertificationXml({...config,legalName:"bad\u0000name"},invoice),/invalid_fiscal_text/);
});
test("read-only AI context excludes unrelated/secret fields and discloses sampling limit",()=>{
  const source=Array.from({length:14},(_,i)=>({id:String(i),sku:"TEST",name:"x".repeat(150),on_hand:10,reserved:1,secret:"never",email:"private@example.test"}));
  const rows=projectErpContext("inventory",source);
  assert.equal(rows.length,12);assert.equal(rows[0].name.length,120);
  assert.doesNotMatch(JSON.stringify(rows),/secret|email|private/);
  assert.match(erpContextInstructions({inventory:source}),/12 registros/);
  assert.throws(()=>projectErpContext("execute_payment",source),/unsupported/);
});
test("purchase suggestion uses exact quantities and requires human approval",()=>{
  assert.deepEqual(suggestedReplenishment("1.000001","0.000001","2"),{available:"1.000000",suggestedQuantity:"1.000000",atOrBelowMinimum:true,requiresHumanApproval:true});
  assert.throws(()=>suggestedReplenishment("1","2","3"),/invalid_stock_balance/);
});

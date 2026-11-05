import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import vm from "node:vm";
const source = readFileSync(new URL("../src/lib/fiscal/ecf-domain.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const exports = {};
vm.runInNewContext(js, {exports, Error, Number, Math});
const {calculateFiscalPreview, validateFiscalDraft} = exports;
test("calcula totales de demostración", () => {
 const result=calculateFiscalPreview([{description:"A",quantity:2,unitPrice:100,itbisRate:0.18}]);
 assert.equal(result.subtotal,200);assert.equal(result.itbis,36);assert.equal(result.total,236);
});
test("rechaza descuento superior al total", () => {
 assert.throws(()=>calculateFiscalPreview([{description:"A",quantity:1,unitPrice:100,discount:101}]));
});
test("rechaza líneas vacías", () => assert.throws(()=>calculateFiscalPreview([])));
test("requiere comprador para E31",()=>{
 const errors=validateFiscalDraft({tenantId:"tenant",type:"E31",issuer:{legalName:"Emisor",rnc:"101000001"},currency:"DOP",lines:[{description:"A",quantity:1,unitPrice:100}]});
 assert.ok(errors.some(x=>x.includes("comprador")));
});
test("requiere comprobante original en nota de crédito",()=>{
 const errors=validateFiscalDraft({tenantId:"tenant",type:"E34",issuer:{legalName:"Emisor",rnc:"101000001"},currency:"DOP",lines:[{description:"A",quantity:1,unitPrice:100}]});
 assert.ok(errors.some(x=>x.includes("original")));
});

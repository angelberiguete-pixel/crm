import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildFamilyQuotePdf} from "../lib/family-power-quote-pdf.ts";

const source=readFileSync(new URL("../components/family-power-quotations.tsx",import.meta.url),"utf8");
const workspace=readFileSync(new URL("../components/crm-workspace.tsx",import.meta.url),"utf8");
const quote={
 number:"FP-TEST-001",client:"Maria Perez",phone:"+18090000000",createdAt:"2026-11-02T15:00:00.000Z",
 notes:"Precio indicado por vendedor",status:"draft",total:2350,
 lines:[{description:"Inversor para cotizacion",quantity:2,unit_price:1000},{description:"Cable",quantity:1,unit_price:350}]
};
test("A4 PDF is a binary document with correct xref, total, customer and line items",()=>{
 const bytes=buildFamilyQuotePdf(quote),pdf=new TextDecoder().decode(bytes);
 assert.match(pdf,/^%PDF-1\.4/);
 assert.match(pdf,/\/MediaBox \[0 0 595 842\]/);
 assert.match(pdf,/Maria Perez/);
 assert.match(pdf,/2,350\.00/);
 assert.match(pdf,/Inversor para cotizacion/);
 assert.match(pdf,/xref\n0 \d+/);
 assert.match(pdf,/startxref\n\d+\n%%EOF/);
 const start=Number(pdf.match(/startxref\n(\d+)/)?.[1]);
 assert.equal(pdf.slice(start,start+4),"xref");
});
test("Long quote paginates and errors on inconsistent totals",()=>{
 const many={...quote,lines:Array.from({length:75},(_,i)=>({description:"Articulo numero "+i,quantity:1,unit_price:1})),total:75};
 const pdf=new TextDecoder().decode(buildFamilyQuotePdf(many));
 assert.match(pdf,/\/Count [2-9]/);
 assert.throws(()=>buildFamilyQuotePdf({...quote,total:3}),/Total inconsistente/);
});
test("Family Power uses dedicated quote interface only inside its tenant",()=>{
 assert.match(workspace,/isFamilyPower \? <FamilyPowerQuotations tenantId=\{tenantId\}\/> : <Quotations/);
 assert.match(source,/customer_name_snapshot/);
 assert.match(source,/\\.eq\("tenant_id",tenantId\)/);
 assert.match(source,/\\bsource:"manual"/);
 assert.match(source,/type="number" min="1"/);
 assert.match(source,/aria-label="Cerrar PDF"/);
 assert.match(source,/className=\{styles\.pdf\}/);
 assert.match(source,/navigator\.canShare/);
 assert.match(source,/\\.status==="active"/);
});

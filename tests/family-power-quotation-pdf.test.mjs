import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildFamilyQuotePdf} from "../lib/family-power-quote-pdf.ts";
import {normalizeWhatsAppNumber} from "../lib/whatsapp-number.ts";

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
 assert.match(source,/\.eq\("tenant_id",tenantId\)/);
 assert.match(source,/source:"manual"/);
 assert.match(source,/type="number" min="1"/);
 assert.match(source,/aria-label="Cerrar PDF"/);
 assert.match(source,/className=\{styles\.pdf\}/);
 assert.match(source,/navigator\.canShare/);
 assert.match(source,/status==="active"/);
});

test("WhatsApp links normalize Dominican local phones and reject invalid destinations",()=>{
 assert.equal(normalizeWhatsAppNumber("809-555-1234"),"18095551234");
 assert.equal(normalizeWhatsAppNumber("(829) 555-4040"),"18295554040");
 assert.equal(normalizeWhatsAppNumber("849 555 2000"),"18495552000");
 assert.equal(normalizeWhatsAppNumber("+1 (809) 555-1234"),"18095551234");
 assert.equal(normalizeWhatsAppNumber("0018095551234"),"18095551234");
 assert.equal(normalizeWhatsAppNumber("+44 7700 900123"),"447700900123");
 assert.equal(normalizeWhatsAppNumber(""),null);
 assert.equal(normalizeWhatsAppNumber(null),null);
 assert.equal(normalizeWhatsAppNumber("123"),null);
 assert.equal(normalizeWhatsAppNumber("000"),null);
 assert.equal(normalizeWhatsAppNumber("1809555123456789"),null);
 assert.match(source,/normalizeWhatsAppNumber\(phoneFor\(q\)\)/);
 assert.match(source,/if\(!phone\)return setError/);
});

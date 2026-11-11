import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCommercialInvoicePdf,commercialMinor,commercialMoney,validateCommercialPayment} from '../lib/erp-native/commercial-document.ts';
const invoice={id:'invoice',tenant_id:'tenant-a',order_id:'order',invoice_number:'FC-SYNTHETIC',currency:'USD',subtotal:'100.10',discount_total:'0.00',tax_total:'0.00',total:'100.10',issued_at:'2026-11-11T00:00:00Z',due_date:'2026-12-01',customer_snapshot:{name:'Synthetic customer'},lines_snapshot:[{description:'Synthetic good',quantity:'1.000000',unit_price:'100.10',line_total:'100.10'}]};
const issuer={tenantId:'tenant-a',name:'Synthetic Company'};
test('commercial money preserves cents beyond JavaScript safe integer range',()=>{
 assert.equal(commercialMoney('9999999999999999.99','USD'),'USD 9,999,999,999,999,999.99');
 assert.equal(commercialMinor('30.03'),3003n);
 assert.equal(validateCommercialPayment('30.03','100.10'),'30.03');
 for(const amount of ['0','-1','NaN','Infinity','1e2','1.001','100.11'])assert.throws(()=>validateCommercialPayment(amount,'100.10'));
 assert.throws(()=>commercialMoney('1','XXX'),/unsupported/);
});
test('saved commercial snapshots create a structurally valid PDF without fiscal issuance',()=>{
 const bytes=buildCommercialInvoicePdf(invoice,issuer),pdf=Buffer.from(bytes).toString('ascii');
 assert.match(pdf,/^%PDF-1\.4/);assert.match(pdf,/FACTURA COMERCIAL/);assert.match(pdf,/sin NCF ni e-NCF/);
 assert.match(pdf,/USD 100\.10/);assert.doesNotMatch(pdf,/FAMILY POWER/);
 const start=Number(pdf.match(/startxref\n(\d+)/)[1]);assert.equal(pdf.slice(start,start+4),'xref');
 const rows=pdf.slice(start).split('\n'),count=Number(rows[1].split(' ')[1]);
 for(let index=1;index<count;index++){const offset=Number(rows[index+2].slice(0,10));assert.ok(pdf.slice(offset).startsWith(`${index} 0 obj\n`));}
});
test('PDF rejects cross-company documents and inconsistent line/header totals',()=>{
 assert.throws(()=>buildCommercialInvoicePdf(invoice,{...issuer,tenantId:'other'}),/tenant_mismatch/);
 assert.throws(()=>buildCommercialInvoicePdf({...invoice,total:'100.11'},issuer),/invoice_total_mismatch/);
 assert.throws(()=>buildCommercialInvoicePdf({...invoice,lines_snapshot:[{...invoice.lines_snapshot[0],line_total:'100.11'}]},issuer),/invoice_line_total_mismatch/);
});
test('long invoices paginate and escape untrusted PDF text',()=>{
 const rows=Array.from({length:45},(_,i)=>({description:`Article ${i} (untrusted) \\ text`,quantity:'1',unit_price:'2.00',line_total:'2.00'}));
 const pdf=Buffer.from(buildCommercialInvoicePdf({...invoice,subtotal:'90.00',total:'90.00',lines_snapshot:rows},issuer)).toString('ascii');
 assert.ok(Number(pdf.match(/\/Type \/Pages \/Count (\d+)/)[1])>1);
 assert.ok(pdf.includes('\\(untrusted\\) \\\\ text'));
});

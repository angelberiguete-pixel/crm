/** Native commercial documents, independently implemented without Odoo/Dolibarr code. */
export type InvoiceSnapshot = {
  id:string; tenant_id:string; order_id:string; invoice_number:string; currency:string;
  total:string; subtotal:string; discount_total:string; tax_total:string;
  issued_at:string; due_date:string;
  customer_snapshot:{name?:string;phone?:string|null};
  lines_snapshot:readonly {description:string;quantity:string;unit_price:string;line_total:string}[];
};
export type CommercialInvoice = InvoiceSnapshot & {amount_paid:string;outstanding:string;overdue:boolean};
export function commercialMinor(value:string):bigint {
  if(typeof value!=='string'||!/^(0|[1-9][0-9]{0,15})(\.[0-9]{1,2})?$/.test(value))throw Error('invalid_commercial_amount');
  const [whole,fraction='']=value.split('.');return BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
}
export function commercialMoney(value:string|number,currency:string):string {
  if(!['DOP','USD','EUR'].includes(currency))throw Error('unsupported_commercial_currency');
  const amount=commercialMinor(String(value));
  return `${currency} ${(amount/100n).toLocaleString('en-US')}.${(amount%100n).toString().padStart(2,'0')}`;
}
export function validateCommercialPayment(amount:string,outstanding:string):string {
  const minor=commercialMinor(amount.trim());
  if(minor===0n||minor>commercialMinor(outstanding))throw Error('payment_exceeds_outstanding');
  return `${minor/100n}.${(minor%100n).toString().padStart(2,'0')}`;
}
const ascii=(value:unknown)=>String(value??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7e]/g,' ').replace(/\s+/g,' ').trim();
const escapePdf=(value:unknown)=>ascii(value).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
function wrap(value:string,width:number):string[]{
  const lines:string[]=[];let current='';
  for(const word of ascii(value).split(' ')){
    if(current&&current.length+word.length+1>width){lines.push(current);current='';}
    let rest=word;while(rest.length>width){if(current){lines.push(current);current='';}lines.push(rest.slice(0,width));rest=rest.slice(width);}
    if(rest)current+=(current?' ':'')+rest;
  }
  if(current)lines.push(current);return lines.length?lines:[''];
}
/** A real, offline A4 PDF from a persisted invoice snapshot. Does not issue any fiscal document. */
export function buildCommercialInvoicePdf(invoice:InvoiceSnapshot,issuer:{tenantId:string;name:string}):Uint8Array {
  if(!issuer.tenantId||invoice.tenant_id!==issuer.tenantId)throw Error('tenant_mismatch');
  if(!issuer.name.trim()||!invoice.invoice_number.trim()||!invoice.id||!invoice.customer_snapshot?.name?.trim())throw Error('incomplete_invoice');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(invoice.due_date)||!Number.isFinite(Date.parse(invoice.issued_at)))throw Error('invalid_invoice_date');
  const total=commercialMinor(invoice.total);
  if(total===0n||commercialMinor(invoice.subtotal)-commercialMinor(invoice.discount_total)+commercialMinor(invoice.tax_total)!==total)throw Error('invoice_total_mismatch');
  if(!Array.isArray(invoice.lines_snapshot)||invoice.lines_snapshot.length<1||invoice.lines_snapshot.length>150)throw Error('invalid_invoice_lines');
  let sum=0n;
  for(const row of invoice.lines_snapshot){
    if(!row.description.trim()||row.description.length>2000||!/^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$/.test(row.quantity)
      ||!/[1-9]/.test(row.quantity)||!/^(0|[1-9][0-9]{0,15})(\.[0-9]{1,6})?$/.test(row.unit_price))throw Error('invalid_invoice_line');
    sum+=commercialMinor(row.line_total);
  }
  if(sum!==total)throw Error('invoice_line_total_mismatch');
  commercialMoney(invoice.total,invoice.currency);
  type Page={ops:string[];y:number};const pages:Page[]=[];let page:Page;
  const text=(value:unknown,x:number,y:number,size=9,bold=false)=>page.ops.push(`BT /${bold?'F2':'F1'} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${escapePdf(value)}) Tj ET`);
  const rule=(y:number)=>page.ops.push(`0.8 0.83 0.87 RG .5 w 38 ${y} m 557 ${y} l S`);
  function newPage(){
    page={ops:[],y:635};pages.push(page);text(issuer.name,38,785,18,true);text('FACTURA COMERCIAL',38,761,12,true);
    text(invoice.invoice_number,38,743,9);text(`Moneda: ${invoice.currency}`,420,761);
    text('Documento comercial sin NCF ni e-NCF',38,725,8);rule(713);
    wrap(`Cliente: ${invoice.customer_snapshot.name}`,82).slice(0,2).forEach((line,index)=>text(line,38,696-index*12));
    text(`Fecha: ${invoice.issued_at.slice(0,10)}   Vence: ${invoice.due_date}`,38,663);
    text('ARTICULO',38,646,8,true);text('CANTIDAD',326,646,8,true);text('PRECIO',397,646,8,true);text('IMPORTE',486,646,8,true);rule(640);
  }
  newPage();
  for(const row of invoice.lines_snapshot){
    const rows=wrap(row.description,45);
    for(let index=0;index<rows.length;index++){
      if(page!.y<104)newPage();
      text(rows[index],38,page!.y-12,9);
      if(index===0){text(row.quantity,326,page!.y-12,8);text(row.unit_price,397,page!.y-12,8);text(commercialMoney(row.line_total,invoice.currency),477,page!.y-12,8);}
      page!.y-=13;
    }
    page!.y-=11;rule(page!.y+4);
  }
  if(page!.y<180)newPage();
  for(const [label,value] of [['Subtotal',invoice.subtotal],['Descuento',invoice.discount_total],['Impuestos',invoice.tax_total],['TOTAL',invoice.total]]){
    page!.y-=19;text(label,340,page!.y,10,label==='TOTAL');text(commercialMoney(value,invoice.currency),433,page!.y,10,label==='TOTAL');
  }
  pages.forEach((current,index)=>{page=current;rule(68);text('Empresia · Factura comercial registrada. Sin emision fiscal.',38,51,8);text(`${index+1} / ${pages.length}`,510,51,8);});
  const objects:string[]=['','<< /Type /Catalog /Pages 2 0 R >>','','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'];
  objects[2]=`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_,i)=>`${5+i*2} 0 R`).join(' ')}] >>`;
  pages.forEach((current,index)=>{
    const id=5+index*2,body=current.ops.join('\n')+'\n';
    objects[id]=`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${id+1} 0 R >>`;
    objects[id+1]=`<< /Length ${body.length} >>\nstream\n${body}endstream`;
  });
  let output='%PDF-1.4\n';const offsets=[0];
  for(let index=1;index<objects.length;index++){offsets[index]=output.length;output+=`${index} 0 obj\n${objects[index]}\nendobj\n`;}
  const xref=output.length;output+=`xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for(let index=1;index<objects.length;index++)output+=`${String(offsets[index]).padStart(10,'0')} 00000 n \n`;
  output+=`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(output);
}

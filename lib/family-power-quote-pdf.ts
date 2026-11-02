/* Generate a native A4 PDF offline. Data must come from a saved, authorized quotation. */
export type QuotePdfLine={description:string;quantity:number;unit_price:number};
export type QuotePdfData={
 number:string;client:string;phone?:string|null;createdAt:string;validUntil?:string|null;
 notes?:string|null;lines:QuotePdfLine[];total:number;status:string;
};
const ascii=(v:unknown)=>String(v??"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^\x20-\x7E]/g," ").replace(/\s+/g," ").trim();
const esc=(v:unknown)=>ascii(v).replace(/\\/g,"\\\\").replace(/\(/g,"\\(").replace(/\)/g,"\\)");
const fmt=(v:number)=>"RD$ "+new Intl.NumberFormat("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}).format(v);
const date=(v:string)=>{const d=new Date(v);return Number.isNaN(d.getTime())?ascii(v):new Intl.DateTimeFormat("es-DO",{year:"numeric",month:"2-digit",day:"2-digit",timeZone:"America/Santo_Domingo"}).format(d);};
const wrap=(v:string,max:number)=>{let lines:string[]=[],line="";for(const part of ascii(v).split(" ")){if(line&&line.length+part.length+1>max){lines.push(line);line="";}line+=(line?" ":"")+part.slice(0,max);}if(line)lines.push(line);return lines.length?lines:[""];};
type Page={ops:string[];y:number};
export function buildFamilyQuotePdf(q:QuotePdfData):Uint8Array{
 if(!q.number.trim()||!q.client.trim()||!q.lines?.length||q.lines.length>150)throw Error("Cotizacion incompleta");
 if(q.lines.some(l=>!l.description.trim()||!Number.isFinite(l.quantity)||l.quantity<=0||!Number.isFinite(l.unit_price)||l.unit_price<0))throw Error("Articulo invalido");
 const sum=Math.round(q.lines.reduce((n,l)=>n+l.quantity*l.unit_price,0)*100)/100;
 if(!Number.isFinite(q.total)||Math.abs(sum-q.total)>0.02)throw Error("Total inconsistente");
 const pages:Page[]=[];let page!:Page;
 function tx(value:unknown,x:number,y:number,size=10,bold=false,color="0.08 0.1 0.14"){
   page.ops.push(color+" rg BT /"+(bold?"F2":"F1")+" "+size+" Tf 1 0 0 1 "+x+" "+y+" Tm ("+esc(value)+") Tj ET");
 }
 function line(y:number){page.ops.push("0.85 0.86 0.88 RG .7 w 38 "+y+" m 557 "+y+" l S");}
 function makePage(){
   page={ops:[],y:660};pages.push(page);
   page.ops.push("0.77 0.04 0.09 rg 0 805 595 37 re f");
   tx("FAMILY POWER",38,771,25,true);tx("ENERGIA ALTERNATIVA SIN LIMITES",38,752,9);
   tx("COTIZACION",430,771,12,true,"0.77 0.04 0.09");tx(q.number,420,752,9);
   line(732);tx("Cliente: "+q.client,38,714,10,true);
   if(q.phone)tx("Telefono: "+q.phone,355,714,9);
   tx("Fecha: "+date(q.createdAt),38,695,9);
   if(q.validUntil)tx("Valida hasta: "+date(q.validUntil),355,695,9);
   tx("ARTICULO",40,675,9,true);tx("CANT.",358,675,9,true);tx("PRECIO",418,675,9,true);tx("IMPORTE",503,675,9,true);
   line(668);page.y=647;
 }
 makePage();
 for(const item of q.lines){
   const rows=wrap(item.description,48).slice(0,4),height=Math.max(28,rows.length*13+10);
   if(page.y-height<118)makePage();
   rows.forEach((s,i)=>tx(s,40,page.y-i*13,9));
   tx(String(item.quantity),366,page.y,9);tx(fmt(item.unit_price),416,page.y,8);tx(fmt(item.quantity*item.unit_price),496,page.y,8,true);
   page.y-=height;line(page.y+6);page.y-=7;
 }
 const notes=wrap(q.notes??"",98).slice(0,5);
 if(page.y<165+notes.length*13)makePage();
 page.y-=10;tx("TOTAL: "+fmt(q.total),355,page.y,15,true,"0.77 0.04 0.09");page.y-=25;
 tx(q.status==="draft"?"BORRADOR - Sujeto a revision":"Cotizacion registrada",40,page.y,9,true);
 if(notes.length&&notes[0]){page.y-=20;tx("Observaciones:",40,page.y,9,true);for(const s of notes){page.y-=13;tx(s,40,page.y,9);}}
 for(let i=0;i<pages.length;i++){page=pages[i];line(59);tx("Family Power - Documento emitido por el CRM",40,43,8);tx("Pagina "+(i+1)+" de "+pages.length,489,43,8);}
 const objects:string[]=["","<< /Type /Catalog /Pages 2 0 R >>","","<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>","<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"];
 objects[2]="<< /Type /Pages /Count "+pages.length+" /Kids ["+pages.map((_,i)=>(5+i*2)+" 0 R").join(" ")+"] >>";
 for(let i=0;i<pages.length;i++){
   const id=5+i*2,body=pages[i].ops.join("\n")+"\n";
   objects[id]="<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents "+(id+1)+" 0 R >>";
   objects[id+1]="<< /Length "+body.length+" >>\nstream\n"+body+"endstream";
 }
 let out="%PDF-1.4\n",offsets=[0];
 for(let i=1;i<objects.length;i++){offsets[i]=out.length;out+=i+" 0 obj\n"+objects[i]+"\nendobj\n";}
 const ref=out.length;out+="xref\n0 "+objects.length+"\n0000000000 65535 f \n";
 for(let i=1;i<objects.length;i++)out+=String(offsets[i]).padStart(10,"0")+" 00000 n \n";
 out+="trailer\n<< /Size "+objects.length+" /Root 1 0 R >>\nstartxref\n"+ref+"\n%%EOF\n";
 return new TextEncoder().encode(out);
}

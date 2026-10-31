"use client";

import Image from "next/image";
import {useEffect,useState} from "react";
import Link from "next/link";
import {FileDown,Printer} from "lucide-react";
import {supabase} from "@/lib/supabase";
import {useActiveTenant} from "@/components/tenant-context";

type Quote={id:string;quote_number:string;contact_id:string|null;status:string;currency:string;created_at:string;valid_until:string|null;subtotal:number;discount_total:number;tax_total:number;total:number;notes:string|null;terms:string|null};
type Item={id:string;position:number;product_id:string|null;sku_snapshot:string|null;description:string;quantity:number;unit_price:number;discount_percent:number;tax_rate:number;line_subtotal:number|null};
type Approval={product_id:string;approved_price:number;approved_tax_rate:number;currency:string};
const currency=(v:number,c:string)=>{try{return new Intl.NumberFormat("es-DO",{style:"currency",currency:c}).format(Number(v||0));}catch{return String(v)+" "+c;}};
const date=(v:string|null)=>v?new Intl.DateTimeFormat("es-DO",{dateStyle:"long"}).format(new Date(v)):"Sin fecha establecida";

export default function FamilyPowerQuoteDocument(){
 const tenant=useActiveTenant();
 const allowed=tenant?.tenant_slug==="family-power";
 const tenantId=tenant?.tenant_id??null;
 const [quote,setQuote]=useState<Quote|null>(null);
 const [items,setItems]=useState<Item[]>([]);
 const [approvals,setApprovals]=useState<Approval[]>([]);
 const [verified,setVerified]=useState(false);
 const [contact,setContact]=useState<string|null>(null);
 const [loading,setLoading]=useState(true),[error,setError]=useState("");
 useEffect(()=>{
  let alive=true;
  setQuote(null);setItems([]);setApprovals([]);setVerified(false);setContact(null);setError("");setLoading(true);
  if(!allowed||!tenantId){setLoading(false);return()=>{alive=false;};}
  const quoteId=new URLSearchParams(window.location.search).get("id")??"";
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(quoteId)){
    setError("No se seleccionó una cotización válida.");setLoading(false);
    return()=>{alive=false;};
  }
  void (async()=>{
   try{
    const a=await supabase.from("quotations").select("id,quote_number,contact_id,status,currency,created_at,valid_until,subtotal,discount_total,tax_total,total,notes,terms")
      .eq("tenant_id",tenantId).eq("id",quoteId).maybeSingle();
    if(!alive)return;
    if(a.error||!a.data){setError("Cotización no encontrada o acceso denegado.");return;}
    const q=a.data as Quote;
    const [b,c,a]=await Promise.all([
      supabase.from("quotation_items").select("id,position,product_id,sku_snapshot,description,quantity,unit_price,discount_percent,tax_rate,line_subtotal")
        .eq("tenant_id",tenantId).eq("quotation_id",quoteId).order("position"),
      q.contact_id
        ?supabase.from("contacts").select("display_name").eq("tenant_id",tenantId).eq("id",q.contact_id).maybeSingle()
        :Promise.resolve({data:null,error:null}),
      supabase.from("crm_family_product_approvals").select("product_id,approved_price,approved_tax_rate,currency")
        .eq("tenant_id",tenantId)
    ]);
    if(!alive)return;
    if(b.error||a.error){setError("Cotización no validada: no se pudo verificar el catálogo comercial autorizado.");return;}
    setQuote(q);setItems((b.data??[]) as Item[]);
    setApprovals((a.data??[]) as Approval[]);setVerified(true);
    setContact((c.data as {display_name?:string}|null)?.display_name??null);
   }catch{if(alive)setError("No se pudo cargar la cotización.");}
   finally{if(alive)setLoading(false);}
  })();
  return()=>{alive=false;};
 },[tenantId,allowed]);
 const valid=verified&&!!quote&&["sent","accepted"].includes(quote.status)
  &&items.length>0&&Number(quote.total)>0&&!!contact
  &&items.every(i=>i.description.trim().length>0&&Number(i.quantity)>0&&Number(i.unit_price)>0
   &&approvals.some(a=>a.product_id===i.product_id
     &&Number(a.approved_price)===Number(i.unit_price)
     &&Number(a.approved_tax_rate)===Number(i.tax_rate)&&a.currency===quote.currency));
 if(!allowed)return <main className="content"><h1>Acceso restringido</h1><p>Este documento es exclusivo de Family Power.</p></main>;
 if(loading)return <main className="content" role="status">Validando cotización…</main>;
 if(error)return <main className="content"><h1>Documento no disponible</h1><p role="alert">{error}</p></main>;
 if(!quote)return <main className="content">Sin cotización verificada.</main>;
 return <main className="content fp-quote-paper-shell">
  <div className="fp-quote-actions">
   <Link className="button" href="/crm/family-power-setup">Volver a Family Power</Link>
   <button className="button primary" type="button" disabled={!valid} onClick={()=>window.print()}><Printer size={16}/> Imprimir o guardar como PDF</button>
  </div>
  {!valid&&<div className="notice" role="alert">Documento NO autorizado para envío: debe estar enviado o aceptado, con cliente y partidas verificadas contra el catálogo aprobado.</div>}
  <article id="family-power-quote-document" className="fp-quote-paper">
   <header className="fp-quote-header">
    <Image src="/client-brands/family-power/logo-color-sin-fondo.svg" width={220} height={120} alt="Family Power — Energía alternativa sin límites"/>
    <div><h1>Cotización</h1><strong>{quote.quote_number}</strong>
     <p>Emitida: {date(quote.created_at)}</p><p>Válida hasta: {date(quote.valid_until)}</p></div>
   </header>
   {!valid&&<p className="fp-quote-draft">BORRADOR O NO VALIDADO — NO ENVIAR AL CLIENTE</p>}
   <section className="fp-quote-customer"><strong>Destinatario</strong><p>{contact||"Cliente pendiente de identificar"}</p>
    <p>Estado del documento: {quote.status}</p></section>
   <table className="fp-quote-table"><thead><tr><th>Concepto</th><th>Cant.</th><th>Precio unit.</th><th>Desc.</th><th>Subtotal</th></tr></thead>
    <tbody>{items.map(item=><tr key={item.id}><td>{item.sku_snapshot&&<small>{item.sku_snapshot} · </small>}{item.description}</td>
     <td>{item.quantity}</td><td>{currency(item.unit_price,quote.currency)}</td>
     <td>{item.discount_percent}%</td><td>{currency(Number(item.line_subtotal??Number(item.unit_price)*Number(item.quantity)),quote.currency)}</td></tr>)}</tbody>
   </table>
   <div className="fp-quote-total">
    <div><span>Subtotal</span><strong>{currency(quote.subtotal,quote.currency)}</strong></div>
    <div><span>Descuentos</span><strong>{currency(quote.discount_total,quote.currency)}</strong></div>
    <div><span>Impuestos</span><strong>{currency(quote.tax_total,quote.currency)}</strong></div>
    <div className="fp-quote-grand"><span>Total</span><strong>{currency(quote.total,quote.currency)}</strong></div>
   </div>
   {quote.terms&&<section><h2>Condiciones</h2><p>{quote.terms}</p></section>}
   {quote.notes&&<section><h2>Observaciones</h2><p>{quote.notes}</p></section>}
   <footer>Family Power · Energía alternativa sin límites. Cotización sujeta a disponibilidad y condiciones confirmadas por el negocio. Este documento no acredita pago ni entrega.</footer>
  </article>
  <p className="fp-quote-actions muted"><FileDown size={15}/> Utiliza «Guardar como PDF» en la impresión del navegador. El envío automático por WhatsApp requiere verificar el proveedor de documentos.</p>
 </main>;
}

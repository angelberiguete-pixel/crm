"use client";

import {useEffect,useState,type FormEvent} from "react";
import {supabase} from "@/lib/supabase";
type Invoice={id:string;invoice_number:string|null;status:string;amount_due_cents:number;total_cents:number;currency:string;metadata:Record<string,unknown>|null};
type Report={id:string;invoice_id:string;payment_method:string;reference_text:string|null;customer_note:string|null;created_at:string;status:string};
type Method="paypal"|"transfer"|"cash";
export default function PlatformBillingReviews({tenantId}:{tenantId:string}){
 const [invoices,setInvoices]=useState<Invoice[]>([]);
 const [reports,setReports]=useState<Report[]>([]);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [busy,setBusy]=useState(false);
 const [reload,setReload]=useState(0);
 const [reference,setReference]=useState("");
 const [method,setMethod]=useState<Method>("paypal");
 const [amount,setAmount]=useState("");
 const [activeInvoiceId,setActiveInvoiceId]=useState("");
 useEffect(()=>{
   let live=true;setInvoices([]);setReports([]);setActiveInvoiceId("");setError("");
   void (async()=>{
     const [i,r]=await Promise.all([
       supabase.from("billing_invoices").select("id,invoice_number,status,amount_due_cents,total_cents,currency,metadata")
         .eq("tenant_id",tenantId).order("created_at",{ascending:false}).limit(50),
       supabase.from("billing_payment_reports")
         .select("id,invoice_id,payment_method,reference_text,customer_note,created_at,status")
         .eq("tenant_id",tenantId).eq("status","submitted").order("created_at",{ascending:true}).limit(50)
     ]);
     if(!live)return;
     if(i.error||r.error)setError("No se pudieron consultar facturas y reportes. Verifica las migraciones de facturación.");
     else{setInvoices(i.data as Invoice[]);setReports(r.data as Report[]);}
   })().catch(()=>{if(live)setError("Error al consultar cobros.")});
   return()=>{live=false;};
 },[tenantId,reload]);
 const payable=invoices.filter(i=>i.status==="open"&&i.amount_due_cents>0);
 const selected=payable.find(i=>i.id===activeInvoiceId)??payable[0]??null;
 const usd=(c:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(c/100);
 async function reviewReport(report:Report,approve:boolean){
  if(busy)return;
  const invoice=invoices.find(i=>i.id===report.invoice_id);
  if(!invoice)return setError("No existe una factura asociada al reporte.");
  if(!window.confirm(approve?`Confirmaste fuera del CRM que recibiste ${usd(invoice.amount_due_cents)} por ${report.payment_method} y deseas abonarlo a la factura?`:"¿Rechazar este reporte sin registrar dinero?"))return;
  setBusy(true);setError("");setNotice("");
  const {error}=await supabase.rpc("platform_review_client_payment_report",{
    p_report_id:report.id,p_approve:approve,
    p_confirmed_usd_cents:approve?invoice.amount_due_cents:null,
    p_review_note:approve?"Comprobante revisado fuera de la plataforma":"Reporte no validado"
  });
  setBusy(false);
  if(error)setError("No se pudo revisar el reporte: "+error.message);
  else {setNotice(approve?"Pago verificado por administración.":"Reporte rechazado.");setReload(x=>x+1);}
 }
 async function confirmDirect(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!selected||busy)return;
  const cents=Math.round(Number(amount||selected.amount_due_cents/100)*100);
  if(!Number.isSafeInteger(cents)||cents<=0||cents>selected.amount_due_cents)return setError("Verifica el importe recibido en USD.");
  if(reference.trim().length<4)return setError("Introduce una referencia única del comprobante recibido.");
  if(!window.confirm(`¿Verificaste que ingresaron ${usd(cents)} por ${method} para la factura #${selected.invoice_number??"sin número"}? Esta acción confirma dinero real y queda auditada.`))return;
  setBusy(true);setError("");setNotice("");
  const {error}=await supabase.rpc("platform_confirm_billing_invoice",{
    p_invoice_id:selected.id,p_payment_method:method,
    p_reference:reference.trim(),p_confirmed_usd_cents:cents
  });
  setBusy(false);
  if(error)setError("No se confirmó el pago: "+error.message);
  else{setReference("");setAmount("");setNotice("Pago confirmado y conciliado en el CRM.");setReload(x=>x+1);}
 }
 return <section className="card section-gap">
  <div className="eyebrow">Control financiero · Propietario</div><h2>Conciliación de pagos de clientes</h2>
  <p className="muted">Un reporte no confirma ingreso. Verifica el movimiento en PayPal o en tu banco antes de aprobar. Los importes abonados se registran en USD.</p>
  {error&&<div className="notice" role="alert">{error}</div>}
  {notice&&<div className="notice" role="status">{notice}</div>}
  <h3>Facturas pendientes</h3>
  {payable.length?payable.map(i=><div className="priority-item" key={i.id}>
    <strong>Factura {i.invoice_number??i.id.slice(0,8)} · {usd(i.amount_due_cents)}</strong>
    <span>{i.metadata?.billing_stage==="initial"?"Implementación":"Mensualidad"} · {i.currency}</span>
  </div>):<p className="muted">Sin facturas abiertas para esta empresa.</p>}
  {reports.length>0&&<div className="section-gap">
    <h3>Reportes de clientes esperando verificación</h3>
    {reports.map(report=><div key={report.id} className="card" style={{marginBottom:12}}>
      <div><strong>{report.payment_method.toUpperCase()}</strong> · {report.reference_text??"Sin referencia"}</div>
      {report.customer_note&&<p className="muted">{report.customer_note}</p>}
      <div className="top-actions" style={{marginTop:10}}>
        <button className="button primary" disabled={busy} onClick={()=>void reviewReport(report,true)}>Confirmar recibido</button>
        <button className="button" disabled={busy} onClick={()=>void reviewReport(report,false)}>Rechazar reporte</button>
      </div>
    </div>)}
  </div>}
  {selected&&<form onSubmit={confirmDirect} className="stack gap-12 section-gap" style={{maxWidth:560}}>
    <h3>Conciliar un pago recibido sin reporte</h3>
    <p className="muted">Úsalo cuando el cliente pagó directamente y tú ya verificaste el ingreso. No sirve para cobrar ni para crear transacciones PayPal.</p>
    <label htmlFor="billing-admin-invoice">Factura</label>
    <select id="billing-admin-invoice" value={selected.id} onChange={e=>setActiveInvoiceId(e.target.value)}>
      {payable.map(i=><option key={i.id} value={i.id}>#{i.invoice_number??i.id.slice(0,8)} · {usd(i.amount_due_cents)}</option>)}
    </select>
    <label htmlFor="billing-admin-method">Medio confirmado</label>
    <select id="billing-admin-method" value={method} onChange={e=>setMethod(e.target.value as Method)}>
      <option value="paypal">PayPal</option><option value="transfer">Transferencia bancaria</option><option value="cash">Efectivo</option>
    </select>
    <label htmlFor="billing-admin-amount">Importe verificado en USD</label>
    <input id="billing-admin-amount" type="number" min="0.01" max={selected.amount_due_cents/100} step=".01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder={(selected.amount_due_cents/100).toFixed(2)} />
    <label htmlFor="billing-admin-reference">Referencia única del pago</label>
    <input id="billing-admin-reference" required minLength={4} maxLength={180} value={reference} onChange={e=>setReference(e.target.value)} placeholder="ID de transacción / referencia bancaria / recibo de caja"/>
    <button className="button primary" type="submit" disabled={busy}>{busy?"Conciliando…":"Confirmar pago recibido"}</button>
  </form>}
 </section>;
}

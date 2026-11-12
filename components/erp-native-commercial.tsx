"use client";

import {useCallback,useEffect,useRef,useState,type FormEvent} from "react";
import {supabase} from "@/lib/supabase";
import {useActiveTenant} from "@/components/tenant-context";
import {buildCommercialInvoicePdf,commercialMinor,commercialMoney,validateCommercialPayment,type CommercialInvoice} from "@/lib/erp-native/commercial-document";

type Order={id:string;order_number:string;status:string;currency:string;total:string|number;amount_paid:string|number};
function failure(message:string){
 if(/schema cache|does not exist|could not find/i.test(message))return "La facturación comercial requiere habilitar las migraciones nativas verificadas.";
 if(/legacy_payments/.test(message))return "Este pedido tiene pagos históricos. Requiere conciliación antes de emitir la factura comercial.";
 if(/totals_require_review/.test(message))return "Los importes del pedido y sus artículos no coinciden. Revisa el pedido antes de facturarlo.";
 if(/permission|forbidden|denied/.test(message))return "No tienes autorización para esta operación financiera.";
 if(/payment_exceeds/.test(message))return "El importe supera el saldo pendiente. Actualiza la factura y revisa el cobro.";
 if(/duplicate|unique/.test(message))return "La referencia ya está registrada. Revisa los cobros antes de volver a intentarlo.";
 return "No se pudo confirmar la operación. Conserva los mismos datos al reintentar y revisa el historial.";
}
export default function ErpNativeCommercial(props:{tenantId:string;orders:Order[];onChanged:()=>void}){
 return <CommercialLedger key={props.tenantId} {...props}/>;
}
function CommercialLedger({tenantId,orders,onChanged}:{tenantId:string;orders:Order[];onChanged:()=>void}){
 const tenant=useActiveTenant(),canManage=tenant?.tenant_id===tenantId&&["owner","admin","manager"].includes(tenant.membership_role);
 const [invoices,setInvoices]=useState<CommercialInvoice[]>([]),[loading,setLoading]=useState(true),[ready,setReady]=useState(false),[busy,setBusy]=useState(false);
 const [error,setError]=useState(""),[notice,setNotice]=useState(""),[orderId,setOrderId]=useState(""),[dueDate,setDueDate]=useState("");
 const [payment,setPayment]=useState({invoiceId:"",amount:"",method:"transfer",reference:"",confirmed:false});
 const alive=useRef(false),generation=useRef(0),lock=useRef(false),keys=useRef(new Map<string,{payload:string;key:string}>());
 const load=useCallback(async()=>{
  const current=++generation.current;setLoading(true);
  // Cast on the server: NUMERIC money must not first pass through JS floats.
  const result=await supabase.from("commercial_invoice_balances")
   .select("id,tenant_id,order_id,invoice_number,currency,total::text,subtotal::text,discount_total::text,tax_total::text,amount_paid::text,outstanding::text,due_date,issued_at,overdue,customer_snapshot,lines_snapshot")
   .eq("tenant_id",tenantId).order("issued_at",{ascending:false}).limit(250);
  if(!alive.current||generation.current!==current)return;
  setLoading(false);
  if(result.error){setReady(false);setInvoices([]);setError(failure(result.error.message));return;}
  setInvoices((result.data??[]) as unknown as CommercialInvoice[]);setReady(true);setError("");
 },[tenantId]);
 useEffect(()=>{alive.current=true;void load().catch(()=>{if(alive.current){setLoading(false);setReady(false);setError("No se pudo consultar la facturación comercial.");}});return()=>{alive.current=false;++generation.current;};},[load]);
 async function execute(action:string,payload:Record<string,unknown>,onSuccess:()=>void){
  if(!canManage||!ready||lock.current)return;lock.current=true;setBusy(true);setError("");setNotice("");
  const serialized=JSON.stringify(payload),saved=keys.current.get(action),key=saved?.payload===serialized?saved.key:crypto.randomUUID();
  keys.current.set(action,{payload:serialized,key});
  try{
   const result=await supabase.rpc(action,{...payload,p_tenant_id:tenantId,p_idempotency_key:key});
   if(!alive.current)return;
   if(result.error){setError(failure(result.error.message));return;}
   keys.current.delete(action);onSuccess();setNotice("Operación comercial registrada y auditada.");onChanged();await load();
  }catch{if(alive.current)setError("La conexión se interrumpió. Reintenta con los mismos datos para evitar duplicados.");}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 function issue(event:FormEvent){event.preventDefault();void execute("erp_native_issue_invoice",{p_order_id:orderId,p_due_date:dueDate},()=>{setOrderId("");setDueDate("");});}
 function record(event:FormEvent){
  event.preventDefault();const invoice=invoices.find(row=>row.id===payment.invoiceId);if(!invoice||!payment.confirmed)return;
  try{
   const amount=validateCommercialPayment(payment.amount,invoice.outstanding);
   void execute("erp_native_record_payment",{p_invoice_id:invoice.id,p_amount:amount,p_currency:invoice.currency,p_method:payment.method,p_reference:payment.reference.trim(),p_human_confirmed:true},()=>setPayment({invoiceId:"",amount:"",method:"transfer",reference:"",confirmed:false}));
  }catch{setError("Escribe un importe positivo, con hasta dos decimales, que no supere el saldo pendiente.");}
 }
 function download(invoice:CommercialInvoice){
  if(!tenant||tenant.tenant_id!==tenantId)return;
  try{
   const bytes=buildCommercialInvoicePdf(invoice,{tenantId,name:tenant.tenant_name});
   const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:"application/pdf"})),anchor=document.createElement("a");
   anchor.href=url;anchor.download=invoice.invoice_number.replace(/[^a-zA-Z0-9_.-]/g,"_")+".pdf";anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch{setError("No se pudo generar el PDF desde la factura guardada. Revisa su integridad antes de exportarlo.");}
 }
 const available=orders.filter(order=>order.status!=="cancelled"&&!invoices.some(invoice=>invoice.order_id===order.id));
 const pending=invoices.filter(invoice=>commercialMinor(invoice.outstanding)>0n);
 return <section className="stack gap-16" aria-label="Facturación comercial">
  <div className="card"><div className="eyebrow">Facturación comercial · {tenant?.tenant_name}</div><h2>Facturas y cuentas por cobrar</h2><p className="muted">Facturas del negocio, separadas de la suscripción de Empresia. Los cobros registran dinero recibido y requieren confirmación humana y referencia.</p>
   <button className="button" disabled={busy||loading} onClick={()=>void load().catch(()=>setError("No se pudo actualizar la facturación."))}>Actualizar facturas</button>
   {loading&&<p role="status">Consultando facturas…</p>}{error&&<p className="notice" role="alert">{error}</p>}{notice&&<p className="notice" role="status">{notice}</p>}
  </div>
  {ready&&canManage&&<form className="card" onSubmit={issue}><h3>Emitir factura comercial</h3><fieldset disabled={busy} style={{border:0,padding:0,minWidth:0}}><div className="form-grid">
   <label>Pedido<select required value={orderId} onChange={event=>setOrderId(event.target.value)}><option value="">Seleccionar pedido</option>{available.map(order=><option key={order.id} value={order.id}>{order.order_number} · {commercialMoney(order.total,order.currency)}</option>)}</select></label>
   <label>Vencimiento<input type="date" required value={dueDate} onChange={event=>setDueDate(event.target.value)}/></label>
   </div><p className="muted">Se conservará una instantánea inmutable de los artículos y los importes. No emite NCF ni e-NCF.</p><button className="button primary" disabled={!orderId}>Emitir factura comercial</button></fieldset></form>}
  {ready&&canManage&&pending.length>0&&<form className="card" onSubmit={record}><h3>Registrar cobro recibido</h3><fieldset disabled={busy} style={{border:0,padding:0,minWidth:0}}><div className="form-grid">
   <label>Factura<select required value={payment.invoiceId} onChange={event=>setPayment({...payment,invoiceId:event.target.value,confirmed:false})}><option value="">Seleccionar factura</option>{pending.map(invoice=><option key={invoice.id} value={invoice.id}>{invoice.invoice_number} · Pendiente {commercialMoney(invoice.outstanding,invoice.currency)}</option>)}</select></label>
   <label>Importe en la moneda de la factura<input inputMode="decimal" required pattern="[0-9]+([.][0-9]{1,2})?" value={payment.amount} onChange={event=>setPayment({...payment,amount:event.target.value,confirmed:false})}/></label>
   <label>Método<select value={payment.method} onChange={event=>setPayment({...payment,method:event.target.value})}><option value="transfer">Transferencia</option><option value="cash">Efectivo</option><option value="card">Tarjeta</option><option value="other">Otro</option></select></label>
   <label>Referencia comprobable<input required maxLength={160} value={payment.reference} onChange={event=>setPayment({...payment,reference:event.target.value,confirmed:false})}/></label>
   </div><label style={{display:"flex",gap:10,alignItems:"center",margin:"16px 0"}}><input type="checkbox" required checked={payment.confirmed} onChange={event=>setPayment({...payment,confirmed:event.target.checked})} style={{width:"auto"}}/>Confirmo que el dinero fue recibido y que la referencia es comprobable.</label>
   <button className="button primary" disabled={!payment.confirmed||!payment.invoiceId}>Registrar cobro recibido</button></fieldset></form>}
  {ready&&<div className="card"><h3>Facturas comerciales registradas</h3><p className="muted">Últimas 250 facturas. Los importes conservan la moneda de cada documento.</p>
   {invoices.map(invoice=><article className="priority-item" key={invoice.id} style={{alignItems:"flex-start",flexWrap:"wrap",gap:12}}><div style={{minWidth:0,flex:"1 1 240px",overflowWrap:"anywhere"}}><strong>{invoice.invoice_number}</strong><div>{invoice.customer_snapshot.name} · {commercialMoney(invoice.total,invoice.currency)}</div><div className="muted">Cobrado {commercialMoney(invoice.amount_paid,invoice.currency)} · Pendiente {commercialMoney(invoice.outstanding,invoice.currency)}</div><div className="muted">Vence {invoice.due_date}{invoice.overdue?" · Vencida":""}</div></div><button className="button small" onClick={()=>download(invoice)}>Descargar PDF</button></article>)}
   {invoices.length===0&&<p className="muted">No hay facturas comerciales registradas.</p>}
  </div>}
 </section>;
}

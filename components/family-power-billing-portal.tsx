"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { CreditCard, FileText, RefreshCw, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useActiveTenant } from "@/components/tenant-context";

type Invoice = {
  id:string; status:string; currency:string; total_cents:number; amount_due_cents:number;
  amount_paid_cents:number; hosted_invoice_url:string|null; invoice_number:string|null;
  metadata:Record<string,unknown>|null; period_start:string|null; period_end:string|null;
};
type Subscription = {custom_monthly_price_cents:number|null;current_period_start:string|null;current_period_end:string|null;provider:string;provider_subscription_id:string|null};
type Report = {id:string;invoice_id:string;status:string;payment_method:string;created_at:string};
type Method = "paypal" | "transfer" | "cash";
const usd=(cents:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(Number(cents||0)/100);

export default function FamilyPowerBillingPortal(){
  const tenant=useActiveTenant();
  const tenantId=tenant?.tenant_id??null;
  const allowed=tenant?.tenant_slug==="family-power" && ["owner","admin"].includes(tenant.membership_role);
  const [invoices,setInvoices]=useState<Invoice[]>([]);
  const [subscription,setSubscription]=useState<Subscription|null>(null);
  const [reports,setReports]=useState<Report[]>([]);
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [method,setMethod]=useState<Method>("transfer");
  const [reference,setReference]=useState("");
  const [comment,setComment]=useState("");

  const load=useCallback(async()=>{
    setLoading(true);setError("");
    if(!tenantId||!allowed){setLoading(false);return;}
    const [inv,sub,report]=await Promise.all([
      supabase.from("billing_invoices")
        .select("id,status,currency,total_cents,amount_due_cents,amount_paid_cents,hosted_invoice_url,invoice_number,metadata,period_start,period_end")
        .eq("tenant_id",tenantId).order("created_at",{ascending:false}).limit(50),
      supabase.from("tenant_subscriptions")
        .select("custom_monthly_price_cents,current_period_start,current_period_end,provider,provider_subscription_id")
        .eq("tenant_id",tenantId).maybeSingle(),
      supabase.from("billing_payment_reports")
        .select("id,invoice_id,status,payment_method,created_at")
        .eq("tenant_id",tenantId).order("created_at",{ascending:false}).limit(25)
    ]);
    if(inv.error){setError("No se pudo consultar la facturación autorizada. Si la actualización de base de datos está pendiente, contacta al administrador.");}
    else setInvoices((inv.data??[]) as Invoice[]);
    if(!sub.error)setSubscription(sub.data as Subscription|null);
    if(!report.error)setReports((report.data??[]) as Report[]);
    setLoading(false);
  },[tenantId,allowed]);
  useEffect(()=>{void load();},[load]);
  const initial=useMemo(()=>invoices.find(x=>x.metadata?.billing_stage==="initial")??null,[invoices]);
  const monthly=useMemo(()=>invoices.filter(x=>x.metadata?.billing_stage!=="initial" && x.amount_due_cents>0 && x.status==="open"),[invoices]);
  const due=initial&&initial.amount_due_cents>0&&initial.status==="open"?initial:monthly[0]??null;
  const pendingReport=due?reports.find(r=>r.invoice_id===due.id && r.status==="submitted"):null;
  async function reportPayment(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    if(!tenantId||!allowed||!due||busy)return;
    setBusy(true);setNotice("");setError("");
    try{
      const {data:{user},error:authErr}=await supabase.auth.getUser();
      if(authErr||!user)throw new Error("Inicia sesión de nuevo para reportar el pago.");
      const {error:writeErr}=await supabase.from("billing_payment_reports").insert({
        tenant_id:tenantId,invoice_id:due.id,submitted_by:user.id,payment_method:method,
        reference_text:reference.trim()||null,customer_note:comment.trim()||null
      });
      if(writeErr)throw new Error("No pudimos registrar el reporte. Verifica tus permisos y vuelve a intentar.");
      setNotice("Reporte recibido. No se marca pagado hasta verificar la transacción.");
      setReference("");setComment("");
      await load();
    }catch(e){setError(e instanceof Error?e.message:"No se pudo enviar el reporte.");}
    finally{setBusy(false);}
  }
  if(!allowed)return <div className="notice" role="alert">Pagos de Family Power: solo propietario o administración autorizada.</div>;
  return <div className="content" style={{maxWidth:1000,margin:"0 auto"}}>
    <header className="topbar"><div><div className="eyebrow">Family Power · Cuenta comercial</div>
      <h1>Pagos y suscripción</h1><p className="muted">Consulta tus importes, utiliza PayPal o reporta una transferencia o entrega en efectivo.</p></div>
      <button className="button" type="button" onClick={()=>void load()} disabled={loading}><RefreshCw size={16}/> Actualizar</button>
    </header>
    {error&&<div className="notice" role="alert">{error}</div>}
    {notice&&<div className="notice" role="status">{notice}</div>}
    {loading?<div className="loading">Consultando facturación…</div>:<>
      <section className="grid two-col">
        <article className="card">
          <div className="eyebrow">Implementación inicial</div>
          <h2>{initial?usd(initial.total_cents):"Por sincronizar"}</h2>
          <p className="muted">{!initial?"La factura todavía no está registrada en el CRM.":initial.amount_due_cents>0?"Saldo pendiente de confirmación: "+usd(initial.amount_due_cents):"Pago inicial confirmado."}</p>
          {initial&&<div className="pill">{initial.status==="paid"?"Pagado":initial.status==="open"?"Pendiente":"En revisión"}</div>}
          {initial?.status==="open"&&initial.hosted_invoice_url&&<a className="button primary" style={{display:"flex",marginTop:15}} href={initial.hosted_invoice_url} target="_blank" rel="noopener noreferrer"><CreditCard size={16}/> Pagar factura en PayPal</a>}
        </article>
        <article className="card">
          <div className="eyebrow">Plan mensual acordado</div>
          <h2>US$80.00/mes</h2>
          <p className="muted">{initial?.status==="paid"?"Mensualidad aplicable después del pago inicial confirmado.":"La mensualidad empieza después de confirmar la implementación inicial, según el acuerdo comercial."}</p>
          {subscription?.current_period_end&&<div className="muted">Referencia de siguiente período: {new Date(subscription.current_period_end).toLocaleDateString("es-DO")}</div>}
          <p className="muted" style={{fontSize:12,marginTop:13}}>No se activa un cargo recurrente automático sin autorizar una suscripción en PayPal.</p>
        </article>
      </section>
      {monthly.length>0&&<section className="section-gap card"><h2>Cuotas mensuales pendientes</h2>
        {monthly.map(row=><div key={row.id} className="priority-item"><strong>{row.invoice_number??"Mensualidad"} · {usd(row.amount_due_cents)}</strong>
          {row.hosted_invoice_url?<a href={row.hosted_invoice_url} target="_blank" rel="noopener noreferrer" className="button small">Pagar con PayPal</a>:<span className="muted">Link por habilitar</span>}
        </div>)}
      </section>}
      {due&&<section className="section-gap card" aria-labelledby="report-title">
        <div className="eyebrow">Pago manual o referencia PayPal</div><h2 id="report-title">Reportar un pago para verificación</h2>
        <p className="muted">Factura {due.invoice_number??""} · Saldo registrado {usd(due.amount_due_cents)}. Reportar no garantiza que el dinero haya sido recibido.</p>
        {pendingReport&&<div className="notice" role="status">Hay un reporte en revisión desde {new Date(pendingReport.created_at).toLocaleDateString("es-DO")}. No envíes múltiples solicitudes por el mismo pago.</div>}
        <form onSubmit={reportPayment} className="stack gap-12" style={{maxWidth:570,marginTop:15}}>
          <label htmlFor="fp-payment-method">Medio utilizado</label>
          <select id="fp-payment-method" value={method} onChange={e=>setMethod(e.target.value as Method)}>
            <option value="transfer">Transferencia bancaria</option><option value="cash">Efectivo</option><option value="paypal">PayPal (comprobante para revisión)</option>
          </select>
          <label htmlFor="fp-payment-reference">Referencia o número de comprobante (si aplica)</label>
          <input id="fp-payment-reference" type="text" maxLength={180} value={reference} onChange={e=>setReference(e.target.value)} placeholder="Referencia del pago"/>
          <label htmlFor="fp-payment-note">Nota para administración (opcional)</label>
          <textarea id="fp-payment-note" maxLength={1000} value={comment} onChange={e=>setComment(e.target.value)} placeholder="Fecha, medio e información que ayude a localizar el pago"/>
          <button type="submit" disabled={busy||Boolean(pendingReport)} className="button primary">{busy?"Enviando…":"Enviar para verificación"}</button>
        </form>
      </section>}
      <section className="section-gap card"><h2><ShieldCheck size={18} style={{verticalAlign:"middle",marginRight:9}}/>Acceso y seguridad</h2>
        <p className="muted">Una factura pendiente no elimina tu acceso aprobado al portal. La administración verifica el pago antes de actualizar la cuenta. El acceso a los datos depende de tus permisos, no del enlace de PayPal.</p>
        <Link href="/crm" className="button"><FileText size={15}/> Volver al panel</Link>
      </section>
    </>}
  </div>;
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { CreditCard, FileText, RefreshCw, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useActiveTenant } from "@/components/tenant-context";
import BillingFinancialDashboard from "@/components/billing-financial-dashboard";
import ImplementationContractLedger from "@/components/implementation-contract-ledger";

type Invoice = {
  id:string; provider:string; status:string; currency:string; total_cents:number; amount_due_cents:number;
  amount_paid_cents:number; hosted_invoice_url:string|null; invoice_number:string|null;
  metadata:Record<string,unknown>|null; period_start:string|null; period_end:string|null;
};
type Subscription = {custom_monthly_price_cents:number|null;current_period_start:string|null;current_period_end:string|null;provider:string;provider_subscription_id:string|null;provider_plan_id:string|null;provider_approval_state:string;provider_approval_url:string|null};
type Report = {id:string;invoice_id:string;status:string;payment_method:string;created_at:string};
type Method = "paypal" | "transfer" | "cash";
const usd=(cents:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(Number(cents||0)/100);

export default function FamilyPowerBillingPortal(){
  const tenant=useActiveTenant();
  const tenantId=tenant?.tenant_id??null;
  const allowed=Boolean(tenant) && ["owner","admin"].includes(tenant?.membership_role??"");
  const isFamilyPower=tenant?.tenant_slug==="family-power";
  const [invoices,setInvoices]=useState<Invoice[]>([]);
  const [subscription,setSubscription]=useState<Subscription|null>(null);
  const [implementationStatus,setImplementationStatus]=useState<string|null>(null);
  const [reports,setReports]=useState<Report[]>([]);
  const [busy,setBusy]=useState(false);
  const [syncing,setSyncing]=useState(false);
  const [subscriptionBusy,setSubscriptionBusy]=useState(false);
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
        .select("id,provider,status,currency,total_cents,amount_due_cents,amount_paid_cents,hosted_invoice_url,invoice_number,metadata,period_start,period_end")
        .eq("tenant_id",tenantId).order("created_at",{ascending:false}).limit(50),
      supabase.from("tenant_subscriptions")
        .select("custom_monthly_price_cents,current_period_start,current_period_end,provider,provider_subscription_id,provider_plan_id,provider_approval_state,provider_approval_url")
        .eq("tenant_id",tenantId).maybeSingle(),
      supabase.from("billing_payment_reports")
        .select("id,invoice_id,status,payment_method,created_at")
        .eq("tenant_id",tenantId).order("created_at",{ascending:false}).limit(25)
    ]);
    if(inv.error){setError("No se pudo consultar la facturación autorizada. Si la actualización de base de datos está pendiente, contacta al administrador.");}
    else setInvoices((inv.data??[]) as Invoice[]);
    if(!sub.error)setSubscription(sub.data as Subscription|null);
    if(!report.error)setReports((report.data??[]) as Report[]);
    if(isFamilyPower){
      const {data:contract,error:contractError}=await supabase.rpc("crm_implementation_contract_summary",{p_tenant_id:tenantId});
      setImplementationStatus(!contractError&&contract&&typeof contract==="object"
        ?String((contract as {status?:string}).status??"unknown"):"unknown");
    }else setImplementationStatus(null);
    setLoading(false);
  },[tenantId,allowed,isFamilyPower]);
  useEffect(()=>{void load();},[load]);
  const initial=useMemo(()=>invoices.find(x=>x.metadata?.billing_stage==="implementation_installment" && x.metadata?.installment_number===1)??null,[invoices]);
  const monthly=useMemo(()=>invoices.filter(x=>!x.metadata?.contract_code && x.amount_due_cents>0 && x.status==="open"),[invoices]);
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
  async function syncPayPal(){
    if(!due||due.provider!=="paypal"||syncing)return;
    setSyncing(true);setError("");setNotice("");
    try{
      const {data,error:apiError}=await supabase.functions.invoke("paypal-billing",{
        body:{action:"sync",invoice_id:due.id}
      });
      if(apiError||!data?.ok){
        setError("No se pudo verificar PayPal en este momento. Si la integración aún no tiene credenciales, el administrador debe configurarlas.");
        return;
      }
      if(["paid","already_paid"].includes(String(data.status)))
        setNotice("PayPal confirmó el pago y la factura fue conciliada.");
      else if(data.status==="manual_review")
        setNotice("Hay un pago parcial o manual; administración debe conciliarlo antes de cerrar la factura.");
      else
        setNotice("PayPal todavía no confirma esta factura como pagada.");
      await load();
    }catch{
      setError("No se pudo contactar al verificador PayPal.");
    }finally{setSyncing(false);}
  }
  async function startPayPalSubscription(){
    if(!isFamilyPower||!tenantId||implementationStatus!=="settled"||subscriptionBusy)return;
    setSubscriptionBusy(true);setError("");setNotice("");
    try{
      const {data,error:invokeError}=await supabase.functions.invoke("paypal-subscriptions",{
        body:{action:"start_subscription",tenant_id:tenantId}
      });
      if(invokeError||!data||data.error){
        setError("No se pudo iniciar la autorización PayPal. El contrato de RD$30,000 debe estar totalmente saldado y el plan de US$80 preparado.");
      }else if(typeof data.approval_url==="string"&&data.approval_url.startsWith("https://www.paypal.com/")){
        window.location.assign(data.approval_url);
        return;
      }else{
        setNotice("Estado de suscripción: "+String(data.status??"en revisión")+".");
        await load();
      }
    }catch{
      setError("No se pudo consultar el servicio de suscripciones.");
    }finally{setSubscriptionBusy(false);}
  }
  async function checkPayPalSubscription(){
    if(!tenantId||subscriptionBusy)return;
    setSubscriptionBusy(true);setNotice("");setError("");
    try{
      const {data,error:invokeError}=await supabase.functions.invoke("paypal-subscriptions",{
        body:{action:"check_subscription",tenant_id:tenantId}
      });
      if(invokeError||!data||data.error)
        setError("No se pudo verificar la suscripción en PayPal.");
      else {
        setNotice(data.status==="ACTIVE"
          ?"PayPal confirmó una suscripción activa."
          :"PayPal informa el estado: "+String(data.status??"desconocido")+".");
        await load();
      }
    }catch{setError("No se pudo consultar PayPal.");}
    finally{setSubscriptionBusy(false);}
  }
  if(!allowed)return <div className="notice" role="alert">Facturación: solo propietario o administración autorizada de la empresa.</div>;
  return <div className="content" style={{maxWidth:1000,margin:"0 auto"}}>
    <header className="topbar"><div><div className="eyebrow">{tenant?.tenant_name??"Tu empresa"} · Cuenta comercial</div>
      <h1>Pagos y suscripción</h1><p className="muted">Consulta tus importes, utiliza PayPal o reporta una transferencia o entrega en efectivo.</p></div>
      <button className="button" type="button" onClick={()=>void load()} disabled={loading}><RefreshCw size={16}/> Actualizar</button>
    </header>
    {isFamilyPower&&tenantId&&<ImplementationContractLedger tenantId={tenantId}/>}
    <BillingFinancialDashboard tenantId={tenantId}/>
    {error&&<div className="notice" role="alert">{error}</div>}
    {notice&&<div className="notice" role="status">{notice}</div>}
    {loading?<div className="loading">Consultando facturación…</div>:<>
      <section className="grid two-col">
        <article className="card">
          <div className="eyebrow">{isFamilyPower?"Primera cuota de implementación":"Facturación de servicios"}</div>
          <h2>{initial?usd(initial.total_cents):invoices.length?usd(invoices.reduce((sum,i)=>sum+Math.max(0,i.amount_due_cents||0),0)):"Sin facturas registradas"}</h2>
          <p className="muted">{!initial?"Consulta tus facturas pendientes y los pagos conciliados en este portal.":initial.amount_due_cents>0?"Primera cuota pendiente: "+usd(initial.amount_due_cents)+" (del contrato de RD$30,000).":"Primera cuota pagada. El saldo contractual en pesos se reduce al aplicar el tipo de cambio acordado."}</p>
          {initial&&<div className="pill">{initial.status==="paid"?"Pagado":initial.status==="open"?"Pendiente":"En revisión"}</div>}
          {(implementationStatus!=="settled"||!isFamilyPower)&&initial?.status==="open"&&initial.hosted_invoice_url&&<a className="button primary" style={{display:"flex",marginTop:15}} href={initial.hosted_invoice_url} target="_blank" rel="noopener noreferrer"><CreditCard size={16}/> Pagar factura en PayPal</a>}
          {due?.provider==="paypal"&&<button type="button" className="button" disabled={syncing} style={{display:"flex",marginTop:10}} onClick={()=>void syncPayPal()}>
            <RefreshCw size={16}/>{syncing?"Consultando PayPal…":"Comprobar pago en PayPal"}
          </button>}
        </article>
        <article className="card">
          <div className="eyebrow">Plan de suscripción</div>
          <h2>{isFamilyPower?usd(8000):subscription?.custom_monthly_price_cents?usd(subscription.custom_monthly_price_cents):"Por definir"}/mes</h2>
          <p className="muted">{isFamilyPower&&implementationStatus!=="settled"?"La mensualidad de US$80 es independiente y se ofrece después de liquidar el contrato de RD$30,000, con tu autorización en PayPal.":subscription?.provider_subscription_id?"Suscripción identificada en el proveedor. Verifica su estado en PayPal.":"Aún no hay un mandato de cobro automático aprobado en PayPal."}</p>
          {subscription?.current_period_end&&<div className="muted">Referencia de siguiente período: {new Date(subscription.current_period_end).toLocaleDateString("es-DO")}</div>}
          <p className="muted" style={{fontSize:12,marginTop:13}}>No se activa un cargo recurrente automático sin autorizar una suscripción en PayPal.</p>
        </article>
      </section>
      {isFamilyPower&&<section className="section-gap card" aria-label="Autorización de suscripción PayPal">
        <div className="eyebrow">Plan Family Power ARM</div>
        <h2>Suscripción de US$80/mes</h2>
        {implementationStatus!=="settled"
          ?<p className="muted">Primero deben completarse todas las cuotas del contrato de implementación de RD$30,000. El pago de US$197 es solo la primera cuota.</p>
          :<>
            <p className="muted">Los pagos recurrentes requieren tu consentimiento dentro de PayPal. No se activan al registrarte ni al pulsar pagar después.</p>
            {subscription?.provider_approval_state==="approved"
              ?<div className="notice" role="status">Suscripción aprobada. Revisa tu próximo vencimiento en PayPal.</div>
              :<>
                {subscription?.provider_approval_state==="awaiting_buyer"&&<p className="muted">Autorización pendiente de completar en PayPal.</p>}
                <button className="button primary" type="button" onClick={()=>void startPayPalSubscription()} disabled={subscriptionBusy}>
                  {subscriptionBusy?"Preparando autorización…":"Autorizar US$80 mensuales en PayPal"}
                </button>
              </>}
            {subscription?.provider_subscription_id&&<button type="button" className="button" style={{marginLeft:8}} disabled={subscriptionBusy} onClick={()=>void checkPayPalSubscription()}>
              <RefreshCw size={15}/> Verificar estado en PayPal
            </button>}
          </>}
      </section>}
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

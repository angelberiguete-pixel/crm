"use client";

import {useCallback,useEffect,useMemo,useState,type FormEvent} from "react";
import {CircleCheck,FileClock,RefreshCw,ShieldCheck} from "lucide-react";
import {supabase} from "@/lib/supabase";

type Installment={
  invoice_id:string;invoice_number:string|null;currency:string;
  amount_cents:number;amount_due_cents:number;status:string;
  credited_to_contract:boolean;hosted_invoice_url:string|null;
};
type Contract={
  status:string;contract_id?:string;contract_code?:string;currency?:string;
  client_label?:string;total_dop_cents?:number;credited_dop_cents?:number;
  remaining_dop_cents?:number;first_installment?:Installment|null;
  paid_invoices_awaiting_allocation?:number;
};
type Credit={
  id:string;invoice_id:string|null;source_currency:string;source_amount_cents:number;
  exchange_rate_dop_per_usd:number|null;credited_dop_cents:number;
  method:string;confirmed_at:string;
};
type InvoiceOption={
  id:string;invoice_number:string|null;status:string;currency:string;
  total_cents:number;amount_paid_cents:number;metadata:Record<string,unknown>|null;
};
const dop=(value:number)=>new Intl.NumberFormat("es-DO",{style:"currency",currency:"DOP"}).format((value||0)/100);
const usd=(value:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format((value||0)/100);

export default function ImplementationContractLedger({
  tenantId,ownerControls=false
}:{tenantId:string;ownerControls?:boolean}){
  const [contract,setContract]=useState<Contract|null>(null);
  const [credits,setCredits]=useState<Credit[]>([]);
  const [invoices,setInvoices]=useState<InvoiceOption[]>([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [invoiceId,setInvoiceId]=useState("");
  const [rate,setRate]=useState("");
  const [manualMethod,setManualMethod]=useState<"transfer"|"cash">("transfer");
  const [manualAmount,setManualAmount]=useState("");
  const [manualReference,setManualReference]=useState("");

  const refresh=useCallback(async()=>{
    setLoading(true);setError("");
    const [summary,existing,invoicesResponse]=await Promise.all([
      supabase.rpc("crm_implementation_contract_summary",{p_tenant_id:tenantId}),
      supabase.from("billing_implementation_credits").select(
        "id,invoice_id,source_currency,source_amount_cents,exchange_rate_dop_per_usd,credited_dop_cents,method,confirmed_at"
      ).eq("tenant_id",tenantId).order("confirmed_at",{ascending:false}),
      supabase.from("billing_invoices")
        .select("id,invoice_number,status,currency,total_cents,amount_paid_cents,metadata")
        .eq("tenant_id",tenantId).order("created_at",{ascending:false}).limit(100)
    ]);
    if(summary.error||!summary.data){
      setError("No se pudo consultar el contrato de implementación.");setContract(null);
    }else setContract(summary.data as Contract);
    if(!existing.error)setCredits(existing.data as Credit[]);
    if(!invoicesResponse.error)setInvoices(invoicesResponse.data as InvoiceOption[]);
    setLoading(false);
  },[tenantId]);
  useEffect(()=>{void refresh();},[refresh]);

  const eligibleInvoices=useMemo(()=>invoices.filter(i=>
    i.status==="paid"&&i.amount_paid_cents>0
    &&i.metadata?.contract_code===contract?.contract_code
    &&!credits.some(c=>c.invoice_id===i.id)
  ),[invoices,credits,contract?.contract_code]);
  const selected=eligibleInvoices.find(i=>i.id===invoiceId)??eligibleInvoices[0]??null;

  async function allocatePaidInvoice(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    if(!ownerControls||!contract?.contract_id||!selected||busy)return;
    const exchange=selected.currency==="USD"?Number(rate):null;
    if(selected.currency==="USD"&&(!Number.isFinite(exchange)||!exchange||exchange<=0||exchange>1000)){
      setError("Registra la tasa DOP por USD acordada para este abono.");return;
    }
    const projected=selected.currency==="USD"
      ?Math.round(selected.amount_paid_cents*Number(exchange))
      :selected.amount_paid_cents;
    if(projected<=0||projected>(contract.remaining_dop_cents??0)){
      setError("El crédito calculado supera el saldo del contrato. Revisa la tasa o concilia el excedente por separado.");return;
    }
    if(!window.confirm(
      "¿Has verificado el pago y aprobado la tasa de cambio? Registrar "+
      dop(projected)+" como abono al contrato de implementación de RD$30,000. Esta acción queda auditada."
    ))return;
    setBusy(true);setError("");setNotice("");
    const {error:rpcError}=await supabase.rpc("platform_apply_implementation_credit",{
      p_contract_id:contract.contract_id,
      p_invoice_id:selected.id,
      p_rate_dop_per_usd:exchange,
      p_verified_dop_cents:null,
      p_method:selected.currency==="USD"?"paypal":"transfer",
      p_reference:null
    });
    if(rpcError)setError("No se aplicó el abono: "+rpcError.message);
    else {setNotice("Cuota verificada y abonada al contrato.");setRate("");setInvoiceId("");await refresh();}
    setBusy(false);
  }

  async function recordManual(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    if(!ownerControls||!contract?.contract_id||busy)return;
    const amount=Number(manualAmount),cents=Math.round(amount*100);
    if(!Number.isSafeInteger(cents)||cents<=0||cents>(contract.remaining_dop_cents??0)){
      setError("Introduce un importe en pesos positivo y no mayor al saldo del contrato.");return;
    }
    if(manualReference.trim().length<4){setError("El comprobante o referencia debe tener al menos cuatro caracteres.");return;}
    if(!window.confirm("¿Confirmaste un ingreso real de "+dop(cents)+" mediante "+manualMethod+"? Esta acción reduce la deuda del contrato."))return;
    setBusy(true);setError("");setNotice("");
    const {error:rpcError}=await supabase.rpc("platform_apply_implementation_credit",{
      p_contract_id:contract.contract_id,
      p_invoice_id:null,p_rate_dop_per_usd:null,
      p_verified_dop_cents:cents,p_method:manualMethod,p_reference:manualReference.trim()
    });
    if(rpcError)setError("No se registró el abono: "+rpcError.message);
    else {setNotice("Abono en pesos conciliado correctamente.");setManualAmount("");setManualReference("");await refresh();}
    setBusy(false);
  }

  if(loading)return <section className="card section-gap" role="status">Consultando contrato de implementación…</section>;
  if(contract?.status==="not_configured")return null;
  if(!contract){
    return <section className="card section-gap" role="alert">{error||"Contrato no disponible."}</section>;
  }
  const first=contract.first_installment;
  return <section className="card section-gap" aria-label="Contrato de implementación y cuotas">
    <div className="eyebrow">Contrato de implementación · {contract.client_label??"Cliente"}</div>
    <h2>Implementación tecnológica en cuotas</h2>
    <div className="grid metrics" style={{marginTop:16,marginBottom:16}}>
      <div className="metric"><div className="metric-label">Contrato total</div>
        <div className="metric-value">{dop(contract.total_dop_cents??0)}</div>
      </div>
      <div className="metric"><div className="metric-label">Abonos aplicados</div>
        <div className="metric-value">{dop(contract.credited_dop_cents??0)}</div>
      </div>
      <div className="metric"><div className="metric-label">Saldo pendiente</div>
        <div className="metric-value">{dop(contract.remaining_dop_cents??0)}</div>
      </div>
    </div>
    {first&&<div className="priority-item">
      <div>
        <strong>Cuota 1 · Factura PayPal #{first.invoice_number??"0002"} · {usd(first.amount_cents)}</strong>
        <div className="muted" style={{fontSize:12}}>
          {first.status==="paid"
            ?first.credited_to_contract?"Pagada y aplicada al contrato":"Pagada en PayPal; pendiente de aplicar con tasa aprobada"
            :"Pendiente de pago y verificación"}
        </div>
      </div>
      {first.status==="open"&&first.hosted_invoice_url
        ?<a href={first.hosted_invoice_url} target="_blank" rel="noopener noreferrer" className="button small">Pagar cuota en PayPal</a>
        :first.credited_to_contract?<CircleCheck size={22} aria-label="Aplicada"/>:<FileClock size={22} aria-label="Pendiente de conciliación"/>}
    </div>}
    {(contract.paid_invoices_awaiting_allocation??0)>0&&<div className="notice" role="status">
      Hay {contract.paid_invoices_awaiting_allocation} factura(s) pagada(s) que requieren registro de conversión a pesos antes de reducir el saldo contractual.
    </div>}
    {contract.status==="settled"&&<div className="notice" role="status"><CircleCheck size={17}/> Implementación totalmente pagada.</div>}
    {credits.length>0&&<div style={{marginTop:16}}>
      <h3>Historial de abonos confirmados</h3>
      {credits.map(c=><div className="priority-item" key={c.id}>
        <span>{new Date(c.confirmed_at).toLocaleDateString("es-DO")} · {c.method==="paypal"?"PayPal":c.method==="cash"?"Efectivo":"Transferencia"}</span>
        <strong>{dop(c.credited_dop_cents)}</strong>
      </div>)}
    </div>}
    <p className="muted" style={{fontSize:12,marginTop:14}}>
      Las cuotas en dólares solo reducen la deuda en pesos cuando se confirma el cobro y se registra la tasa DOP/USD acordada. La mensualidad de US$80 es independiente del contrato.
    </p>
    {ownerControls&&contract.status==="open"&&<>
      {error&&<div className="notice" role="alert">{error}</div>}
      {notice&&<div className="notice" role="status">{notice}</div>}
      {eligibleInvoices.length>0&&<form onSubmit={allocatePaidInvoice} className="stack gap-12 section-gap">
        <h3><ShieldCheck size={17}/> Aplicar una cuota PayPal ya pagada</h3>
        <label htmlFor="contract-invoice">Factura con pago confirmado</label>
        <select id="contract-invoice" value={selected?.id??""} onChange={e=>setInvoiceId(e.target.value)}>
          {eligibleInvoices.map(i=><option value={i.id} key={i.id}>#{i.invoice_number??i.id.slice(0,8)} · {i.currency==="USD"?usd(i.total_cents):dop(i.total_cents)}</option>)}
        </select>
        {selected?.currency==="USD"&&<>
          <label htmlFor="contract-fx">Tasa acordada RD$ por US$1</label>
          <input id="contract-fx" type="number" min=".0001" max="1000" step=".0001" required value={rate} onChange={e=>setRate(e.target.value)} placeholder="Ej.: tasa del acuerdo o del comprobante"/>
        </>}
        <button className="button primary" disabled={busy} type="submit">Aplicar abono confirmado</button>
      </form>}
      <form onSubmit={recordManual} className="stack gap-12 section-gap">
        <h3>Registrar transferencia o efectivo verificado en pesos</h3>
        <label htmlFor="contract-method">Método</label>
        <select id="contract-method" value={manualMethod} onChange={e=>setManualMethod(e.target.value as "cash"|"transfer")}>
          <option value="transfer">Transferencia bancaria</option><option value="cash">Efectivo</option>
        </select>
        <label htmlFor="contract-dop-amount">Importe recibido en RD$</label>
        <input id="contract-dop-amount" type="number" min=".01" step=".01" required value={manualAmount} onChange={e=>setManualAmount(e.target.value)}/>
        <label htmlFor="contract-reference">Referencia de ingreso comprobado</label>
        <input id="contract-reference" type="text" minLength={4} maxLength={180} required value={manualReference} onChange={e=>setManualReference(e.target.value)}/>
        <button className="button primary" type="submit" disabled={busy}>{busy?"Guardando…":"Confirmar y aplicar abono en pesos"}</button>
      </form>
    </>}
    <button className="button" type="button" onClick={()=>void refresh()} disabled={busy}><RefreshCw size={15}/> Actualizar saldo</button>
  </section>;
}

"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Order = {
  id: string; order_number: string; quotation_id: string | null; contact_id: string | null;
  status: string; currency: string; total: number; amount_paid: number; committed_at: string | null; created_at: string;
};
type Quote = { id: string; quote_number: string; status: string; total: number; contact_id: string | null; company_id: string | null; opportunity_id: string | null };
type Job = { id: string; order_id: string; status: string; priority: number; technique: string | null; design_approved: boolean; quality_control_status: string | null };
type Delivery = { id: string; order_id: string; status: string; delivery_zone: string | null; delivery_address: string | null; shipping_cost: number | null; scheduled_at: string | null };
type Payment = { id: string; order_id: string; amount: number; status: string; payment_method: string | null; received_at: string };
type Settings = { brand_name: string | null; currency: string; timezone: string };
const money = new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP", maximumFractionDigits: 0 });

export default function CrmOperations({ tenantId }: { tenantId: string }) {
  const [orders,setOrders]=useState<Order[]>([]);
  const [quotes,setQuotes]=useState<Quote[]>([]);
  const [jobs,setJobs]=useState<Job[]>([]);
  const [deliveries,setDeliveries]=useState<Delivery[]>([]);
  const [payments,setPayments]=useState<Payment[]>([]);
  const [settings,setSettings]=useState<Settings|null>(null);
  const [quoteId,setQuoteId]=useState("");
  const [committedAt,setCommittedAt]=useState("");
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  const [reload,setReload]=useState(0);

  async function load() {
    const [o,q,j,d,p,s] = await Promise.all([
      supabase.from("orders").select("id,order_number,quotation_id,contact_id,status,currency,total,amount_paid,committed_at,created_at").eq("tenant_id",tenantId).order("created_at",{ascending:false}).limit(250),
      supabase.from("quotations").select("id,quote_number,status,total,contact_id,company_id,opportunity_id").eq("tenant_id",tenantId).order("created_at",{ascending:false}).limit(250),
      supabase.from("production_jobs").select("id,order_id,status,priority,technique,design_approved,quality_control_status").eq("tenant_id",tenantId).order("created_at",{ascending:false}).limit(250),
      supabase.from("deliveries").select("id,order_id,status,delivery_zone,delivery_address,shipping_cost,scheduled_at").eq("tenant_id",tenantId).order("created_at",{ascending:false}).limit(250),
      supabase.from("customer_payments").select("id,order_id,amount,status,payment_method,received_at").eq("tenant_id",tenantId).order("received_at",{ascending:false}).limit(250),
      supabase.from("tenant_settings").select("brand_name,currency,timezone").eq("tenant_id",tenantId).maybeSingle()
    ]);
    const err=[o,q,j,d,p,s].find(x=>x.error)?.error;
    if(err) setNotice(err.message);
    setOrders((o.data??[]).map(x=>({...x,total:Number(x.total),amount_paid:Number(x.amount_paid)})) as Order[]);
    setQuotes((q.data??[]).map(x=>({...x,total:Number(x.total)})) as Quote[]);
    setJobs((j.data??[]) as Job[]);
    setDeliveries((d.data??[]).map(x=>({...x,shipping_cost:x.shipping_cost===null?null:Number(x.shipping_cost)})) as Delivery[]);
    setPayments((p.data??[]).map(x=>({...x,amount:Number(x.amount)})) as Payment[]);
    setSettings(s.data as Settings|null);
  }
  useEffect(()=>{ load(); },[tenantId,reload]);

  const acceptedQuotes=useMemo(()=>quotes.filter(q=>q.status==="accepted" && !orders.some(o=>o.quotation_id===q.id)),[quotes,orders]);
  const jobByOrder=useMemo(()=>new Map(jobs.map(j=>[j.order_id,j])),[jobs]);
  const deliveryByOrder=useMemo(()=>new Map(deliveries.map(d=>[d.order_id,d])),[deliveries]);
  const paidByOrder=useMemo(()=> {
    const m=new Map<string,number>();
    for(const p of payments) if(p.status!=="voided") m.set(p.order_id,(m.get(p.order_id)??0)+p.amount);
    return m;
  },[payments]);

  async function createOrder(e:FormEvent){
    e.preventDefault(); setNotice("");
    const quote=acceptedQuotes.find(q=>q.id===quoteId);
    if(!quote) return setNotice("Selecciona una cotización aceptada.");
    setBusy(true);
    const converted=await supabase.rpc("convert_quotation_to_order",{
      p_quotation_id:quote.id,
      p_committed_at:committedAt?new Date(committedAt).toISOString():null
    });
    setBusy(false);
    if(converted.error) return setNotice(converted.error.message);
    setQuoteId(""); setCommittedAt(""); setNotice("Pedido creado con sus artículos y enviado a producción. El diseño debe aprobarse antes de comenzar."); setReload(v=>v+1);
  }

  async function approveDesign(orderId:string){
    setNotice("");
    const j=jobByOrder.get(orderId); if(!j) return;
    const now=new Date().toISOString();
    const r=await supabase.from("production_jobs").update({design_approved:true,design_approved_at:now,status:"ready"}).eq("tenant_id",tenantId).eq("id",j.id);
    if(r.error)return setNotice(r.error.message);
    setNotice("Diseño aprobado. El trabajo ya puede comenzar."); setReload(v=>v+1);
  }

  async function setProductionStatus(orderId:string,status:string){
    const j=jobByOrder.get(orderId); if(!j) return;
    if(["ready","in_progress","quality_control","completed"].includes(status) && !j.design_approved) return setNotice("Debes aprobar el diseño antes de iniciar producción.");
    const patch:any={status};
    if(status==="in_progress") patch.started_at=new Date().toISOString();
    if(status==="completed"){patch.completed_at=new Date().toISOString();patch.quality_control_status="passed";}
    const r=await supabase.from("production_jobs").update(patch).eq("tenant_id",tenantId).eq("id",j.id);
    if(r.error)return setNotice(r.error.message);
    const orderStatus=status==="in_progress"?"in_production":status==="quality_control"?"quality_control":status==="completed"?"ready_for_delivery":null;
    if(orderStatus) await supabase.from("orders").update({status:orderStatus}).eq("tenant_id",tenantId).eq("id",orderId);
    setReload(v=>v+1);
  }

  async function ensureDelivery(order:Order){
    if(deliveryByOrder.has(order.id)) return;
    const r=await supabase.from("deliveries").insert({tenant_id:tenantId,order_id:order.id,status:"pending"});
    if(r.error)return setNotice(r.error.message);
    setNotice("Entrega creada."); setReload(v=>v+1);
  }

  async function markDelivered(orderId:string){
    const d=deliveryByOrder.get(orderId); if(!d)return;
    const now=new Date().toISOString();
    const r=await supabase.from("deliveries").update({status:"delivered",delivered_at:now}).eq("tenant_id",tenantId).eq("id",d.id);
    if(r.error)return setNotice(r.error.message);
    await supabase.from("orders").update({status:"delivered",delivered_at:now}).eq("tenant_id",tenantId).eq("id",orderId);
    setNotice("Entrega confirmada."); setReload(v=>v+1);
  }

  async function recordPayment(order:Order){
    const raw=window.prompt("Monto recibido en RD$");
    if(!raw)return;
    const amount=Number(raw);
    if(!Number.isFinite(amount)||amount<=0)return setNotice("Monto inválido.");
    const method=window.prompt("Método de pago (efectivo, transferencia, tarjeta, etc.)")||"manual";
    const r=await supabase.from("customer_payments").insert({tenant_id:tenantId,order_id:order.id,amount,currency:"DOP",payment_method:method,status:"confirmed"});
    if(r.error)return setNotice(r.error.message);
    const newPaid=(paidByOrder.get(order.id)??0)+amount;
    await supabase.from("orders").update({amount_paid:newPaid}).eq("tenant_id",tenantId).eq("id",order.id);
    setNotice("Pago registrado."); setReload(v=>v+1);
  }

  return <div className="stack gap-16">
    <section className="card">
      <div className="eyebrow">{settings?.brand_name??"Cliente"} · Operaciones</div>
      <h2>Pedido → Producción → Entrega → Cobro</h2>
      <p className="muted">Flujo operativo real por tenant. Las cotizaciones deben estar aceptadas antes de convertirse en pedido.</p>
      {notice && <div className="notice" style={{marginTop:12}}>{notice}</div>}
    </section>

    <form className="card" onSubmit={createOrder}>
      <h2>Crear pedido desde cotización aceptada</h2>
      <div className="form-grid">
        <label>Cotización<select value={quoteId} onChange={e=>setQuoteId(e.target.value)} required><option value="">Seleccionar</option>{acceptedQuotes.map(q=><option key={q.id} value={q.id}>{q.quote_number} · {money.format(q.total)}</option>)}</select></label>
        <label>Fecha comprometida<input type="datetime-local" value={committedAt} onChange={e=>setCommittedAt(e.target.value)} /></label>
      </div>
      <div className="section-gap"><button className="button primary" disabled={busy||acceptedQuotes.length===0}>{busy?"Creando…":"Crear pedido"}</button></div>
      {acceptedQuotes.length===0 && <div className="muted">No hay cotizaciones aceptadas pendientes de convertir.</div>}
    </form>

    <section className="grid metrics">
      <div className="metric"><div className="metric-label">Pedidos activos</div><div className="metric-value">{orders.filter(o=>!["delivered","cancelled"].includes(o.status)).length}</div><div className="metric-sub">En operación</div></div>
      <div className="metric"><div className="metric-label">En producción</div><div className="metric-value">{jobs.filter(j=>["ready","in_progress","quality_control"].includes(j.status)).length}</div><div className="metric-sub">Trabajos abiertos</div></div>
      <div className="metric"><div className="metric-label">Listos/entrega</div><div className="metric-value">{orders.filter(o=>["ready_for_delivery","out_for_delivery"].includes(o.status)).length}</div><div className="metric-sub">Pendientes de cierre</div></div>
      <div className="metric"><div className="metric-label">Cobrado</div><div className="metric-value">{money.format(payments.filter(p=>p.status!=="voided").reduce((a,p)=>a+p.amount,0))}</div><div className="metric-sub">Pagos registrados</div></div>
    </section>

    <section className="card">
      <h2>Pedidos</h2>
      {orders.map(o=>{
        const j=jobByOrder.get(o.id); const d=deliveryByOrder.get(o.id); const paid=paidByOrder.get(o.id)??o.amount_paid;
        return <div key={o.id} className="priority-item" style={{alignItems:"flex-start",gap:12,flexWrap:"wrap"}}>
          <div style={{minWidth:220,flex:1}}><strong>{o.order_number}</strong><div className="muted">{o.status} · {money.format(o.total)} · pagado {money.format(paid)}</div>{o.committed_at&&<div className="muted">Comprometido: {new Date(o.committed_at).toLocaleString("es-DO")}</div>}</div>
          <div className="top-actions" style={{flexWrap:"wrap"}}>
            {j&&!j.design_approved&&<button className="button small" onClick={()=>approveDesign(o.id)}>Aprobar diseño</button>}
            {j&&j.design_approved&&j.status!=="completed"&&<select value={j.status} onChange={e=>setProductionStatus(o.id,e.target.value)}><option value="ready">Listo para producir</option><option value="in_progress">En producción</option><option value="quality_control">Control de calidad</option><option value="completed">Producción terminada</option></select>}
            {o.status==="ready_for_delivery"&&!d&&<button className="button small" onClick={()=>ensureDelivery(o)}>Crear entrega</button>}
            {d&&d.status!=="delivered"&&<button className="button small" onClick={()=>markDelivered(o.id)}>Confirmar entrega</button>}
            <button className="button small" onClick={()=>recordPayment(o)}>Registrar pago</button>
          </div>
        </div>;
      })}
      {orders.length===0&&<div className="empty"><strong>Sin pedidos</strong><div>Acepta una cotización y conviértela en el primer pedido real.</div></div>}
    </section>
  </div>;
}

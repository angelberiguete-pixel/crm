"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, ArrowUpRight, CircleDollarSign, Clock3, CreditCard, RefreshCw } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";
import { supabase } from "@/lib/supabase";

type Month = { month: string; collected_cents: number };
type FinanceSnapshot = {
  currency: "USD";
  received_cents: number;
  pending_cents: number;
  overdue_cents: number;
  paid_invoices: number;
  open_invoices: number;
  overdue_invoices: number;
  paypal_active_subscriptions: number;
  manual_plans: number;
  verified_subscription_failures: number;
  monthly_collected: Month[];
};
const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents || 0) / 100);
const formatMonth = (value: string) => {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return value;
  return new Intl.DateTimeFormat("es-DO", { month: "short" }).format(new Date(Date.UTC(year, month - 1, 1)));
};
const zeroState = "Los importes provienen de facturas registradas y pagos conciliados. No incluyen operaciones externas que aún no estén registradas en el CRM.";

export default function BillingFinancialDashboard({ tenantId = null }: { tenantId?: string | null }) {
  const [metrics, setMetrics] = useState<FinanceSnapshot | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: rpcError } = await supabase.rpc("crm_billing_financial_snapshot", {
      p_tenant_id: tenantId,
    });
    if (rpcError || !data || typeof data !== "object") {
      setMetrics(null);
      setError("No fue posible consultar el panel financiero autorizado.");
    } else {
      setMetrics(data as FinanceSnapshot);
    }
    setLoading(false);
  }, [tenantId]);
  useEffect(() => { void load(); }, [load]);

  const rows = metrics?.monthly_collected ?? [];
  const chartData = rows.map((entry) => ({
    month: formatMonth(entry.month),
    received: entry.collected_cents / 100,
  }));

  return <section className="section-gap" aria-label="Panel financiero del CRM">
    <div className="topbar" style={{marginBottom:16}}>
      <div>
        <div className="eyebrow">Facturación · Datos verificados en el CRM</div>
        <h2 style={{margin:0}}>Panel financiero {tenantId ? "de la empresa" : "general"}</h2>
        <p className="muted">Ingresos conciliados, pendientes y suscripciones. Importes en USD.</p>
      </div>
      <button type="button" className="button" onClick={() => void load()} disabled={loading}>
        <RefreshCw size={16} aria-hidden="true"/> Actualizar
      </button>
    </div>
    {error && <div className="notice" role="alert">{error}</div>}
    {loading ? <div className="loading" role="status">Consultando facturas y suscripciones…</div>
      : metrics && <>
      <div className="grid metrics" style={{marginBottom:16}}>
        <div className="metric">
          <div className="metric-label"><CircleDollarSign size={15} aria-hidden="true"/> Cobrado y conciliado</div>
          <div className="metric-value">{money(metrics.received_cents)}</div>
          <div className="metric-sub">{metrics.paid_invoices} facturas pagadas por completo</div>
        </div>
        <div className="metric">
          <div className="metric-label"><CreditCard size={15} aria-hidden="true"/> Saldo por cobrar</div>
          <div className="metric-value">{money(metrics.pending_cents)}</div>
          <div className="metric-sub">{metrics.open_invoices} facturas abiertas</div>
        </div>
        <div className="metric">
          <div className="metric-label"><Clock3 size={15} aria-hidden="true"/> Saldo vencido</div>
          <div className="metric-value">{money(metrics.overdue_cents)}</div>
          <div className="metric-sub">{metrics.overdue_invoices} facturas vencidas según fecha registrada</div>
        </div>
        <div className="metric">
          <div className="metric-label"><Activity size={15} aria-hidden="true"/> Suscripciones PayPal activas</div>
          <div className="metric-value">{metrics.paypal_active_subscriptions}</div>
          <div className="metric-sub">{metrics.manual_plans} planes manuales · {metrics.verified_subscription_failures} eventos de fallo registrados</div>
        </div>
      </div>
      <div className="card">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}>
          <div><h3 style={{margin:"0 0 5px"}}>Ingresos mensuales conciliados</h3><p className="muted" style={{margin:0}}>Últimos seis meses · USD</p></div>
          <ArrowUpRight size={19} aria-hidden="true" color="#5764b2"/>
        </div>
        {rows.length > 0 ?
          <div style={{width:"100%",height:232,marginTop:18,minWidth:0}}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{top:8,right:10,left:-12,bottom:0}}>
                <XAxis dataKey="month" tick={{fontSize:12}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fontSize:11}} tickLine={false} axisLine={false} width={54} tickFormatter={value=>"$"+Number(value).toLocaleString("en-US")}/>
                <Tooltip formatter={value => [money(Number(value)*100), "Cobrado"]}/>
                <Bar dataKey="received" fill="#4c55a7" maxBarSize={54} radius={[5,5,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
          : <p className="muted" role="status" style={{marginTop:18}}>Aún no hay meses de actividad para mostrar.</p>}
        <p className="muted" style={{fontSize:12,lineHeight:1.65,margin:"14px 0 0"}}>
          {zeroState} Los pagos parciales se incluyen en el total recibido, pero su distribución por mes solo se muestra al liquidar la factura.
        </p>
      </div>
    </>}
  </section>;
}

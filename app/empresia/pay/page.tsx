"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ArrowDownLeft, ArrowRight, Clock3, CreditCard, RefreshCw, ShieldCheck, Wallet } from "lucide-react";

type Order = {
  id: string;
  offer_id: string;
  buyer_email: string;
  kind: "one_time" | "monthly";
  status: string;
  amount_cents: number;
  paypal_capture_id: string | null;
  paypal_subscription_id: string | null;
  created_at: string;
};
type RecurringSale = {
  id: string;
  order_id: string;
  paypal_sale_id: string;
  amount_cents: number;
  paid_at: string;
};
type Offer = { id: string; title: string };
type Movement = {
  key: string;
  orderId: string;
  title: string;
  buyer: string;
  kind: "one_time" | "recurring";
  status: "confirmed" | "pending" | "other";
  amountCents: number;
  date: string;
  providerId: string | null;
};

const usd = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const day = (value: string) =>
  new Intl.DateTimeFormat("es-DO", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));

export default function EmpresiaPayPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [sales, setSales] = useState<RecurringSale[]>([]);
  const [offers, setOffers] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<"all" | "confirmed" | "pending">("all");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setBusy(true);
    setError("");
    // The database RPC enforces platform-owner permissions. A browser-side role flag
    // is never sufficient for authorizing financial reads.
    const { data: identity, error: identityError } = await supabase.auth.getUser();
    if (identityError || !identity.user) {
      setAuthorized(false);
      setBusy(false);
      return;
    }
    const { error: accessError } = await supabase.rpc("crm_billing_financial_snapshot", {
      p_tenant_id: null,
    });
    if (accessError) {
      setAuthorized(false);
      setBusy(false);
      return;
    }
    setAuthorized(true);
    // Existing RLS-protected payment ledgers are the source of truth. No balance
    // updates, external transfers or unverified payment approvals are possible here.
    const [orderResult, saleResult, offerResult] = await Promise.all([
      supabase.from("empresia_checkout_orders")
        .select("id,offer_id,buyer_email,kind,status,amount_cents,paypal_capture_id,paypal_subscription_id,created_at")
        .order("created_at", { ascending: false }).limit(100),
      supabase.from("empresia_subscription_sales")
        .select("id,order_id,paypal_sale_id,amount_cents,paid_at")
        .order("paid_at", { ascending: false }).limit(100),
      supabase.from("empresia_offers").select("id,title").limit(200),
    ]);
    if (orderResult.error || saleResult.error || offerResult.error) {
      setOrders([]);
      setSales([]);
      setOffers({});
      setError("No se pudo consultar el historial verificado de Empresia Pay. Comprueba la conexión y los permisos.");
    } else {
      setOrders((orderResult.data ?? []) as Order[]);
      setSales((saleResult.data ?? []) as RecurringSale[]);
      setOffers(Object.fromEntries(((offerResult.data ?? []) as Offer[]).map(offer => [offer.id, offer.title])));
    }
    setBusy(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const movements = useMemo<Movement[]>(() => {
    const orderMap = new Map(orders.map(order => [order.id, order]));
    const oneTime: Movement[] = orders.filter(order => order.kind === "one_time").map(order => ({
      key: "order:" + order.id,
      orderId: order.id,
      title: offers[order.offer_id] ?? "Cobro por servicio Empresia",
      buyer: order.buyer_email,
      kind: "one_time",
      status: order.status === "paid" && Boolean(order.paypal_capture_id)
        ? "confirmed"
        : ["created", "awaiting_approval"].includes(order.status) ? "pending" : "other",
      amountCents: order.amount_cents,
      date: order.created_at,
      providerId: order.paypal_capture_id,
    }));
    const monthly: Movement[] = sales.map(sale => {
      const order = orderMap.get(sale.order_id);
      return {
        key: "sale:" + sale.id,
        orderId: sale.order_id,
        title: order ? (offers[order.offer_id] ?? "Suscripción Empresia") : "Cobro recurrente Empresia",
        buyer: order?.buyer_email ?? "Cliente protegido",
        kind: "recurring",
        status: "confirmed",
        amountCents: sale.amount_cents,
        date: sale.paid_at,
        providerId: sale.paypal_sale_id,
      };
    });
    return [...oneTime, ...monthly].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  }, [orders, sales, offers]);

  const confirmed = movements.filter(movement => movement.status === "confirmed");
  const receivedCents = confirmed.reduce((total, movement) => total + movement.amountCents, 0);
  const pending = movements.filter(movement => movement.status === "pending").length;
  const visible = movements.filter(movement =>
    filter === "all" || movement.status === filter).slice(0, 30);

  return (
    <main className="content" style={{ maxWidth: 1160, margin: "0 auto", minHeight: "100vh" }}>
      <header className="topbar" style={{ alignItems: "center", gap: 16 }}>
        <div>
          <div className="eyebrow">EMPRESIA · CENTRO FINANCIERO</div>
          <h1 style={{ marginBottom: 8 }}>Empresia Pay</h1>
          <p className="muted">Cobra mediante el checkout existente, revisa pagos verificados y sigue las suscripciones desde un solo lugar.</p>
        </div>
        <div className="top-actions" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <Link href="/empresia/comercio" className="button primary">
            Crear cobro <ArrowRight size={15} aria-hidden="true" />
          </Link>
          <button type="button" className="button" disabled={busy} onClick={() => void refresh()}>
            <RefreshCw size={15} aria-hidden="true" /> Actualizar
          </button>
        </div>
      </header>

      {authorized === null && <section className="card" role="status">Verificando acceso financiero…</section>}
      {authorized === false && (
        <section className="card" role="alert">
          <h2>Acceso financiero restringido</h2>
          <p className="muted">Este centro es exclusivo del propietario autorizado de Empresia. No muestra información de otros usuarios ni permite administrar cuentas bancarias.</p>
          <Link href="/login?next=%2Fempresia%2Fpay" className="button primary">Iniciar sesión</Link>
        </section>
      )}
      {authorized === true && <>
        <div className="notice" role="note" style={{ marginBottom: 16 }}>
          <ShieldCheck size={17} aria-hidden="true" /> Los importes de esta pantalla son <strong>cobros brutos registrados</strong> en Empresia, no saldo de PayPal ni saldo bancario disponible. Las comisiones, disputas, reembolsos y liquidaciones bancarias deben conciliarse con el proveedor.
        </div>
        {error && <div className="notice" role="alert">{error}</div>}
        <div className="grid metrics" style={{ marginBottom: 18 }}>
          <article className="metric">
            <div className="metric-label"><Wallet size={16} aria-hidden="true" /> Cobros verificados en la muestra</div>
            <div className="metric-value">{usd(receivedCents)}</div>
            <div className="metric-sub">Solo capturas y ventas recurrentes confirmadas por el proveedor</div>
          </article>
          <article className="metric">
            <div className="metric-label"><ArrowDownLeft size={16} aria-hidden="true" /> Movimientos confirmados</div>
            <div className="metric-value">{confirmed.length}</div>
            <div className="metric-sub">En los últimos 100 registros de cada origen</div>
          </article>
          <article className="metric">
            <div className="metric-label"><Clock3 size={16} aria-hidden="true" /> Autorizaciones pendientes</div>
            <div className="metric-value">{pending}</div>
            <div className="metric-sub">No constituyen pagos ni saldo disponible</div>
          </article>
          <article className="metric">
            <div className="metric-label"><CreditCard size={16} aria-hidden="true" /> Cobros recurrentes verificados</div>
            <div className="metric-value">{sales.length}</div>
            <div className="metric-sub">No se contabiliza la mera activación de una suscripción</div>
          </article>
        </div>

        <section className="card" aria-label="Movimientos de Empresia Pay">
          <div className="topbar" style={{ marginBottom: 14, alignItems: "center" }}>
            <div><h2 style={{ marginBottom: 4 }}>Movimientos registrados</h2>
              <p className="muted" style={{ margin: 0 }}>Últimas órdenes y ventas recurrentes · USD</p></div>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {(["all", "confirmed", "pending"] as const).map(option => (
                <button key={option} type="button" className={filter === option ? "button primary small" : "button small"}
                  aria-pressed={filter === option} onClick={() => setFilter(option)}>
                  {option === "all" ? "Todos" : option === "confirmed" ? "Confirmados" : "Pendientes"}
                </button>
              ))}
            </div>
          </div>
          {busy ? <p className="muted" role="status">Actualizando movimientos…</p> :
            visible.length === 0 ? <p className="muted">No hay movimientos para este filtro. Puedes crear una oferta de cobro desde Comercio.</p> :
              <div style={{ display: "grid", gap: 10 }}>
                {visible.map(movement => (
                  <article key={movement.key} className="priority-item"
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                    <div style={{ minWidth: 200, flex: "1 1 245px" }}>
                      <strong>{movement.title}</strong>
                      <div className="muted" style={{ fontSize: 12, overflowWrap: "anywhere" }}>
                        {movement.buyer} · {day(movement.date)} · {movement.kind === "recurring" ? "Renovación" : "Pago único"}
                      </div>
                      <div style={{ fontSize: 12, marginTop: 4 }}>
                        {movement.status === "confirmed" ? "Confirmado por PayPal" :
                          movement.status === "pending" ? "Esperando autorización" : "No confirmado"}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <strong style={{ fontSize: 19 }}>{usd(movement.amountCents)}</strong>
                      <div style={{ fontSize: 12 }}>
                        {movement.providerId ? "Referencia: " + movement.providerId.slice(0, 18) : "Sin captura confirmada"}
                      </div>
                      <Link href={"/empresia/checkout?order=" + encodeURIComponent(movement.orderId)}
                        className="button small" style={{ marginTop: 8 }}>Ver orden</Link>
                    </div>
                  </article>
                ))}
              </div>}
        </section>

        <section className="grid two-col" style={{ marginTop: 18, gap: 15 }}>
          <article className="card">
            <h2>Recibir un pago real</h2>
            <p className="muted">Crea una oferta, publica el precio aprobado y comparte el enlace de checkout. El cliente autoriza el pago en PayPal; Empresia solo registra el cobro cuando el proveedor lo confirma.</p>
            <Link className="button primary" href="/empresia/comercio">Administrar cobros</Link>
            <Link className="button" href="/empresia/tienda" style={{ marginLeft: 8 }}>Ver tienda</Link>
          </article>
          <article className="card">
            <h2>Saldo bancario y retiros</h2>
            <p className="muted">No se muestran como habilitados: falta una integración bancaria autorizada con consultas de saldo y confirmación de liquidaciones. Ningún botón de esta aplicación puede crear dinero, acreditar una cuenta externa o ejecutar retiros.</p>
            <p className="muted" style={{ fontSize: 12 }}>Las credenciales de PayPal permanecen en funciones del servidor, no en el navegador. Solo deben utilizarse métodos de cobro autorizados.</p>
          </article>
        </section>
      </>}
    </main>
  );
}

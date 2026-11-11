"use client";
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type Snapshot = { tenantId: string; orders: number; sales: number; paid: number; opportunities: number; inventory: number; currency: string };
export default function BusinessIntelligencePage() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
      if (!url || !key) throw new Error("Supabase no está configurado");
      const db = createClient(url, key, { auth: { persistSession: true } });
      const { data: auth, error: authError } = await db.auth.getUser();
      if (authError || !auth.user) throw new Error("Inicia sesión en el CRM para consultar tus datos");
      const { data: memberships, error: membershipError } = await db.from("memberships").select("tenant_id,status").eq("user_id", auth.user.id);
      if (membershipError) throw membershipError;
      const tenantId = memberships?.find(m => m.status === "active")?.tenant_id;
      if (!tenantId) throw new Error("No tienes una membresía activa");
      // All reads run as the authenticated user, restricted by RLS and explicit tenant scope.
      const [orders, opportunities, inventory] = await Promise.all([
        db.from("orders").select("total,amount_paid,currency").eq("tenant_id", tenantId).limit(1000),
        db.from("opportunities").select("id").eq("tenant_id", tenantId).limit(1000),
        db.from("inventory_items").select("id").eq("tenant_id", tenantId).limit(1000)
      ]);
      for (const result of [orders, opportunities, inventory]) if (result.error) throw result.error;
      const rows = orders.data || [];
      const currencies = [...new Set(rows.map(r => r.currency || "DOP"))];
      if (currencies.length > 1) throw new Error("Hay varias monedas; se requiere filtrar antes de sumar ventas");
      if (!cancelled) setData({
        tenantId, orders: rows.length,
        sales: rows.reduce((n,r) => n + Number(r.total || 0),0),
        paid: rows.reduce((n,r) => n + Number(r.amount_paid || 0),0),
        opportunities: opportunities.data?.length || 0,
        inventory: inventory.data?.length || 0,
        currency: currencies[0] || "DOP"
      });
    }
    load().catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : "Error consultando datos"); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);
  const money = (value:number) => new Intl.NumberFormat("es-DO", {style:"currency",currency:data?.currency || "DOP"}).format(value);
  return <main style={{maxWidth:1100,margin:"auto",padding:32,fontFamily:"system-ui"}}>
    <h1>Inteligencia de negocios</h1><p>Indicadores de tu empresa obtenidos desde Supabase. Sin cifras de demostración.</p>
    {loading && <p role="status">Consultando datos autorizados…</p>}
    {error && <p role="alert" style={{color:"#b91c1c"}}>{error}</p>}
    {data && <><p>Empresa: {data.tenantId}</p><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:16}}>
      {([["Pedidos (máx. 1000)",data.orders],["Total de pedidos (máx. 1000)",money(data.sales)],["Cobrado en pedidos (máx. 1000)",money(data.paid)],["Oportunidades (máx. 1000)",data.opportunities],["Productos en inventario (máx. 1000)",data.inventory]] as const).map(([label,value]) => <section key={label} style={{padding:20,border:"1px solid #ddd",borderRadius:12}}><small>{label}</small><h2>{value}</h2></section>)}
    </div><p style={{marginTop:20}}>Datos operativos; no representan estados financieros auditados. Las consultas tienen límite de 1000 registros por conjunto.</p></>}
  </main>;
}

"use client";

import { useEffect, useState } from "react";
import { BarChart3, ExternalLink, RefreshCw, ShieldCheck } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/lib/supabase";
import { useActiveTenant } from "@/components/tenant-context";

type Site = { id: string; name: string; hostname: string };
type Payload = {
  status?: "connected" | "not_connected" | "disabled";
  error?: string;
  message?: string;
  sites?: Site[];
  selectedSiteId?: string;
  periodDays?: number;
  metrics?: { pageviews: number; visitors: number; visits: number; bounces: number };
  days?: Array<{ date: string; views: number }>;
};

const count = (value?: number) => typeof value === "number"
  ? new Intl.NumberFormat("es-DO").format(value) : "—";

export default function CrmUmamiAnalytics() {
  const tenant = useActiveTenant();
  const tenantId = tenant?.tenant_id ?? "";
  const [siteId, setSiteId] = useState("");
  const [version, setVersion] = useState(0);
  const [data, setData] = useState<Payload | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => setSiteId(""), [tenantId]);

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    setData(null);
    setError("");
    setBusy(true);
    if (!tenantId) {
      setBusy(false);
      return () => controller.abort();
    }
    (async () => {
      const { data: sessionResult } = await supabase.auth.getSession();
      if (!sessionResult.session?.access_token) throw new Error("Inicia sesión nuevamente.");
      const query = new URLSearchParams({ tenant_id: tenantId });
      if (siteId) query.set("site_id", siteId);
      const response = await fetch("/api/umami/overview?" + query.toString(), {
        headers: { Authorization: "Bearer " + sessionResult.session.access_token },
        cache: "no-store",
        signal: controller.signal,
      });
      const payload = await response.json() as Payload;
      if (!alive) return;
      if (!response.ok && payload.status !== "disabled")
        throw new Error(payload.error || "No se pudo consultar el servicio.");
      setData(payload);
    })().catch(cause => {
      if (alive && !controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : "Error al consultar la analítica.");
    }).finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; controller.abort(); };
  }, [tenantId, siteId, version]);

  if (!tenant || !["owner", "admin"].includes(tenant.membership_role)) return null;

  const sites = data?.sites ?? [];
  const selectedSiteId = siteId || data?.selectedSiteId || "";

  return <section aria-label="Analítica web con Umami" style={{
    border: "1px solid var(--border, #d0d7e2)", borderRadius: 16,
    padding: 20, marginTop: 24, background: "var(--panel, transparent)",
  }}>
    <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
      gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <BarChart3 size={20} />
          <h2 style={{ margin: 0 }}>Analítica web</h2>
        </div>
        <p className="muted" style={{ marginBottom: 0 }}>
          Visitas y resultados de los sitios vinculados a {tenant.tenant_name}.
        </p>
      </div>
      <button className="button" type="button" disabled={busy}
        onClick={() => setVersion(v => v + 1)}>
        <RefreshCw size={16} /> Actualizar
      </button>
    </header>

    {busy && <p role="status">Consultando datos de Umami…</p>}
    {error && <p role="alert" className="notice">{error}</p>}
    {!busy && !error && data?.status === "disabled" &&
      <p className="notice">{data.message || "El módulo todavía no está habilitado para esta empresa."}</p>}
    {!busy && !error && data?.status === "not_connected" && <div>
      <p role="status">{data.message || "Todavía no hay datos de analítica."}</p>
      <p className="muted">Para activarlo: habilita el módulo Umami para esta empresa, vincula sus sitios
        desde la administración central y configura la API de Umami en el servidor. Instala el
        código de seguimiento oficial en cada web. No mostramos datos de ejemplo como si fueran reales.</p>
      <a href="https://docs.umami.is/docs/collect-data" target="_blank" rel="noopener noreferrer">
        Instrucciones de seguimiento <ExternalLink size={14} style={{ display: "inline" }} />
      </a>
    </div>}

    {data?.status === "connected" && data.metrics && <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <label htmlFor="umami-site">Sitio web</label>
        <select id="umami-site" value={selectedSiteId}
          onChange={event => setSiteId(event.target.value)}
          style={{ padding: 10, borderRadius: 8, maxWidth: "100%" }}>
          {sites.map(site => <option key={site.id} value={site.id}>
            {site.name} · {site.hostname}
          </option>)}
        </select>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px,1fr))", gap: 12 }}>
        {[
          ["Visualizaciones", data.metrics.pageviews],
          ["Visitantes", data.metrics.visitors],
          ["Visitas", data.metrics.visits],
        ].map(([label, value]) => <div key={String(label)}
          style={{ padding: 14, border: "1px solid var(--border, #d0d7e2)", borderRadius: 12 }}>
          <div className="muted">{label}</div>
          <strong style={{ fontSize: 24 }}>{count(Number(value))}</strong>
        </div>)}
      </div>
      <h3 style={{ marginTop: 20 }}>Visualizaciones · últimos {data.periodDays ?? 30} días</h3>
      {data.days?.length ? <div style={{ width: "100%", height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.days}>
            <XAxis dataKey="date" minTickGap={24} tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} width={35} />
            <Tooltip />
            <Line type="monotone" dataKey="views" stroke="currentColor"
              strokeWidth={2} dot={false} name="Visualizaciones" />
          </LineChart>
        </ResponsiveContainer>
      </div> : <p className="muted">Sin visualizaciones registradas para este período.</p>}
      <p className="muted" style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <ShieldCheck size={15} /> Datos consultados desde el servidor y limitados al sitio autorizado.
      </p>
    </div>}
  </section>;
}

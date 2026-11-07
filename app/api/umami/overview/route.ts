import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { CRM_SUPABASE_PUBLISHABLE_KEY, CRM_SUPABASE_URL } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const json = (body: object, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type UmamiSite = {
  id: string;
  umami_website_id: string;
  site_name: string;
  hostname: string;
};

function parseCounter(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object" && "value" in value) {
    return parseCounter((value as { value?: unknown }).value);
  }
  return 0;
}

function unwrap(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const obj = value as Record<string, unknown>;
  return obj.data && typeof obj.data === "object" && !Array.isArray(obj.data)
    ? obj.data as Record<string, unknown>
    : obj;
}

export async function GET(request: NextRequest) {
  const tenantId = request.nextUrl.searchParams.get("tenant_id") ?? "";
  const siteId = request.nextUrl.searchParams.get("site_id");
  const header = request.headers.get("authorization") ?? "";
  if (!uuidPattern.test(tenantId) || (siteId && !uuidPattern.test(siteId)))
    return json({ error: "Identificador inválido." }, 400);
  if (!/^Bearer [^\s]+$/.test(header))
    return json({ error: "Se requiere una sesión autenticada." }, 401);

  const token = header.slice(7);
  // A new request-scoped client is essential: do not reuse browser sessions on the server.
  const db = createClient(CRM_SUPABASE_URL, CRM_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: header } },
  });

  const { data: userData, error: authError } = await db.auth.getUser(token);
  if (authError || !userData.user)
    return json({ error: "Sesión no válida." }, 401);

  const [memberResult, permissionsResult, modulesResult] = await Promise.all([
    db.rpc("list_my_tenants"),
    db.rpc("tenant_current_permissions", { p_tenant_id: tenantId }),
    db.rpc("tenant_effective_modules", { p_tenant_id: tenantId }),
  ]);

  if (memberResult.error || permissionsResult.error || modulesResult.error)
    return json({ error: "No se pudo verificar la autorización." }, 403);

  const member = (Array.isArray(memberResult.data) ? memberResult.data : [])
    .find((item: { tenant_id?: string; is_active?: boolean }) =>
      item.tenant_id === tenantId && item.is_active === true);
  if (!member || !["owner", "admin"].includes(member.membership_role))
    return json({ error: "No autorizado para esta empresa." }, 403);

  const permissions = permissionsResult.data as Record<string, unknown> | null;
  const modules = Array.isArray(modulesResult.data) ? modulesResult.data as
    Array<{ module_key: string; enabled: boolean }> : [];
  const settings = modules.find(item => item.module_key === "settings");
  const analytics = modules.find(item => item.module_key === "umami_analytics");

  if (!(permissions?.all === true || permissions?.settings === true)
    || settings?.enabled !== true || analytics?.enabled !== true)
    return json({ status: "disabled", message: "Analítica web no habilitada para esta empresa." }, 403);

  const { data: sites, error: siteError } = await db
    .from("marketing_umami_websites")
    .select("id,umami_website_id,site_name,hostname")
    .eq("tenant_id", tenantId)
    .order("site_name");

  if (siteError) return json({ error: "No se pudo leer la configuración de analítica." }, 503);
  const safeSites = (sites ?? []) as UmamiSite[];
  const visibleSites = safeSites.map(({ id, site_name, hostname }) =>
    ({ id, name: site_name, hostname }));

  if (!safeSites.length)
    return json({ status: "not_connected", sites: [], message: "Aún no hay sitios vinculados a esta empresa." });

  const site = safeSites.find(item => item.id === siteId) ?? (!siteId ? safeSites[0] : null);
  if (!site) return json({ error: "El sitio no pertenece a esta empresa." }, 403);

  const apiBase = process.env.UMAMI_API_BASE_URL?.replace(/\/+$/, "");
  const apiKey = process.env.UMAMI_API_KEY;
  if (!apiBase || !apiKey)
    return json({
      status: "not_connected", sites: visibleSites, selectedSiteId: site.id,
      message: "Falta configurar el servidor de Umami y su clave de API.",
    });

  let url: URL;
  try {
    url = new URL(apiBase);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash)
      throw new Error("Invalid API URL");
  } catch {
    return json({ error: "La configuración del servidor de analítica no es válida." }, 503);
  }

  const endAt = Date.now();
  const startAt = endAt - 30 * 86400000;
  const root = apiBase + "/websites/" + encodeURIComponent(site.umami_website_id);
  const params = new URLSearchParams({ startAt: String(startAt), endAt: String(endAt) });
  const headers = { Authorization: "Bearer " + apiKey, Accept: "application/json" };

  try {
    const [statsResponse, viewsResponse] = await Promise.all([
      fetch(root + "/stats?" + params, {
        headers, cache: "no-store", signal: AbortSignal.timeout(10000),
      }),
      fetch(root + "/pageviews?" + params + "&unit=day", {
        headers, cache: "no-store", signal: AbortSignal.timeout(10000),
      }),
    ]);
    if (!statsResponse.ok || !viewsResponse.ok)
      return json({ error: "Umami no respondió correctamente. Revisa el servidor y la autorización." }, 502);

    const stats = unwrap(await statsResponse.json());
    const series = unwrap(await viewsResponse.json());
    const pageviews = Array.isArray(series.pageviews) ? series.pageviews : [];
    const days = pageviews
      .filter((item: unknown) => item && typeof item === "object")
      .map((item: unknown) => {
        const value = item as Record<string, unknown>;
        return { date: String(value.x ?? "").slice(0, 10), views: parseCounter(value.y) };
      })
      .filter(item => /^\d{4}-\d\d-\d\d$/.test(item.date))
      .slice(-31);

    return json({
      status: "connected",
      sites: visibleSites,
      selectedSiteId: site.id,
      periodDays: 30,
      metrics: {
        pageviews: parseCounter(stats.pageviews),
        visitors: parseCounter(stats.visitors),
        visits: parseCounter(stats.visits),
        bounces: parseCounter(stats.bounces),
      },
      days,
    });
  } catch {
    return json({ error: "No fue posible consultar Umami en este momento." }, 502);
  }
}

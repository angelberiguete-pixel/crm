/// <reference lib="deno.ns" />
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { dolibarrBaseUrl, isUuid, listDolibarrProducts } from "./dolibarr-protocol.ts";

/**
 * Empresia ERP: authenticated, tenant-isolated, read-only Dolibarr bridge.
 * No GET from browser to Dolibarr, no dynamic URL, no credentials in responses,
 * no writes to ERP/CRM, no automated invoice or accounting activity.
 */
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const publicKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const permittedOrigins = [
  "https://portal-empresia.vercel.app",
  "https://crm-revenue-os.vercel.app",
  "https://crm-look.vercel.app",
];

function headers(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Vary": "Origin",
    ...(permittedOrigins.includes(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-client-info",
    "Access-Control-Allow-Methods": "OPTIONS,POST",
  };
}

function respond(req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: headers(req) });
}

async function authorize(req: Request, tenantId: string) {
  const authorization = req.headers.get("authorization") ?? "";
  if (!/^Bearer\s+[^\s]+$/i.test(authorization) || !supabaseUrl || !publicKey)
    return false;
  const client = createClient(supabaseUrl, publicKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: auth, error: authError } = await client.auth.getUser(
    authorization.replace(/^Bearer\s+/i, ""),
  );
  if (authError || !auth.user) return false;
  const { data: memberships, error: membershipError } = await client.rpc("list_my_tenants");
  if (membershipError || !Array.isArray(memberships)) return false;
  return memberships.some((entry) =>
    entry.tenant_id === tenantId &&
    entry.tenant_slug === "eurevector" &&
    entry.is_active === true &&
    (entry.membership_role === "owner" || entry.membership_role === "admin")
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: headers(req) });
  if (req.method !== "POST") return respond(req, { error: "method_not_allowed" }, 405);
  if (Number(req.headers.get("content-length") || 0) > 4096)
    return respond(req, { error: "request_too_large" }, 413);
  try {
    const raw = await req.text();
    if (raw.length > 4096) return respond(req, { error: "request_too_large" }, 413);
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw); }
    catch { return respond(req, { error: "invalid_json" }, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body))
      return respond(req, { error: "invalid_request" }, 400);
    const tenantId = body.tenant_id;
    if (!isUuid(tenantId)) return respond(req, { error: "invalid_tenant" }, 400);
    if (!await authorize(req, tenantId)) return respond(req, { error: "forbidden" }, 403);

    // Not even the platform owner can ask this function to call a customer tenant.
    const expectedTenant = Deno.env.get("DOLIBARR_EXPECTED_TENANT_ID") ?? "";
    const base = Deno.env.get("DOLIBARR_API_BASE_URL") ?? "";
    const key = Deno.env.get("DOLIBARR_API_KEY") ?? "";
    const enabled = Deno.env.get("DOLIBARR_READONLY_ENABLED") === "true";
    const configured = isUuid(expectedTenant) && expectedTenant === tenantId &&
      Boolean(dolibarrBaseUrl(base)) && key.length > 10;

    if (body.action === "status") return respond(req, {
      status: enabled && configured ? "ready_for_probe" : "not_configured",
      enabled: enabled && configured,
      provider: "dolibarr",
      mode: "read_only",
    });
    if (body.action !== "probe" && body.action !== "products")
      return respond(req, { error: "unsupported_action" }, 400);
    if (!enabled || !configured)
      return respond(req, { error: "provider_not_configured", mode: "read_only" }, 503);

    const page = body.action === "probe" ? 0 : (body.page ?? 0);
    const limit = body.action === "probe" ? 1 : (body.limit ?? 10);
    if (!Number.isSafeInteger(page) || !Number.isSafeInteger(limit) ||
      Number(page) < 0 || Number(page) > 100 || Number(limit) < 1 || Number(limit) > 25)
      return respond(req, { error: "invalid_pagination" }, 400);

    const products = await listDolibarrProducts(base, key, { page: Number(page), limit: Number(limit) });
    if (body.action === "probe") return respond(req, {
      status: "connected_read_only",
      provider: "dolibarr",
      checked_at: new Date().toISOString(),
      products_api_ok: true,
    });
    return respond(req, {
      status: "connected_read_only",
      provider: "dolibarr",
      page, limit,
      products,
      count: products.length,
    });
  } catch (error) {
    // Never serialize upstream error payloads, headers, usernames, or API keys.
    const code = error instanceof Error ? error.message : "";
    if (code === "provider_permission_denied")
      return respond(req, { error: "provider_permission_denied" }, 502);
    if (code === "invalid_pagination")
      return respond(req, { error: "invalid_pagination" }, 400);
    return respond(req, { error: "provider_unavailable" }, 503);
  }
});

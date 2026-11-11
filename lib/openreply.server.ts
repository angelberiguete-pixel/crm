// Imported by the server route only. Provider keys never enter a client module.
import { isIP } from "node:net";
import type { OpenReplyCampaign, OpenReplyStats } from "./openreply-contract";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^orp_[A-Za-z0-9_-]{43}$/;
const MAX_BYTES = 512 * 1024;
const HEADERS = {
  "Cache-Control": "private, no-store",
  "Vary": "Authorization",
  "X-Content-Type-Options": "nosniff",
};

type Connection = { tenantId: string; workspaceId: string; baseUrl: string; serviceKey: string };
type Dependencies = {
  connections: string | undefined;
  verifyAccess: (token: string, tenantId: string) => Promise<"allowed" | "unauthenticated" | "denied" | "unavailable">;
  fetch?: typeof fetch;
};
type RecordValue = Record<string, unknown>;
const object = (value: unknown): value is RecordValue => Boolean(value && typeof value === "object" && !Array.isArray(value));
const text = (value: unknown, max: number): value is string => typeof value === "string" && value.length > 0 && value.length <= max;
const count = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;

export function hasOpenReplyAdminMembership(memberships: unknown, tenantId: string): boolean {
  return Array.isArray(memberships) && memberships.some(row => object(row)
    && row.tenant_id === tenantId && row.is_active === true && text(row.tenant_slug, 200)
    && row.tenant_slug !== "family-power" && ["owner", "admin"].includes(String(row.membership_role)));
}

function reply(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { ...HEADERS, ...extraHeaders } });
}
function fail(code: string, status: number, extraHeaders?: Record<string, string>) {
  // Never include upstream error text, configuration, request headers or tokens.
  return reply({ error: code }, status, extraHeaders);
}

export function parseOpenReplyConnections(raw: string | undefined): Connection[] {
  if (!raw?.trim()) return [];
  if (raw.length > 65536) throw new Error("invalid_configuration");
  const input: unknown = JSON.parse(raw);
  if (!Array.isArray(input) || input.length > 50) throw new Error("invalid_configuration");
  const tenants = new Set<string>(), workspaces = new Set<string>(), keys = new Set<string>();
  return input.map((row: unknown) => {
    if (!object(row) || !text(row.tenantId, 36) || !UUID.test(row.tenantId)
      || !text(row.workspaceId, 100) || !/^[A-Za-z0-9_-]+$/.test(row.workspaceId)
      || !text(row.baseUrl, 2048) || !text(row.serviceKey, 47) || !KEY.test(row.serviceKey)) {
      throw new Error("invalid_configuration");
    }
    const url = new URL(row.baseUrl);
    // Only operator-configured public HTTPS origins. Browser parameters cannot
    // supply a destination. Reject IP literals, credentials and local names.
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || url.username || url.password || url.port
      || url.search || url.hash || url.pathname !== "/" || isIP(host)
      || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)
      || /(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid)$/.test(host)) {
      throw new Error("invalid_configuration");
    }
    const tenantId = row.tenantId.toLowerCase();
    const workspace = url.origin + "/" + row.workspaceId;
    // Never map a workspace or key to two CRM companies.
    if (tenants.has(tenantId) || workspaces.has(workspace) || keys.has(row.serviceKey)) {
      throw new Error("invalid_configuration");
    }
    tenants.add(tenantId); workspaces.add(workspace); keys.add(row.serviceKey);
    return { tenantId, workspaceId: row.workspaceId, baseUrl: url.origin, serviceKey: row.serviceKey };
  });
}

export function projectOpenReplyCampaigns(input: unknown): OpenReplyCampaign[] {
  if (!Array.isArray(input) || input.length > 100) throw new Error("invalid_response");
  const ids = new Set<string>();
  return input.map((row: unknown) => {
    if (!object(row) || !text(row.id, 100) || !text(row.name, 300)
      || typeof row.isActive !== "boolean" || !Array.isArray(row.keywords)
      || row.keywords.length > 100 || !row.keywords.every(k => text(k, 200)) || ids.has(row.id)) {
      throw new Error("invalid_response");
    }
    ids.add(row.id);
    // Explicit projection excludes account IDs, provider tokens and future fields.
    return { id: row.id, name: row.name, isActive: row.isActive, keywords: row.keywords as string[] };
  });
}

export function projectOpenReplyStats(input: unknown, campaignId: string): OpenReplyStats {
  if (!object(input) || input.campaignId !== campaignId || !count(input.rawClicks)
    || !Array.isArray(input.statuses) || input.statuses.length > 20) throw new Error("invalid_response");
  const result: OpenReplyStats = { campaignId, sent: 0, failed: 0, pending: 0, skipped: 0, rawClicks: input.rawClicks };
  const seen = new Set<string>();
  for (const row of input.statuses) {
    if (!object(row) || !text(row.status, 60) || !object(row._count) || !count(row._count._all)
      || seen.has(row.status)) throw new Error("invalid_response");
    seen.add(row.status);
    if (row.status === "SENT") result.sent += row._count._all;
    else if (row.status === "FAILED") result.failed += row._count._all;
    else if (row.status === "PENDING") result.pending += row._count._all;
    else if (["SKIPPED_DEDUP", "SKIPPED_RATE_LIMIT", "SKIPPED_PLAN_LIMIT", "SKIPPED_NO_MATCH"].includes(row.status)) result.skipped += row._count._all;
    else throw new Error("invalid_response");
  }
  if (![result.sent, result.failed, result.pending, result.skipped].every(count)) throw new Error("invalid_response");
  return result;
}

async function boundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  if (Number(response.headers.get("content-length")) > MAX_BYTES || !response.body) throw new Error("invalid_response");
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) throw new Error("invalid_response");
      chunks.push(value);
    }
    signal.throwIfAborted();
    const data = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(data));
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export async function handleOpenReplyRequest(request: Request, dependencies: Dependencies): Promise<Response> {
  if (request.method !== "GET") return fail("read_only", 405, { Allow: "GET" });
  const params = new URL(request.url).searchParams;
  const tenantId = params.get("tenantId")?.toLowerCase() ?? "";
  const campaignId = params.get("campaignId");
  if (!UUID.test(tenantId) || [...params.keys()].some(k => !["tenantId", "campaignId"].includes(k))
    || params.getAll("tenantId").length !== 1 || params.getAll("campaignId").length > 1
    || (campaignId !== null && !text(campaignId, 100))) return fail("invalid_request", 400);
  const authorization = request.headers.get("authorization") ?? "";
  if (authorization.length > 4096 || !/^Bearer [A-Za-z0-9._~+/=-]+$/.test(authorization)) return fail("authentication_required", 401);
  let access: Awaited<ReturnType<Dependencies["verifyAccess"]>>;
  try { access = await dependencies.verifyAccess(authorization.slice(7), tenantId); }
  catch { return fail("authorization_unavailable", 503); }
  if (access !== "allowed") return fail(access === "unauthenticated" ? "authentication_required" : access === "denied" ? "tenant_admin_required" : "authorization_unavailable", access === "unauthenticated" ? 401 : access === "denied" ? 403 : 503);
  let connection: Connection | undefined;
  try { connection = parseOpenReplyConnections(dependencies.connections).find(c => c.tenantId === tenantId); }
  catch { return fail("configuration_invalid", 503); }
  if (!connection) return reply({ tenantId, state: "not_configured", dashboardUrl: null, checkedAt: new Date().toISOString(), campaigns: [] });
  const url = new URL("/api/v1/campaigns", connection.baseUrl);
  if (campaignId !== null) { url.searchParams.set("id", campaignId); url.searchParams.set("stats", "1"); }
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(8000)]);
  try {
    const response = await (dependencies.fetch ?? fetch)(url, {
      method: "GET", headers: { Authorization: "Bearer " + connection.serviceKey, Accept: "application/json" },
      cache: "no-store", redirect: "error", signal,
    });
    if (!response.ok) await response.body?.cancel().catch(() => undefined);
    if (response.status === 429) {
      const delay = Number(response.headers.get("retry-after"));
      return fail("provider_rate_limited", 429, { "Retry-After": String(Number.isFinite(delay) && delay > 0 ? Math.min(Math.ceil(delay), 3600) : 60) });
    }
    if ([401, 403].includes(response.status)) return fail("provider_key_rejected", 502);
    if (response.status === 404 && campaignId !== null) return fail("campaign_not_found", 404);
    if (!response.ok) return fail("provider_unavailable", 502);
    const payload = await boundedJson(response, signal);
    if (!object(payload) || !("data" in payload)) return fail("provider_response_invalid", 502);
    const common = { tenantId, state: "connected_readonly", dashboardUrl: connection.baseUrl + "/automations", checkedAt: new Date().toISOString() };
    return campaignId !== null
      ? reply({ ...common, stats: projectOpenReplyStats(payload.data, campaignId) })
      : reply({ ...common, campaigns: projectOpenReplyCampaigns(payload.data) });
  } catch {
    return fail(signal.aborted ? "provider_timeout" : "provider_response_invalid", signal.aborted ? 504 : 502);
  }
}

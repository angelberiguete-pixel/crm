import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { handleOpenReplyRequest, hasOpenReplyAdminMembership, parseOpenReplyConnections, projectOpenReplyCampaigns, projectOpenReplyStats } from "../lib/openreply.server.ts";
import { matchKeywords } from "../lib/openreply/keyword-matcher.ts";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const KEY = "orp_" + "k".repeat(43), OTHER_KEY = "orp_" + "b".repeat(43);
const connection = { tenantId: A, workspaceId: "workspace_a", baseUrl: "https://openreply.example.com", serviceKey: KEY };
const configs = JSON.stringify([connection, { ...connection, tenantId: B, workspaceId: "workspace_b", serviceKey: OTHER_KEY }]);
const request = (tenant = A, extra = "", token = "user-a", method = "GET") => new Request("https://crm.example.com/api/integrations/openreply?tenantId=" + tenant + extra, { method, headers: token ? { Authorization: "Bearer " + token } : {} });
const api = (data, status = 200) => Response.json({ data }, { status });
const authorize = async (token, tenant) => token === "user-a" && tenant === A ? "allowed" : token === "user-b" && tenant === B ? "allowed" : "denied";
const run = (req, fetch, connections = configs, verifyAccess = authorize) => handleOpenReplyRequest(req, { connections, verifyAccess, fetch });
const campaign = { id: "campaign-a", name: "Catálogo", isActive: true, keywords: ["CATÁLOGO", "precio"] };

test("production membership policy rejects sellers, inactive contexts, missing slugs and Family Power", () => {
  const member = { tenant_id: A, tenant_slug: "empresa-uno", membership_role: "owner", is_active: true };
  assert.equal(hasOpenReplyAdminMembership([member], A), true);
  assert.equal(hasOpenReplyAdminMembership([{ ...member, membership_role: "admin" }], A), true);
  assert.equal(hasOpenReplyAdminMembership([member], B), false);
  for (const memberships of [null, {}, [], [{ ...member, is_active: false }], [{ ...member, membership_role: "seller" }], [{ ...member, tenant_slug: "family-power" }], [{ ...member, tenant_slug: null }]]) {
    assert.equal(hasOpenReplyAdminMembership(memberships, A), false);
  }
});

test("tenant admin authorization runs before provider lookup and denies cross-company requests", async () => {
  let calls = 0;
  const provider = async () => { calls++; return api([campaign]); };
  assert.equal((await run(request(B), provider)).status, 403);
  assert.equal((await run(request(A, "", "seller"), provider)).status, 403);
  assert.equal((await run(request(A, "", ""), provider)).status, 401);
  assert.equal((await run(request(A), provider, "broken-json", async () => "unauthenticated")).status, 401);
  assert.equal(calls, 0);
});

test("native OpenReply list uses only the configured company's key and a fixed GET path", async () => {
  const calls = [];
  const response = await run(request(B, "", "user-b"), async (url, options) => {
    calls.push({ url: String(url), ...options });
    return api([{ ...campaign, providerToken: "should-never-leak", instagramAccountId: "private-id" }]);
  });
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://openreply.example.com/api/v1/campaigns");
  assert.equal(calls[0].method, "GET");
  assert.equal(calls[0].headers.Authorization, "Bearer " + OTHER_KEY);
  assert.equal(calls[0].redirect, "error");
  assert.equal(calls[0].cache, "no-store");
  assert.deepEqual((await response.clone().json()).campaigns, [campaign]);
  const body = await response.text();
  for (const secret of [KEY, OTHER_KEY, "should-never-leak", "private-id", "workspace_b"]) assert.ok(!body.includes(secret));
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("vary"), "Authorization");
});

test("unconfigured connection returns an explicit non-operational state with zero network calls", async () => {
  let calls = 0;
  const missing = await handleOpenReplyRequest(request(), { connections: undefined, verifyAccess: authorize, fetch: async () => { calls++; throw Error(); } });
  const state = await missing.json();
  assert.equal(state.state, "not_configured");
  assert.equal(state.dashboardUrl, null);
  assert.equal(calls, 0);
});

test("rejects duplicate tenants, workspace reuse, key reuse and unsafe provider destinations", () => {
  for (const next of [connection, { ...connection, tenantId: B }, { ...connection, tenantId: B, workspaceId: "different" }]) {
    assert.throws(() => parseOpenReplyConnections(JSON.stringify([connection, next])));
  }
  for (const baseUrl of ["http://openreply.example.com", "https://127.0.0.1", "https://[::1]", "https://localhost", "https://private.internal", "https://user:pass@openreply.example.com", "https://openreply.example.com:8443", "https://openreply.example.com/path", "https://openreply.example.com?token=secret"]) {
    assert.throws(() => parseOpenReplyConnections(JSON.stringify([{ ...connection, baseUrl }])), baseUrl);
  }
  assert.deepEqual(parseOpenReplyConnections(""), []);
  assert.equal(parseOpenReplyConnections(configs).length, 2);
});

test("browser-supplied provider URLs, duplicate tenant parameters and write methods cannot trigger network calls", async () => {
  let calls = 0;
  const provider = async () => { calls++; return api([]); };
  assert.equal((await run(request(A, "&baseUrl=https://evil.example"), provider)).status, 400);
  assert.equal((await run(request(A, "&tenantId=" + B), provider)).status, 400);
  assert.equal((await run(request("not-uuid"), provider)).status, 400);
  assert.equal((await run(request(A, "", "user-a", "POST"), provider)).status, 405);
  assert.equal(calls, 0);
});

test("stats follow native status counts and keep raw link requests separate from sales", async () => {
  const id = "campaign?&id=other";
  const response = await run(request(A, "&campaignId=" + encodeURIComponent(id)), async (url, options) => {
    assert.equal(url.searchParams.get("id"), id);
    assert.equal(url.searchParams.get("stats"), "1");
    assert.equal(url.origin, "https://openreply.example.com");
    assert.equal(options.method, "GET");
    return api({ campaignId: id, rawClicks: 19, statuses: [
      { status: "SENT", _count: { _all: 10 } }, { status: "FAILED", _count: { _all: 2 } },
      { status: "PENDING", _count: { _all: 3 } }, { status: "SKIPPED_DEDUP", _count: { _all: 4 } },
    ] });
  });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).stats, { campaignId: id, sent: 10, failed: 2, pending: 3, skipped: 4, rawClicks: 19 });
  assert.throws(() => projectOpenReplyStats({ campaignId: B, rawClicks: 0, statuses: [] }, A));
  assert.throws(() => projectOpenReplyStats({ campaignId: A, rawClicks: -1, statuses: [] }, A));
  assert.throws(() => projectOpenReplyStats({ campaignId: A, rawClicks: 0, statuses: [{ status: "NEW_UNKNOWN_STATUS", _count: { _all: 1 } }] }, A));
});

test("provider key rejection, expiry, rate limiting and failures do not leak provider text", async () => {
  for (const [status, expected] of [[401, 502], [403, 502], [500, 502], [302, 502], [429, 429]]) {
    const response = await run(request(), async () => new Response("sensitive: " + KEY, { status, headers: { "Retry-After": "999999" } }));
    assert.equal(response.status, expected);
    const body = await response.text();
    assert.ok(!body.includes(KEY));
    if (status === 429) assert.equal(response.headers.get("retry-after"), "3600");
  }
  assert.equal((await run(request(A, "&campaignId=missing"), async () => new Response("", { status: 404 }))).status, 404);
});

test("malformed payloads, oversized streams, duplicate campaigns and negative metrics fail closed", async () => {
  for (const payload of [{}, { data: [{ ...campaign, isActive: "true" }] }, { data: [campaign, campaign] }, { data: {} }]) {
    assert.equal((await run(request(), async () => Response.json(payload))).status, 502);
  }
  assert.equal((await run(request(), async () => new Response("x".repeat(512 * 1024 + 1)))).status, 502);
  assert.throws(() => projectOpenReplyCampaigns(Array(101).fill(campaign)));
  assert.equal((await run(request(), async () => { throw Error("private-network-details " + KEY); })).status, 502);
});

test("Spanish accents, punctuation and whole-word matching use the vendored OpenReply engine", () => {
  assert.deepEqual(matchKeywords("Quiero COTIZACION 🙌", ["cotización"]), { matched: true, matchedKeyword: "cotización" });
  assert.equal(matchKeywords("¡Catálogo, por favor!", ["catalogo"]).matched, true);
  assert.equal(matchKeywords("precios", ["precio"]).matched, false);
  assert.equal(matchKeywords("precios", ["precio"], false).matched, true);
  assert.equal(matchKeywords("quiero cotizacio\u0301n", ["COTIZACIÓN"]).matched, true);
  assert.equal(matchKeywords("🙂", ["precio"]).matched, false);
});

test("integration stays behind the tenant gate and Family Power exits before panel rendering", () => {
  const route = readFileSync(new URL("../app/api/integrations/openreply/route.ts", import.meta.url), "utf8");
  const center = readFileSync(new URL("../components/crm-integration-center.tsx", import.meta.url), "utf8");
  assert.match(route, /auth\.getUser\(token\)/);
  assert.match(route, /list_my_tenants/);
  assert.match(route, /tenant_integration_health/);
  assert.match(route, /hasOpenReplyAdminMembership\(membership.data, tenantId\)/);
  assert.ok(center.indexOf('if(tenant.tenant_slug==="family-power")return') < center.indexOf("<OpenReplyAutomationPanel"));
  assert.match(center, /OpenReplyAutomationPanel key=\{id\} tenantId=\{id!\}/);
});

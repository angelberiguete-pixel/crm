import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deriveMetaHubSnapshot } from "../lib/meta-hub-status.ts";

const tenantId = "00000000-0000-4000-8000-000000000001";
const foreignTenant = "00000000-0000-4000-8000-000000000002";
const health = {
  tenant_id: tenantId, whatsapp_verified_route: true,
  channels: [
    { id: "wa-id", provider: "whatsapp", record_status: "connected", verified: true },
    { id: "ig-id", provider: "instagram", record_status: "connected", verified: false },
  ],
};
const bridge = {
  tenant_id: tenantId,
  routes: [{ id: "route-id", channel_id: "ig-id", is_enabled: true, verified_at: "2026-11-09T00:00:00Z" }],
  received_events: 4, draft_quotes: 1, last_received_at: "2026-11-09T00:10:00Z",
};

test("Meta Hub derives channel readiness only from server-verified, active routes", () => {
  const got = deriveMetaHubSnapshot(tenantId, health, bridge);
  assert.equal(got.whatsapp, "verified_route");
  assert.equal(got.instagram, "verified_route");
  assert.equal(got.messenger, "not_implemented");
  assert.equal(got.leadAds, "not_implemented");
  assert.equal(got.receivedEvents, 4);
  assert.equal(got.draftQuotes, 1);
});

test("a different tenant, wrong channel, or disconnected channel cannot appear verified", () => {
  const other = deriveMetaHubSnapshot(tenantId, health, { ...bridge, tenant_id: foreignTenant });
  assert.equal(other.instagram, "unknown");
  assert.equal(other.receivedEvents, null);
  const mismatch = deriveMetaHubSnapshot(tenantId, health, { ...bridge, routes: [{ ...bridge.routes[0], channel_id: "wa-id" }] });
  assert.equal(mismatch.instagram, "pending");
  const off = deriveMetaHubSnapshot(tenantId, { ...health, channels: health.channels.map(c => ({ ...c, record_status: "disconnected" })) }, bridge);
  assert.equal(off.instagram, "pending");
  assert.equal(off.whatsapp, "pending");
  const unknownHealth = deriveMetaHubSnapshot(tenantId, { ...health, tenant_id: foreignTenant }, bridge);
  assert.equal(unknownHealth.whatsapp, "unknown");
});

test("unverified routes and an unreadable OpenReply RPC fail closed", () => {
  assert.equal(deriveMetaHubSnapshot(tenantId, health, { ...bridge, routes: [{ ...bridge.routes[0], is_enabled: false }] }).instagram, "pending");
  assert.equal(deriveMetaHubSnapshot(tenantId, health, { ...bridge, routes: [{ ...bridge.routes[0], verified_at: null }] }).instagram, "pending");
  assert.equal(deriveMetaHubSnapshot(tenantId, health, null).instagram, "unknown");
  assert.equal(deriveMetaHubSnapshot(tenantId, health, undefined).instagram, "unknown");
  assert.equal(deriveMetaHubSnapshot(tenantId, health, { ...bridge, draft_quotes: -1, received_events: Number.POSITIVE_INFINITY }).receivedEvents, null);
});

test("CRM Meta Hub is read-only, scoped to tenant and does not affect Family Power", () => {
  const center = readFileSync(new URL("../components/crm-integration-center.tsx", import.meta.url), "utf8");
  const panel = readFileSync(new URL("../components/meta-hub-panel.tsx", import.meta.url), "utf8");
  assert.match(center, /if\(tenant\.tenant_slug==="family-power"\)return/);
  assert.match(center, /<MetaHubPanel tenantId=\{id\}/);
  assert.match(panel, /openreply_bridge_status/);
  assert.match(panel, /data\.tenant_id !== tenantId/);
  assert.doesNotMatch(panel, /service_role|access_token|api_secret|sendMessage\(|\.insert\(|\.update\(/);
  assert.match(panel, /Un registro no confirma que Meta haya entregado un mensaje/);
});

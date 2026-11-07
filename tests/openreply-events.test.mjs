import { test } from "node:test";
import assert from "node:assert/strict";
import { handleOpenReplyWebhook, parseOpenReplyEvent, parseOpenReplyWebhookKeys, signOpenReplyEvent } from "../lib/openreply-events.ts";

const NOW = 1793849400;
const key = { keyId: "qa_key_a", secret: "s".repeat(43), workspaceId: "workspace_a", instagramAccountId: "178400000000001" };
const event = { version: 1, eventId: "event_001", type: "instagram.message_received", workspaceId: key.workspaceId, instagramAccountId: key.instagramAccountId, campaignId: "campaign_a", occurredAt: new Date(NOW * 1000).toISOString(), data: { externalId: "mid.123", personId: "555000000000001", text: "COTIZAR" } };
async function request(payload = event, { signingKey = key, time = NOW, headerKey = key.keyId, signature, raw } = {}) {
  const body = raw ?? JSON.stringify(payload);
  return new Request("https://crm.example.com/events", { method: "POST", body, headers: { "x-openreply-key-id": headerKey, "x-openreply-signature": signature ?? await signOpenReplyEvent(body, signingKey, time) } });
}
const run = (req, ingest = async () => "stored", keys = JSON.stringify([key])) => handleOpenReplyWebhook(req, { keys, ingest, now: NOW });

test("signed event reaches only the account-bound ingest with a SHA-256 payload digest", async () => {
  const seen = [];
  const response = await run(await request(), async (parsed, hash) => { seen.push({ parsed, hash }); return "stored"; });
  assert.equal(response.status, 200);
  assert.deepEqual(seen[0].parsed, event);
  assert.match(seen[0].hash, /^[a-f0-9]{64}$/);
  assert.equal(response.headers.get("cache-control"), "no-store");
});
test("tampering, wrong keys, expired signatures and unknown key IDs never reach ingest", async () => {
  let calls = 0;
  const ingest = async () => { calls++; return "stored"; };
  const originalSignature = await signOpenReplyEvent(JSON.stringify(event), key, NOW);
  for (const req of [
    await request({ ...event, data: { ...event.data, text: "changed" } }, { signature: originalSignature }),
    await request(event, { time: NOW - 301 }),
    await request(event, { time: NOW + 301 }),
    await request(event, { headerKey: "missing" }),
    await request(event, { signingKey: { ...key, secret: "b".repeat(43) } }),
  ]) assert.equal((await run(req, ingest)).status, 401);
  assert.equal(calls, 0);
});
test("a valid signature cannot nominate a different workspace, account, tenant, product or price", async () => {
  let calls = 0;
  const ingest = async () => { calls++; return "stored"; };
  for (const payload of [{ ...event, workspaceId: "workspace_b" }, { ...event, instagramAccountId: "178400000000002" }]) assert.equal((await run(await request(payload), ingest)).status, 403);
  for (const payload of [{ ...event, tenantId: "another-business" }, { ...event, data: { ...event.data, unitPrice: 1 } }, { ...event, productId: "foreign-product" }]) assert.equal((await run(await request(payload), ingest)).status, 400);
  assert.equal(calls, 0);
});
test("unsupported events and invalid text/date fields fail validation", () => {
  for (const invalid of [{ ...event, version: 2 }, { ...event, type: "send_message" }, { ...event, data: { ...event.data, text: "" } }, { ...event, occurredAt: "yesterday" }, { ...event, data: { ...event.data, personId: "arbitrary-id" } }]) assert.equal(parseOpenReplyEvent(invalid), null);
});
test("idempotency and account rejection are explicit; database failures ask the exporter to retry", async () => {
  for (const [result, status] of [["stored", 200], ["duplicate", 200], ["unverified_route", 403], ["event_conflict", 409], ["invalid_event", 400]]) assert.equal((await run(await request(), async () => result)).status, status);
  const failure = await run(await request(), async () => { throw Error("sensitive database information"); });
  assert.equal(failure.status, 503);
  assert.equal((await failure.text()).includes("sensitive"), false);
});
test("malformed and oversized requests are bounded without processing events", async () => {
  assert.equal((await run(await request(event, { raw: "{" }))).status, 400);
  assert.equal((await run(await request(event, { raw: "x".repeat(65537) }))).status, 413);
});
test("disabled configuration remains receive-only and does not invoke a database", async () => {
  let calls = 0;
  const dependencies = { keys: undefined, ingest: async () => { calls++; return "stored"; }, now: NOW };
  const health = await handleOpenReplyWebhook(new Request("https://crm.example.com/events"), dependencies);
  assert.deepEqual(await health.json(), { service: "openreply-crm-events", configured: false, mode: "receive-only" });
  assert.equal((await handleOpenReplyWebhook(await request(), dependencies)).status, 503);
  assert.equal(calls, 0);
});
test("configuration prevents shared secrets and cross-workspace account reuse", () => {
  assert.throws(() => parseOpenReplyWebhookKeys(JSON.stringify([key, { ...key, keyId: "other" }])));
  assert.throws(() => parseOpenReplyWebhookKeys(JSON.stringify([key, { ...key, keyId: "other", secret: "x".repeat(43), workspaceId: "foreign" }])));
  assert.equal(parseOpenReplyWebhookKeys(JSON.stringify([key])).length, 1);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { parseMetaWebhookEvents, verifyMetaWebhookSignature } from "../lib/meta-webhook.ts";

const secret = "non-production-secret-for-contract-tests";
const sign = body => "sha256=" + createHmac("sha256", secret).update(body).digest("hex");

test("accepts only a valid HMAC over the exact raw callback body", async () => {
  const body = JSON.stringify({ object: "page", entry: [] });
  assert.equal(await verifyMetaWebhookSignature(body, sign(body), secret), true);
  for (const signature of [null, "", "sha256=123", "sha1=" + "a".repeat(40),
    "sha256=" + "0".repeat(64), sign(body).toUpperCase()]) {
    assert.equal(await verifyMetaWebhookSignature(body, signature, secret), false);
  }
  assert.equal(await verifyMetaWebhookSignature(body + " ", sign(body), secret), false);
  assert.equal(await verifyMetaWebhookSignature(body, sign(body), ""), false);
  assert.equal(await verifyMetaWebhookSignature("", sign(""), secret), false);
  assert.equal(await verifyMetaWebhookSignature("x".repeat(1024 * 1024 + 1), sign("x"), secret), false);
});

test("normalizes incoming WhatsApp messages, echoes and delivery statuses separately", () => {
  const sample = { object: "whatsapp_business_account", entry: [{
    id: "waba-1", changes: [{ field: "messages", value: {
      metadata: { phone_number_id: "phone-1" },
      messages: [{ id: "wamid.1", from: "18091234567", timestamp: "1790000000", type: "text", text: { body: "Quiero una cita" } },
        { id: "wamid.1", from: "18091234567", timestamp: "1790000000", type: "text", text: { body: "Quiero una cita" } }],
      smb_message_echoes: [{ id: "wamid.2", to: "18097654321", timestamp: "1790000001", type: "text", text: { body: "Hola" } }],
      statuses: [{ id: "wamid.2", recipient_id: "18097654321", status: "delivered", timestamp: "1790000002" }]
    } }] }] };
  const got = parseMetaWebhookEvents(JSON.stringify(sample));
  assert.equal(got.length, 3);
  assert.deepEqual(got.map(x => x.kind), ["message", "message_echo", "delivery_status"]);
  assert.equal(got[0].accountId, "phone-1");
  assert.equal(got[0].text, "Quiero una cita");
  assert.equal(new Set(got.map(x => x.idempotencyKey)).size, 3);
});

test("parses Instagram and Messenger replies without auto-triggering outgoing echoes", () => {
  const instagram = { object: "instagram", entry: [{ id: "ig-business", messaging: [
    { sender: { id: "lead-id" }, timestamp: 1790000000000, message: { mid: "ig.1", text: "Servicios?" } },
    { sender: { id: "business-id" }, message: { mid: "ig.2", is_echo: true, text: "Respondimos" } }
  ] }] };
  const result = parseMetaWebhookEvents(JSON.stringify(instagram));
  assert.deepEqual(result.map(x => x.kind), ["message", "message_echo"]);
  assert.equal(result[0].provider, "instagram");
  assert.equal(result[0].accountId, "ig-business");
  const messenger = { object: "page", entry: [{ id: "fb-page", messaging: [
    { sender: { id: "lead-2" }, message: { mid: "fb.1", text: "Hola" } }
  ] }] };
  assert.equal(parseMetaWebhookEvents(JSON.stringify(messenger))[0].provider, "messenger");
});

test("returns only Lead Ads identifiers; lead PII requires authorized Graph API retrieval", () => {
  const body = { object: "page", entry: [{ id: "fb-page", changes: [
    { field: "leadgen", value: { leadgen_id: "lead.1", form_id: "form.1", ad_id: "ad.1", created_time: 1790000000 } },
    { field: "feed", value: { message: "irrelevant" } }
  ] }] };
  const [event] = parseMetaWebhookEvents(JSON.stringify(body));
  assert.equal(event.provider, "facebook_lead_ads");
  assert.equal(event.kind, "leadgen");
  assert.equal(event.accountId, "fb-page");
  assert.equal(event.externalId, "lead.1");
  assert.equal(event.details.formId, "form.1");
  assert.equal(event.text, null);
  assert.equal(event.participantId, null);
});

test("rejects invalid/oversized callbacks and skips unsupported events without tenant inference", () => {
  assert.throws(() => parseMetaWebhookEvents("{"), /json_invalid/);
  assert.throws(() => parseMetaWebhookEvents("x".repeat(1024 * 1024 + 1)), /size_invalid/);
  assert.deepEqual(parseMetaWebhookEvents(JSON.stringify({ object: "unknown", entry: [] })), []);
  assert.deepEqual(parseMetaWebhookEvents(JSON.stringify({ object: "page", entry: [{ id: "some-page", messaging: [{ message: { text: "no mid" } }] }] })), []);
});

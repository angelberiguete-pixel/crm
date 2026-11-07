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


test("normalizes Instagram post and Live comments without interpreting a comment as a DM opt-in", () => {
  const body = {object:"instagram",entry:[{id:"ig-professional-123",changes:[
    {field:"comments",value:{id:"comment-1",text:"PRECIO",from:{id:"user-1",username:"public_user"},media:{id:"reel-1"}}},
    {field:"comments",value:{id:"comment-1",text:"PRECIO",from:{id:"user-1"},media:{id:"reel-1"}}},
    {field:"live_comments",value:{id:"live-1",text:"Hola",from:{id:"user-2"},media:{id:"live-media"}}},
    {field:"comments",value:{id:"comment-own",text:"Respuesta",from:{id:"ig-professional-123"}}},
    {field:"comments",value:{text:"Sin id",from:{id:"user-3"}}}
  ]}]};
  const events=parseMetaWebhookEvents(JSON.stringify(body));
  assert.equal(events.length,2);
  assert.deepEqual(events.map(x=>x.kind),["comment","comment"]);
  assert.deepEqual(events.map(x=>x.details.surface),["post","live"]);
  assert.equal(events[0].externalId,"comment-1");
  assert.equal(events[0].participantId,"user-1");
  assert.equal(events[0].details.mediaId,"reel-1");
  assert.equal(events[0].text,"PRECIO");
  assert.equal(events[0].details.optedIn,undefined);
  assert.equal(new Set(events.map(x=>x.idempotencyKey)).size,2);
});

test("only Facebook Page comment additions are public interactions, never arbitrary feed updates", () => {
  const body={object:"page",entry:[{id:"page-123",changes:[
    {field:"feed",value:{item:"comment",verb:"add",comment_id:"c.1",post_id:"p.1",message:"INFO",from:{id:"visitor-5"},created_time:1790000000}},
    {field:"feed",value:{item:"comment",verb:"edited",comment_id:"c.1",post_id:"p.1",message:"modified"}},
    {field:"feed",value:{item:"post",verb:"add",post_id:"p.2",message:"own post"}},
    {field:"feed",value:{item:"comment",verb:"add",comment_id:"c.own",from:{id:"page-123"}}}
  ]}]};
  const events=parseMetaWebhookEvents(JSON.stringify(body));
  assert.equal(events.length,1);
  assert.equal(events[0].provider,"messenger");
  assert.equal(events[0].kind,"comment");
  assert.equal(events[0].details.mediaId,"p.1");
  assert.equal(events[0].participantId,"visitor-5");
  assert.equal(events[0].details.surface,"page_post");
});

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/client";
import { collectNativeEvents, dispatchOne, makeEvent, parseBindings, retrySeconds, validateDestination } from "./bridge";
import { handleOpenReplyWebhook } from "./contract";

const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (process.env.OPENREPLY_DISPOSABLE_TESTS !== "1" || !["127.0.0.1", "localhost", "[::1]"].includes(database.hostname)
  || !database.pathname.endsWith("_qa")) throw Error("These tests require an explicitly disposable, loopback *_qa database.");

after(async () => { await prisma.$disconnect(); });

test("durable source capture, attribution, retries, duplicate acknowledgment and cross-account isolation", async () => {
  const suffix = randomUUID().replaceAll("-", "");
  const owner = await prisma.user.create({ data: { email: `qa-${suffix}@example.invalid` } });
  const workspace = await prisma.workspace.create({ data: { name: "QA bridge", ownerId: owner.id } });
  const foreign = await prisma.workspace.create({ data: { name: "QA foreign", ownerId: owner.id } });
  const account = await prisma.instagramAccount.create({ data: { workspaceId: workspace.id, instagramId: "178400000000001", username: "qa_owned", accessToken: "dummy-never-used", webhookSubscribed: true } });
  const foreignAccount = await prisma.instagramAccount.create({ data: { workspaceId: foreign.id, instagramId: "178400000000002", username: "qa_foreign", accessToken: "dummy-never-used" } });
  const campaign = await prisma.automation.create({ data: { workspaceId: workspace.id, instagramAccountId: account.id, name: "QA catalog", keywords: ["COTIZAR"], dmMessage: "QA only" } });
  const since = new Date(Date.now() - 60000);
  const keys = [{ keyId: "qa_account_a", secret: "s".repeat(43), workspaceId: workspace.id, instagramAccountId: account.instagramId, since: since.toISOString() }];
  const bindings = parseBindings(JSON.stringify(keys));
  try {
    await prisma.dmLog.create({ data: { workspaceId: workspace.id, automationId: campaign.id, instagramAccountId: account.id, commenterId: "555000000000001", commentId: "comment.1", commentText: "CATALOGO", status: "SENT", dmSentAt: new Date(Date.now() - 1000) } });
    await prisma.webhookEvent.create({ data: { workspaceId: foreign.id, object: "instagram", status: "PROCESSED", processedAt: new Date(), payload: {
      object: "instagram", entry: [
        { id: account.instagramId, changes: [{ field: "comments", value: { id: "comment.1", text: "CATALOGO", from: { id: "555000000000001", username: "qa_person" }, media: { id: "media.1" } } }],
          messaging: [{ sender: { id: "555000000000001" }, recipient: { id: account.instagramId }, message: { mid: "mid.1", text: "COTIZAR" } }] },
        { id: foreignAccount.instagramId, messaging: [{ sender: { id: "555000000000002" }, recipient: { id: foreignAccount.instagramId }, message: { mid: "foreign.mid", text: "FOREIGN" } }] },
      ],
    } } });
    assert.equal(await collectNativeEvents(bindings), 3);
    assert.equal(await collectNativeEvents(bindings), 0, "source receipts survive another collector cycle");
    const rows = await prisma.crmBridgeOutbox.findMany();
    assert.equal(rows.length, 3);
    assert.ok(rows.every(r => r.workspaceId === workspace.id && r.instagramAccountId === account.instagramId));
    const message = rows.map(r => r.payload as { type: string; campaignId: string }).find(p => p.type === "instagram.message_received");
    assert.equal(message?.campaignId, campaign.id, "one recent accepted campaign can attribute the inbound request");
    assert.ok(!JSON.stringify(rows).includes("dummy-never-used"), "provider access tokens never enter exported events");

    await dispatchOne(bindings, "https://crm.example.com/receiver", async () => new Response("unavailable", { status: 503 }));
    const retry = await prisma.crmBridgeOutbox.findFirst({ where: { attempts: 1 } });
    assert.equal(retry?.status, "PENDING");
    assert.equal(retry?.lastErrorCode, "receiver_unavailable");
    await prisma.crmBridgeOutbox.updateMany({ where: { status: "PENDING" }, data: { nextAttemptAt: new Date(0) } });
    let received = 0;
    const receiver: typeof fetch = async (url, options) => {
      assert.equal(options?.redirect, "error");
      const request = new Request(String(url), options);
      return handleOpenReplyWebhook(request, { keys: JSON.stringify(keys), ingest: async () => { received++; return "duplicate"; } });
    };
    while (await dispatchOne(bindings, "https://crm.example.com/receiver", receiver)) {}
    assert.equal(received, 3);
    assert.equal(await prisma.crmBridgeOutbox.count({ where: { status: "DELIVERED" } }), 3);
    // An expired worker lease is reclaimed, and terminal rejections are retained.
    const extra = makeEvent(bindings[0], "instagram.message_received", "mid.expired", "555000000000001", "hola", new Date());
    await prisma.crmBridgeOutbox.create({ data: { eventId: extra.eventId, workspaceId: workspace.id, instagramAccountId: account.instagramId, payload: JSON.parse(JSON.stringify(extra)), status: "PROCESSING", lockedUntil: new Date(0), leaseToken: "old-lease" } });
    assert.equal(await dispatchOne(bindings, "https://crm.example.com/receiver", async () => new Response("denied", { status: 403 })), true);
    assert.equal((await prisma.crmBridgeOutbox.findUnique({ where: { eventId: extra.eventId } }))?.status, "DEAD");
    await assert.rejects(() => collectNativeEvents([{ ...bindings[0], workspaceId: foreign.id }]), /source_account_mismatch/);
  } finally {
    await prisma.crmBridgeOutbox.deleteMany({ where: { workspaceId: { in: [workspace.id, foreign.id] } } });
    await prisma.crmBridgeSourceReceipt.deleteMany();
    await prisma.workspace.deleteMany({ where: { id: { in: [workspace.id, foreign.id] } } });
    await prisma.user.delete({ where: { id: owner.id } });
  }
});

test("export configuration rejects unsafe destinations and incomplete enrollment", () => {
  for (const url of ["http://crm.example.com", "https://localhost/receiver", "https://127.0.0.1/events", "https://user:pass@crm.example.com/events", "https://crm.example.com/events?token=secret"]) assert.throws(() => validateDestination(url));
  assert.throws(() => parseBindings(JSON.stringify([{ keyId: "qa", secret: "s".repeat(43), workspaceId: "workspace_a", instagramAccountId: "178400000000001" }])));
  assert.equal(retrySeconds(1), 5);
  assert.ok(retrySeconds(20) <= 3600);
});

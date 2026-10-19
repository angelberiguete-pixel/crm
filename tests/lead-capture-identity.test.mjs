import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { leadIdentity } from "../supabase/functions/look-social-media-lead-capture/identity.mjs";

test("email-based keys remain backward compatible", () => {
  assert.deepEqual(leadIdentity(" Ana@Example.COM ", "+18095550001"), {
    dedupeKey: "landing:ana@example.com",
    lookup: { column: "email", value: "ana@example.com" },
  });
});

test("WhatsApp-only submissions get different dedupe keys", () => {
  const first = leadIdentity("", "+1 (809) 555-0001");
  const second = leadIdentity("", "+1 (809) 555-0002");
  assert.equal(first.dedupeKey, "landing:phone:+18095550001");
  assert.equal(second.dedupeKey, "landing:phone:+18095550002");
  assert.notEqual(first.dedupeKey, second.dedupeKey);
});

test("WhatsApp-only contact lookup does not match blank emails", () => {
  assert.deepEqual(leadIdentity("", "+1 809 555 0011").lookup, {
    column: "whatsapp_phone", value: "+18095550011",
  });
});

test("no identity is rejected", () => {
  assert.throws(() => leadIdentity("", ""), /lead_identity_missing/);
});

test("Edge Function entrypoint uses shared identity for contact lookup and prospect upsert", () => {
  const index = readFileSync(new URL("../supabase/functions/look-social-media-lead-capture/index.ts", import.meta.url), "utf8");
  assert.match(index, /import \{ leadIdentity \} from "\.\/identity\.mjs"/);
  assert.match(index, /const identity=leadIdentity\(email,whatsapp\)/);
  assert.match(index, /\.eq\(identity\.lookup\.column,identity\.lookup\.value\)/);
  assert.match(index, /dedupe_key:identity\.dedupeKey/);
  assert.doesNotMatch(index, /dedupe_key:`landing:\$\{email\}`/);
});

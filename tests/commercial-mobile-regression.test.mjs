// Regression guard: commercial mobile tests must not silently accept failed Supabase writes.
// This test uses controlled API responses; it does not certify production persistence.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("./commercial-mobile-browser.test.mjs", import.meta.url), "utf8");

test("mobile commercial suite explicitly runs at 390px", () => {
  assert.match(source, /viewport:\s*\{\s*width:\s*390,\s*height:\s*844\s*\}/);
});
test("commercial suite verifies tenant-scoped writes", () => {
  for (const name of ["company-insert", "company-update", "contact-insert", "contact-update", "opportunity-insert", "opportunity-update", "task-insert", "task-update"]) {
    assert.ok(source.includes(name), "missing write check: " + name);
  }
  assert.match(source, /assert\.equal\(body\.tenant_id,A\)/);
  assert.match(source, /assert\.equal\(url\.searchParams\.get\("tenant_id"\),"eq\."\+A\)/);
});
test("commercial suite identifies its controlled API and does not claim real persistence", () => {
  assert.match(source, /context\.route\("https:\/\/ygipjqgyreeahslzorik\.supabase\.co\/\*\*"/);
  assert.match(source, /controlled Supabase responses/);
});

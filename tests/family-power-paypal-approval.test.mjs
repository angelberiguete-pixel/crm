import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../components/family-power-billing-portal.tsx", import.meta.url), "utf8"
);

test("does not present a buyer authorization link until initial invoice is paid", () => {
  assert.match(source, /initial\?\.status!=="paid"/);
  assert.match(source, /provider_approval_state!=="awaiting_buyer"/);
  assert.match(source, /custom_monthly_price_cents!==8000/);
  assert.match(source, /!subscription\.provider_plan_id/);
});

test("only recognizes HTTPS PayPal hosts for the externally provided approval link", () => {
  assert.match(source, /url\.protocol!=="https:"/);
  assert.match(source, /"www\.paypal\.com"/);
  assert.match(source, /"www\.sandbox\.paypal\.com"/);
  assert.match(source, /\.includes\(url\.hostname\)/);
  assert.match(source, /url\.username\|\|url\.password/);
});

test("external authorization does not imply monthly payment confirmation", () => {
  assert.match(source, /href=\{approvalUrl\}/);
  assert.match(source, /rel="noopener noreferrer"/);
  assert.match(source, /La autorización por sí sola no confirma el cobro/);
  assert.doesNotMatch(source, /setSubscription\(\{[^}]*status:\s*["']active/);
});

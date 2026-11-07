import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync("app/api/umami/overview/route.ts", "utf8");
const ui = readFileSync("components/crm-umami-analytics.tsx", "utf8");
const marketing = readFileSync("components/crm-marketing-performance.tsx", "utf8");
const migration = readFileSync(
  "supabase/migrations/20261107073000_umami_analytics_tenant_bindings.sql", "utf8",
);

test("Umami authentication, per-tenant grants and request isolation remain enforced", () => {
  assert.match(route, /auth\.getUser\(token\)/);
  assert.match(route, /rpc\("list_my_tenants"\)/);
  assert.match(route, /is_active === true/);
  assert.match(route, /"owner", "admin"/);
  assert.match(route, /tenant_current_permissions/);
  assert.match(route, /tenant_effective_modules/);
  assert.match(route, /umami_analytics/);
  assert.match(route, /\.eq\("tenant_id", tenantId\)/);
  assert.match(route, /const site = safeSites\.find\(item => item\.id === siteId\)/);
  assert.match(route, /private, no-store/);
});

test("Only platform administrators may create or change website bindings", () => {
  assert.match(migration, /umami_website_id uuid not null unique/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /marketing_umami_platform_insert/);
  assert.match(migration, /marketing_umami_platform_update/);
  assert.match(migration, /marketing_umami_platform_delete/);
  assert.match(migration, /private\.crm_is_platform_admin\(\)/);
});

test("The tenant UI has no private key and does not fabricate analytics", () => {
  assert.doesNotMatch(ui, /UMAMI_API_KEY/);
  assert.match(ui, /"not_connected"/);
  assert.match(ui, /"connected"/);
  assert.match(marketing, /<CrmUmamiAnalytics \/>/);
});


test("Family Power gets a separate protected web analytics route, never the general marketing module", () => {
  const route = readFileSync("app/crm/[[...slug]]/page.tsx", "utf8");
  const guard = readFileSync("components/tenant-permission-gate.tsx", "utf8");
  const workspace = readFileSync("components/crm-workspace.tsx", "utf8");
  const mobile = readFileSync("components/mobile-tenant-navigation.tsx", "utf8");
  assert.match(route, /section === "web-analytics"/);
  assert.match(guard, /"web-analytics": "settings"/);
  assert.match(guard, /const restrictedFamilySections=\["companies","sales","marketing"/);
  assert.match(workspace, /familyEnabledModules\.umami_analytics===true/);
  assert.match(workspace, /if\(isFamilyPower&&key==="web-analytics"\)/);
  assert.match(mobile, /path==="web-analytics"/);
  assert.match(mobile, /module_key==="umami_analytics"/);
});

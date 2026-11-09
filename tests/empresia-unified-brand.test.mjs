import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const layout = read("app/layout.tsx");
const sales = read("app/aurevector/sales-page.tsx");
const root = read("app/page.tsx");
const legacy = read("app/look-social-media/page.tsx");
const startLegacy = read("app/look-social-media/start/page.tsx");
const logo = read("components/brand-logo.tsx");
const tenantBrand = read("lib/tenant-brand.ts");
const companyBrand = read("components/tenant-brand-provider.tsx");
const readme = read("README.md");
const packageJson = JSON.parse(read("package.json"));
const lock = JSON.parse(read("package-lock.json"));

test("single visible brand Empresia replaces Look Social Media on public pages", () => {
  assert.match(layout, /default: "Empresia"/);
  assert.match(sales, /EMPRESIA/);
  assert.doesNotMatch(sales, /LOOK SOCIAL MEDIA|Look Social Media|look-social-media/);
  assert.doesNotMatch(layout, /LOOK SOCIAL MEDIA|Look Social Media|look-social-media/);
  assert.match(root, /redirect\("\/empresia"\)/);
  assert.match(read("app/empresia/page.tsx"), /AurevectorSalesPage/);
});

test("old links are redirects, not broken client journeys", () => {
  assert.match(legacy, /redirect\("\/empresia"\)/);
  assert.match(startLegacy, /redirect\("\/empresia\/start"\)/);
  assert.match(read("app/empresia/start/page.tsx"), /AiOnboarding/);
  assert.match(sales, /href="\/empresia\/start"/);
});

test("customer-specific brands remain isolated and Family Power remains Family Power", () => {
  assert.match(tenantBrand, /identity\.tenant_slug==="family-power"/);
  assert.match(tenantBrand, /name:"Family Power"/);
  assert.match(tenantBrand, /officialLookBrand=identity\.tenant_slug==="eurevector"/);
  assert.match(tenantBrand, /const name=officialLookBrand\?"Empresia"/);
  assert.match(companyBrand, /tenant\.tenant_id/);
  assert.match(companyBrand, /\/empresia-icon\.svg/);
});

test("both light and dark Empresia assets exist, no legacy public image shown", () => {
  assert.match(logo, /\/empresia-logo\.svg/);
  assert.match(logo, /\/empresia-logo-light\.svg/);
  assert.doesNotMatch(logo, /\/look-social-media-logo\.svg/);
  assert.match(read("public/empresia-logo.svg"), /EMPRESIA/);
  assert.match(read("public/empresia-logo-light.svg"), /EMPRESIA/);
  assert.match(read("public/empresia-icon.svg"), /Empresia/);
});

test("package identity is Empresia but internal legacy integration routes are preserved", () => {
  assert.equal(packageJson.name, "empresia");
  assert.equal(lock.name, "empresia");
  assert.equal(lock.packages[""].name, "empresia");
  assert.match(read("app/aurevector/lead-form.tsx"), /look-social-media-lead-capture/);
  assert.match(readme, /identificadores técnicos históricos|Identificadores técnicos históricos/);
  assert.match(readme, /Dolibarr/);
});

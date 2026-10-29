import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";
import {isCommercialClientTenant} from "../lib/visible-client-tenants.ts";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");

test("commercial view retains exactly Look Social Media and Sublimaciones Lazala",()=>{
  const tenants=["eurevector","sublimaciones-lazala","look-social-media-demo",
    "qa-e2e-25139e2a-b099-4786-b768-b496ea986595",
    "qa-e2e-db62e704-47b1-4df0-86ed-9481e2ac14d3"];
  assert.deepEqual(tenants.filter(isCommercialClientTenant),["eurevector","sublimaciones-lazala"]);
  assert.ok(isCommercialClientTenant("cliente-futuro"),"new legitimate clients remain visible");
});

test("actual uploaded logo rendition is bundled as a working first-party SVG resource",()=>{
  const svg=read("public/look-social-media-logo.svg");
  assert.match(svg,/<svg\b/);
  const embedded=svg.match(/href="data:image\/webp;base64,([^"]+)"/);
  assert.ok(embedded,"original uploaded logo is embedded, not an invented approximation or remote dependency");
  const bytes=Buffer.from(embedded[1],"base64");
  assert.equal(bytes.subarray(0,4).toString("ascii"),"RIFF");
  assert.equal(bytes.subarray(8,12).toString("ascii"),"WEBP");
  assert.ok(bytes.length>4000);
  // Detect accidentally truncated or retyped embedded user source.
  let hash=0;for(const char of embedded[1])hash=(hash*31+char.charCodeAt(0))>>>0;
  assert.equal(hash,3018367565);
});

test("transparent branded variants retain the exact original embedded artwork",()=>{
  const original=read("public/look-social-media-logo.svg").match(/href="data:image\/webp;base64,([^"]+)"/)?.[1];
  assert.ok(original,"original official logo exists");
  for(const file of ["public/look-social-media-logo-transparent.svg","public/look-social-media-logo-on-dark.svg"]){
    const svg=read(file);
    assert.ok(!svg.includes('<rect width="220" height="182" fill="#fff"/>'),file+" must have no white rectangle");
    assert.match(svg,/id="removeWhite"/);
    assert.ok(svg.includes(original),file+" must preserve original embedded art");
  }
  assert.ok(read("components/brand-logo.tsx").includes("look-social-media-logo-on-dark.svg"));
  assert.ok(read("components/brand-logo.tsx").includes("look-social-media-logo-transparent.svg"));
  assert.ok(read("app/globals.css").includes("background:transparent url('/look-social-media-logo-transparent.svg')"));
});

test("branding is shown on sign-in, owner control center, member portals and loading",()=>{
  assert.match(read("app/login/page.tsx"),/<BrandLogo size="login"/);
  assert.match(read("components/eurevector-console.tsx"),/<BrandLogo size="sidebar"/);
  assert.match(read("components/crm-commercial-dashboard.tsx"),/<BrandLogo size="sidebar"/);
  assert.match(read("components/crm-workspace.tsx"),/<BrandLogo size="sidebar"/);
  assert.match(read("app/loading.tsx"),/<BrandLogo size="loading"/);
  assert.match(read("app/globals.css"),/\.loading::before/);
});

test("owner panel hides only QA/demo by default and can inspect them if explicitly requested",()=>{
  const source=read("components/eurevector-console.tsx");
  assert.match(source,/visibleTenants=showTechnical\?tenants:commercialTenants/);
  assert.match(source,/setShowTechnical\(e\.target\.checked\)/);
  assert.match(source,/platform_admin_members/);
  assert.match(source,/platform_link_existing_user/);
  assert.match(source,/platform_create_client_tenant/);
});

test("unassigned users cannot create their own client account from the portal",()=>{
  const source=read("components/crm-workspace.tsx");
  assert.match(source,/No tienes una empresa asignada/);
  assert.match(read("supabase/migrations/20261014183000_restrict_client_tenant_creation_to_platform_admin.sql"),/private\.crm_is_platform_admin\(\)/);
});

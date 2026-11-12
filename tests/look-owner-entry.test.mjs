import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("Empresia landing CRM links never enter the currently selected client",()=>{
  const sales=read("app/aurevector/sales-page.tsx");
  assert.ok((sales.match(/href="\/acceso-crm"/g)||[]).length>=2,
    "all Empresia navigation, mobile and footer CRM links use the owner-aware entry");
  assert.doesNotMatch(sales,/href="\/crm"/);
  assert.match(read("app/empresia/page.tsx"),/AurevectorSalesPage/);
  assert.match(read("app/look-social-media/page.tsx"),/redirect\("\/empresia"\)/);
});

test("Empresia entry checks authenticated platform role and never sets the active tenant",()=>{
  const entry=read("app/acceso-crm/page.tsx");
  assert.match(entry,/supabase\.auth\.getSession\(\)/);
  assert.match(entry,/supabase\.rpc\("platform_current_access"\)/);
  assert.match(entry,/router\.replace\(isPlatformAdmin\?"\/platform-admin":"\/crm"\)/);
  assert.match(entry,/router\.replace\("\/login"\)/);
  assert.match(entry,/sessionStorage\.removeItem\("crm:login-intent"\)/);
  assert.doesNotMatch(entry,/set_active_tenant|platform_join_tenant_as_admin|supabase\.auth\.signOut/);
});

test("Empresia login sends platform administrators to the principal dashboard",()=>{
  const login=read("app/login/page.tsx");
  assert.match(login,/value\.is_platform_admin \? "\/platform-admin" : "\/crm"/);
  assert.doesNotMatch(login,/value\.is_platform_admin \? "\/mis-empresas"/);
});

test("portfolio offers Empresia first and client entry only after explicit owner selection",()=>{
  const panel=read("components/platform-company-portfolio.tsx");
  assert.match(panel,/Number\(b\.tenant_slug==="eurevector"\)-Number\(a\.tenant_slug==="eurevector"\)/);
  assert.match(panel,/platform_join_tenant_as_admin/);
  assert.match(panel,/window\.location\.assign\("\/crm"\)/);
  assert.match(panel,/Sitio de Empresia/);
  assert.doesNotMatch(panel,/href="\/crm">Volver al CRM/);
});

test("client sign-out keeps owner-aware return and portfolio shortcut checks platform authority",()=>{
  const helper=read("lib/tenant-session.ts");
  const exit=read("components/tenant-session-exit.tsx");
  const legacy=read("components/crm-workspace.tsx");
  const shortcut=read("components/platform-companies-shortcut.tsx");
  assert.match(helper,/export async function tenantLogoutDestination/);
  assert.match(helper,/platform_current_access/);
  assert.match(helper,/return "\/family-power\/login"/);
  assert.match(exit,/await tenantLogoutDestination\(tenant\.tenant_slug\)/);
  assert.match(legacy,/await tenantLogoutDestination\(member\.tenant_slug/);
  assert.match(shortcut,/supabase\.rpc\("platform_current_access"\)/);
  assert.match(shortcut,/is_platform_admin/);
  assert.match(shortcut,/return allowed\?<Link href="\/mis-empresas"/);
  assert.doesNotMatch(shortcut,/return true/);
});

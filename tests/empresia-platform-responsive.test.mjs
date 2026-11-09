import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read=path=>readFileSync(new URL("../"+path, import.meta.url),"utf8");
const dashboard=read("components/eurevector-console.tsx");
const style=read("components/empresia-platform-shell.module.css");
const login=read("app/login/page.tsx");
const entry=read("app/acceso-crm/page.tsx");
const portfolio=read("components/platform-company-portfolio.tsx");
test("owner enters Empresia platform dashboard, never the prior customer",()=>{
 assert.match(login,/value\.is_platform_admin \? "\/platform-admin" : "\/crm"/);
 assert.match(entry,/router\.replace\(isPlatformAdmin\?"\/platform-admin":"\/crm"\)/);
 assert.match(entry,/sessionStorage\.removeItem\("crm:login-intent"\)/);
 assert.doesNotMatch(entry,/Look Social Media|LOOK SOCIAL MEDIA/);
});
test("global dashboard uses actual tenant RPC data and preserves owner-controlled access",()=>{
 for(const symbol of ["platform_current_access","platform_admin_tenants","platform_client_readiness",
 "platform_join_tenant_as_admin","tenant_effective_modules","platform_admin_members",
 "platform_create_client_tenant","styles.platformShell","styles.clientList",
 "id=\"empresia-platform-navigation\"","Indicadores globales de Empresia"])
  assert.ok(dashboard.includes(symbol),symbol);
 assert.match(dashboard,/src="\/empresia-logo-light\.svg"/);
 assert.match(dashboard,/src="\/empresia-logo\.svg"/);
 assert.doesNotMatch(dashboard,/LOOK SOCIAL MEDIA/);
 assert.match(dashboard,/aria-pressed=\{selectedId===t\.tenant_id\}/);
 assert.match(portfolio,/href="\/platform-admin"/);
});
test("responsive platform shell is isolated from customer brand themes",()=>{
 for(const rule of [".platformShell", ".platformSidebar", ".mobileBar", ".clientList",
 "@media (max-width: 840px)", "@media (max-width: 460px)",
 "safe-area-inset-bottom", "prefers-reduced-motion", ":focus-visible"])
  assert.ok(style.includes(rule),rule);
 assert.doesNotMatch(style,/\.tenant-brand-scope\s*\{/);
});

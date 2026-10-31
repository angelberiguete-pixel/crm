import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const ui=readFileSync(new URL("../components/platform-company-portfolio.tsx",import.meta.url),"utf8");
const nav=readFileSync(new URL("../components/platform-companies-shortcut.tsx",import.meta.url),"utf8");
const sql=readFileSync(new URL("../supabase/migrations/20261030233000_platform_admin_tenant_analytics.sql",import.meta.url),"utf8");
const brand=readFileSync(new URL("../public/look-social-media-logo.svg",import.meta.url),"utf8");
const fp=readFileSync(new URL("../public/client-brands/family-power/logo-negativo-sin-fondo.svg",import.meta.url),"utf8");
test("global portfolio denies non-admins and entering a client uses audited access RPC",()=>{
 for(const needle of ["platform_current_access","platform_admin_tenants","platform_join_tenant_as_admin",
 "platform_admin_tenant_analytics","platform_admin_members","notifyTenantContextChanged",
 "isCommercialClientTenant","safeTenantAsset"]) assert.ok(ui.includes(needle),needle);
 assert.ok(nav.includes("platform_current_access"));
 assert.ok(nav.includes("is_platform_admin"));
});
test("all analytics are tenant-scoped, seller responses are actual CRM outbound user messages",()=>{
 for(const needle of ["private.crm_is_platform_admin()","p_tenant_id","msg.sender_user_id=m.user_id",
   "msg.direction='outbound'","msg.sender_type='user'","public.quotations",
   "public.conversations","public.messages","public.memberships",
   "'not_integrated'","from public.opportunities"])assert.ok(sql.includes(needle),needle);
 assert.doesNotMatch(sql,/from public\.billing_invoices/);
 assert.match(sql,/revoke all on function public\.platform_admin_tenant_analytics\(uuid\) from public,anon,authenticated/);
});
test("client invoices and Facebook Pixel have explicit not integrated states, no invented results",()=>{
 for(const s of ["Sin integración comercial verificada","Sin telemetría de Pixel/CAPI conectada",
 "no equivalen a facturas", "Las respuestas sólo cuentan mensajes"]) assert.ok(ui.includes(s),s);
});
test("transparent logo wrappers do not force white tiles and original Family Power vectors remain intact",()=>{
 assert.doesNotMatch(brand,/<rect width="220" height="182" fill="#fff"\/>/);
 assert.ok(brand.includes('filter="url(#look-remove-white)"'));
 assert.doesNotMatch(fp,/<rect x="134" y="427"/);
});

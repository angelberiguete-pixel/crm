import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
test("Family Power hides global company list and proprietary branding controls",()=>{
 const gate=read("components/tenant-permission-gate.tsx"),workspace=read("components/crm-workspace.tsx");
 const settings=read("components/family-power-client-settings.tsx");
 assert.match(gate,/familyPowerRestriction/);
 assert.match(gate,/section==="companies"/);
 assert.match(workspace,/isFamilyPower&&key==="companies"/);
 assert.match(workspace,/FamilyPowerClientSettings/);
 assert.doesNotMatch(settings,/Guardar identidad visual|type="color"/);
});
test("administration opens directly from a card through audited RPC",()=>{
 const page=read("components/platform-company-portfolio.tsx");
 assert.match(page,/onClick=\{\(\)=>void enter\(t\)\}/);
 assert.match(page,/platform_join_tenant_as_admin/);
 assert.match(page,/p_tenant_id:target\.tenant_id/);
});
test("family colors and logo never leak across other companies",()=>{
 const style=read("app/globals.css");
 assert.match(style,/\.tenant-brand-scope\[data-tenant-brand="family-power"\]/);
 assert.match(style,/#c91425/);
 const page=read("components/crm-sales-360.tsx");
 assert.doesNotMatch(page,/Look Social Media CRM/);
 assert.match(page,/BrandLogo size="sidebar"/);
});
test("staged SQL limits Family Power branding updates to platform admin",()=>{
 const sql=read("supabase/migrations/20261031180000_family_power_platform_only_brand_settings.sql");
 assert.match(sql,/tenant_settings_update/);
 assert.match(sql,/private\.crm_is_platform_admin\(\)/);
 assert.match(sql,/t.slug='family-power'/);
 assert.match(sql,/with check/);
});

import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolveTenantBrand} from "../lib/tenant-brand.ts";
const read=path=>readFileSync(new URL(path,import.meta.url),"utf8");
const sql=read("../supabase/migrations/20261029180000_family_power_energy_template_and_onboarding.sql");
const admin=read("../components/platform-admin.tsx");
const logo=read("../components/brand-logo.tsx");
const provider=read("../components/tenant-brand-provider.tsx");
const css=read("../app/globals.css");
const settings=read("../components/crm-workspace.tsx");
test("Family Power inherits the shared multi-company CRM, never a parallel codebase",()=>{
 assert.match(sql,/public\.platform_create_client_tenant\(/);
 assert.match(sql,/'Family Power','family-power'/);
 assert.match(sql,/if exists \(select 1 from public\.tenants t where t\.slug='family-power'\)/);
 assert.match(sql,/family_power_tenant_already_exists/);
 assert.match(sql,/security invoker/);
 assert.match(sql,/private\.crm_is_platform_admin\(\)/);
 assert.match(sql,/grant execute on function public\.platform_create_family_power_tenant\(text\)[\s\S]+to authenticated;/i);
 assert.match(admin,/Preparar Family Power/);
 assert.match(admin,/supabase\.rpc\("platform_create_family_power_tenant"/);
 assert.match(admin,/tenants\.some\(t=>t\.tenant_slug==="family-power"\)/);
 assert.doesNotMatch(sql,/insert into public\.(contacts|companies|products|quotations|orders|messages|ai_agents)\b/i);
 assert.doesNotMatch(sql,/OPENAI_API_KEY|META_WA_ACCESS_TOKEN|stripe_secret/i);
});
test("energy template disables billable or external automation by default",()=>{
 assert.match(sql,/energia-instalaciones/);
 assert.match(sql,/\('operations',true/);
 assert.match(sql,/\('quotations',true/);
 assert.match(sql,/\('automations',false/);
 assert.match(sql,/\('ai_agents',false/);
 assert.match(sql,/requires_verified_catalog/);
 assert.match(sql,/requires_human_approval/);
});
test("approved SVG logos are preserved with client-specific contrast, no white tile",()=>{
 const source=read("../public/client-brands/family-power/logo-color.svg");
 const dark=read("../public/client-brands/family-power/logo-negativo.svg");
 assert.match(source,/<svg/);
 assert.match(dark,/<svg/);
 assert.ok(!source.includes('<rect width="1205" height="444"'));
 assert.match(source,/#D20A14/);
 assert.match(dark,/#FFFFFF/);
 const brand=resolveTenantBrand({
   tenant_id:"a",tenant_slug:"family-power",tenant_name:"Family Power",
 },{
   brand_name:"Family Power",
   logo_url:"/client-brands/family-power/logo-negativo.svg",
   primary_color:"#D20A14",secondary_color:"#101115",accent_color:"#DFE1E3",
   settings:{branding:{logo_on_light_url:"/client-brands/family-power/logo-color.svg",
     logo_on_dark_url:"/client-brands/family-power/logo-negativo.svg"}},
 });
 assert.equal(brand.officialLookBrand,false);
 assert.equal(brand.logoOnLightUrl,"/client-brands/family-power/logo-color.svg");
 assert.equal(brand.logoOnDarkUrl,"/client-brands/family-power/logo-negativo.svg");
 assert.equal(brand.primaryColor,"#D20A14");
 assert.match(logo,/surface==="dark"/);
 assert.match(provider,/accent_color,settings/);
 assert.match(css,/\.look-brand-logo\.tenant-customer-logo\{[\s\S]*?background:transparent/);
 assert.match(settings,/Logo para fondo claro/);
 assert.match(settings,/Logo para fondo oscuro/);
});

test("Family Power panel uses real tenant-scoped records and accessible Spanish labels",()=>{
 const dashboard=read("../components/energy-service-dashboard.tsx");
 const main=read("../components/crm-commercial-dashboard.tsx");
 assert.match(main,/tenant\?\.tenant_slug==="family-power"/);
 assert.match(main,/EnergyServiceDashboard/);
 for(const table of ["contacts","quotations","orders","opportunities"]){
   assert.match(dashboard,new RegExp('["\\x27]'+table+'["\\x27]'));
 }
 assert.match(dashboard,/\.eq\("tenant_id",tenantId\)/);
 assert.match(dashboard,/RLS|permisos/i);
 assert.match(dashboard,/<BrandLogo size="login" surface="dark"\/>/);
 assert.match(dashboard,/Clientes/);
 assert.match(dashboard,/Trabajos e instalaciones/);
 assert.match(dashboard,/Ninguna cuenta de WhatsApp/);
 assert.doesNotMatch(dashboard,/OPENAI_API_KEY|service_role|graph\.facebook\.com|insert\(/);
});

test("branded portal login never trusts a URL or self-signup for tenant access",()=>{
 const login=read("../app/family-power/login/page.tsx");
 const helper=read("../lib/family-power-access.ts");
 const styles=read("../app/family-power/login/family-login.module.css");
 assert.match(login,/src="\/client-brands\/family-power\/logo-negativo.svg"/);
 assert.match(login,/supabase\.auth\.signInWithPassword/);
 assert.match(login,/supabase\.rpc\("list_my_tenants"\)/);
 assert.match(login,/familyPowerMembership\(list\.data/);
 assert.match(login,/supabase\.rpc\("set_active_tenant"/);
 assert.match(login,/notifyTenantContextChanged\(\)/);
 assert.match(login,/router\.replace\("\/crm"\)/);
 assert.doesNotMatch(login,/supabase\.auth\.signUp|platform_join_tenant_as_admin|window\.location\.search.*next/);
 assert.match(login,/no tiene acceso autorizado/);
 assert.match(styles,/background:#0c0d10/);
 assert.match(styles,/border-top:4px solid #d20a14/);
 assert.match(helper,/FAMILY_POWER_SLUG="family-power"/);
 assert.match(helper,/case "owner":return "Propietario"/);
 assert.match(helper,/case "admin":return "Administrador"/);
 assert.match(helper,/case "agent":return "Vendedor"/);
});
test("Family Power screens hide inaccessible actions for each role",()=>{
 const dashboard=read("../components/energy-service-dashboard.tsx");
 assert.match(dashboard,/familyPowerRoleLabel\(tenant\?\.membership_role\)/);
 assert.match(dashboard,/tenant_current_permissions/);
 assert.match(dashboard,/permissions\[\s*link\.permission\s*\]===true/);
 assert.match(dashboard,/\/crm\/operations/);
 assert.match(dashboard,/\/crm\/revenue/);
 assert.doesNotMatch(dashboard,/href:"\/crm\/tasks"|href:"\/crm\/orders"/);
});

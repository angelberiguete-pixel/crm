import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";
const read=(path)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const home=read("components/energy-service-dashboard.tsx");
const charts=read("components/family-power-executive-insights.tsx");
const finance=read("components/family-power-finance.tsx");
const security=read("components/family-power-installation-safety.tsx");
const routes=read("app/crm/[[...slug]]/page.tsx");
const gate=read("components/tenant-permission-gate.tsx");
const nav=read("components/crm-workspace.tsx");
const familyMenu=read("components/family-power-menu.tsx");
const login=read("app/family-power/login/page.tsx");
test("the Family Power owner login uses existing Supabase password and tenant-authority flow",()=>{
 assert.match(login,/signInWithPassword/);
 assert.match(login,/familyPowerMembership/);
 assert.match(login,/set_active_tenant/);
 assert.doesNotMatch(login,/signInWithOtp/);
});
test("the executive homepage uses real tenant-scoped historical data and responsive charts",()=>{
 assert.match(home,/FamilyPowerExecutiveInsights/);
 assert.match(charts,/ResponsiveContainer/);
 assert.match(charts,/AreaChart/);
 assert.match(charts,/BarChart/);
 for(const table of ["contacts","quotations","orders","deliveries"]){
  assert.ok(charts.includes('supabase.from("'+table+'")'));
 }
 assert.match(charts,/\.eq\("tenant_id",tenantId\)/);
 assert.match(charts,/No agregaremos números ficticios/);
 assert.match(charts,/no tasas de conversión/);
 for(const path of ["components/family-power-dashboard.module.css","components/family-power-executive-insights.module.css"]){
  const css=read(path);assert.match(css,/@media\(max-width:/);assert.match(css,/grid-template-columns/);
 }
});
test("finance has real records only and never claims unverified paid, net profit or agent activity",()=>{
 assert.match(finance,/tenant\?\.tenant_slug==="family-power"/);
 assert.match(finance,/\["owner","admin"\]/);
 for(const source of ["orders","customer_payments","quotations","ai_agents"]){
  assert.ok(finance.includes('supabase.from("'+source+'")'));
 }
 assert.match(finance,/\.eq\("tenant_id",tenantId\)/);
 assert.match(finance,/No mezclamos monedas ni inventamos conversiones/);
 assert.match(finance,/Sin un registro de gastos no se puede calcular utilidad neta/);
 assert.match(finance,/Estas observaciones no las generó un agente contable autónomo/);
 assert.match(finance,/ResponsiveContainer/);
 assert.doesNotMatch(finance,/service_role|NEXT_PUBLIC_SERVICE_ROLE/);
});
test("sensor security cannot invent telemetry or stand in for smoke alarms",()=>{
 assert.match(security,/Sin telemetría conectada/);
 assert.match(security,/NO detecta humo ni incendios/);
 assert.match(security,/R-032/);
 assert.match(security,/tenant\?\.tenant_slug==="family-power"/);
 assert.match(security,/\["owner","admin"\]/);
 assert.match(security,/supabase\.from\("deliveries"\)/);
 assert.match(security,/supabase\.from\("tasks"\)\.insert/);
 assert.match(security,/tenant_id:id/);
 assert.match(security,/source:"manual"/);
 assert.match(security,/status:"todo"/);
 assert.match(security,/Tarea.*Inspección|Inspección.*Tareas|Inspección registrada/);
 assert.doesNotMatch(security,/fetch\(\s*["']https?:|send_whatsapp|disable_alarm/);
});
test("routes and menus grant owner/admin only; no cross-tenant finance pages",()=>{
 assert.match(routes,/section === "finanzas"/);
 assert.match(routes,/section === "seguridad-instalaciones"/);
 assert.match(gate,/familyOnlySections=\["arm","tasks","reports","finanzas","seguridad-instalaciones"\]/);
 assert.match(gate,/\["settings","pagos","finanzas","seguridad-instalaciones"\]/);
 assert.match(nav,/member\.tenant_slug==="family-power"/);
 assert.match(nav,/finanzas/);
 assert.match(nav,/seguridad-instalaciones/);
 assert.match(familyMenu,/finanzas/);
 assert.match(familyMenu,/seguridad-instalaciones/);
});

test("only verified and priced Family Power products are presented as quotation-ready",()=>{
 const catalog=read("components/family-power-catalog-readiness.tsx");
 assert.match(home,/FamilyPowerCatalogReadiness/);
 assert.match(catalog,/tenant\?\.tenant_slug==="family-power"/);
 assert.match(catalog,/\["owner","admin"\]/);
 assert.match(catalog,/\.eq\("tenant_id",id\)/);
 assert.match(catalog,/p\.status==="active"/);
 assert.match(catalog,/p\.metadata\?\.verification_status==="approved"/);
 assert.match(catalog,/Number\(p\.sale_price\)>0/);
 assert.match(catalog,/Antes de cotizar/);
 assert.match(catalog,/href="\/crm\/products"/);
});

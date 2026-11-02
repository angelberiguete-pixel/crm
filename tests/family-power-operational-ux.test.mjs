import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");

test("Family Power sidebar, topbar and mobile menus exclude agency sales center and companies",()=>{
 const ws=read("components/crm-workspace.tsx");
 const mobile=read("components/mobile-tenant-navigation.tsx");
 const gate=read("components/tenant-permission-gate.tsx");
 const sales=read("components/crm-sales-360.tsx");
 const contacts=read("components/crm-customers.tsx");
 const menu=read("components/family-power-menu.tsx");
 assert.match(ws,/const familyKeys=\["","contacts","revenue","products","quotations","inbox","tasks","arm","reports","settings"\]/);
 assert.match(ws,/!isFamilyPower&&<Link className="button" href="\/revenue-command-center"/);
 assert.match(gate,/restrictedFamilySections=\["companies","sales"/);
 assert.match(mobile,/const familyKeys=\["inbox","products","quotations","arm","tasks","reports","settings"\]/);
 assert.match(sales,/<FamilyPowerMenu active="revenue" variant="sidebar"\/>/);
 assert.match(contacts,/<FamilyPowerMenu active=\{kind\} variant="sidebar"\/>/);
 assert.match(menu,/tenant_current_permissions/);
 assert.match(menu,/tenant_effective_modules/);
 assert.match(menu,/permissions\.all===true/);
});
test("Family Power products display image cards and separate original Drive references from approved inventory",()=>{
 const c=read("components/family-power-product-catalog.tsx");
 const g=read("components/family-power-evidence-library.tsx");
 const route=read("app/api/family-power/evidence/route.ts");
 assert.match(c,/family-product-grid/);
 assert.match(c,/metadata:\{brand:brand.trim\(\),model:model.trim\(\),category:kind.trim\(\),verification_status:"pending"\}/);
 assert.match(c,/status:"inactive"/);
 assert.match(c,/meta.verification_status==="approved"/);
 assert.match(c,/href=\{"\/crm\/quotations\?product="/);
 assert.match(g,/driveThumbnail/);
 assert.match(g,/family-evidence-photo/);
 assert.match(route,/supabase.auth.getUser\(token\)/);
 assert.doesNotMatch(c,/rltnmstwqorxtoeqsbgh|service_role|sendWhatsapp/);
});
test("Tasks and reports persist or count tenant data and do not invent demo metrics",()=>{
 const tasks=read("components/family-power-tasks.tsx");
 const reports=read("components/family-power-reports.tsx");
 const ws=read("components/crm-workspace.tsx");
 assert.match(tasks,/from\("tasks"\)/);
 assert.match(tasks,/\.insert\(\{\s*tenant_id:tenantId/);
 assert.match(tasks,/status:"done",completed_at:evidence\.verified_at/);
 assert.match(tasks,/\.eq\("tenant_id",tenantId\)/);
 assert.match(reports,/\.select\("id",\{head:true,count:"exact"\}\)\.eq\("tenant_id",tenantId\)/);
 assert.match(ws,/<FamilyPowerTasks tenantId=\{tenantId\}\s*\/>/);
 assert.match(ws,/<FamilyPowerReports tenantId=\{tenantId\}\s*\/>/);
});
test("Family Power quotation uses contact, verified products and correct printable brand",()=>{
 const ws=read("components/crm-workspace.tsx");
 assert.match(ws,/contact_id: family\?\(contactId\|\|null\):null/);
 assert.match(ws,/verification_status==="approved"/);
 assert.match(ws,/safe\(brand\?\.name\?\?activeTenant\?\.tenant_name/);
 assert.doesNotMatch(ws,/<h1>Sublimaciones Lazala<\/h1>/);
});

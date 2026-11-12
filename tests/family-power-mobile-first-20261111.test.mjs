import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const get=(path)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const ws=get("components/crm-workspace.tsx");
const css=get("app/globals.css");
const insights=get("components/family-power-executive-insights.tsx");
const ml=get("components/crm-ml-hub.tsx");
test("Family Power shell switches to full-width responsive mode even for mobile desktop-site viewport",()=>{
 assert.match(ws,/data-family-mobile=\{isFamilyPower\?"true":undefined\}/);
 assert.match(css,/@media\(max-width:1100px\)/);
 assert.match(css,/\.shell\[data-family-mobile="true"\]>\.sidebar\{display:none\}/);
 assert.match(css,/\.shell\[data-family-mobile="true"\]>\.mobile-nav\{display:flex/);
 assert.match(css,/\.shell\[data-family-mobile="true"\]>.content\{min-width:0;width:100%/);
});
test("compact Family Power menu reuses the permission-filtered navigation and does not reveal links to other tenants",()=>{
 assert.match(ws,/isFamilyPower&&<details className="family-power-more-menu"/);
 assert.match(ws,/permittedNav\.map\(\(\[key,label,Icon\]\)=>/);
 assert.match(ws,/aria-label="Navegación móvil de Family Power"/);
 assert.match(ws,/closest\("details"\)\?\.removeAttribute\("open"\)/);
 assert.match(css,/\.family-power-more-menu nav a\[aria-current="page"\]/);
 assert.match(ws,/if\(!familyMenuPermissions\)return false/);
 assert.match(ws,/if\(\["pagos","finanzas","seguridad-instalaciones"\]\.includes\(key\)/);
});
test("empty dashboards show actionable real workflow before empty graphs",()=>{
 assert.match(insights,/allZero&&!loading\?<section className=\{styles\.firstSteps\}/);
 assert.match(insights,/href="\/crm\/contacts"/);
 assert.match(insights,/href="\/crm\/products"/);
 assert.match(insights,/href="\/crm\/quotations"/);
 assert.match(insights,/Sin un registro|Sin datos|registros|operación/i);
 assert.match(insights,/ResponsiveContainer/);
 assert.match(insights,/eq\("tenant_id",tenantId\)/);
 assert.doesNotMatch(insights,/fakeSales|mockPayments|demoAmount/);
});
test("ML remains honest on zero history and governance stays available on request",()=>{
 assert.match(ml,/!hasOperationalData\?<section className=\{styles\.emptySetup\}/);
 assert.match(ml,/Link href="\/crm\/revenue"/);
 assert.match(ml,/Link href="\/crm\/contacts"/);
 assert.match(ml,/showEmptyQuality/);
 assert.match(ml,/<CrmMlGovernance tenantId=\{tenantId\}/);
 assert.match(ml,/sin enviar mensajes ni cambiar registros automáticamente/);
});

import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";
const read=(path)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const entry=read("components/empresia-erp-overview.tsx");
const fp=read("components/family-power-erp-control.tsx");
const css=read("components/family-power-erp-control.module.css");
test("the existing native ERP remains untouched for every other tenant",()=>{
 assert.match(entry,/tenant\.tenant_slug === "family-power"/);
 assert.match(entry,/<FamilyPowerErpControl \/>/);
 assert.match(entry,/Inventario y ventas dentro de la misma sesión/);
 assert.match(entry,/\/crm\/inventory/);
});
test("Family Power ERP cockpit only uses tenant-scoped real CRM data",()=>{
 assert.match(fp,/tenant\?\.tenant_slug!=="family-power"/);
 assert.match(fp,/\.eq\("tenant_id",tenantId\)/);
 for(const table of ["quotations","orders","production_jobs","deliveries","customer_payments","products","inventory_items","tasks"]){
  assert.ok(fp.includes('supabase.from("'+table+'")'),table);
 }
 assert.doesNotMatch(fp,/Math\.random|mockData|fakeOrder|fakeRevenue/);
 assert.match(fp,/No fue posible consultar el ERP/);
 assert.match(fp,/no se mostrarán como cero/);
});
test("inventory readiness requires warehouses and stock-location tables",()=>{
 assert.match(fp,/supabase\.from\("inventory_warehouses"\)/);
 assert.match(fp,/supabase\.from\("inventory_stock_locations"\)/);
 assert.match(fp,/warehouses:!r\[8\]\.error&&!r\[9\]\.error/);
 assert.match(fp,/Estructura pendiente/);
 assert.match(fp,/Integración pendiente/);
});
test("no fictitious profit, transactions, product prices or installation milestones",()=>{
 assert.match(fp,/x\.metadata\?\.verification_status!=="approved"/);
 assert.match(fp,/Number\(x\.sale_price\)<=0/);
 assert.match(fp,/no ha registrado cotizaciones, pedidos, trabajos, entregas ni pagos/);
 assert.match(fp,/no generan ventas, pagos, existencias ni facturas ficticias|no genera ventas, pagos, existencias ni facturas ficticias/);
 assert.match(fp,/link:"\/crm\/finanzas"/);
 assert.match(fp,/href="\/crm\/products"/);
 assert.match(fp,/link:"\/crm\/inventory"/);
});
test("ERP dashboard is responsive and reuses actual module links",()=>{
 assert.match(css,/@media\(max-width:730px\)/);
 assert.match(css,/@media\(max-width:395px\)/);
 assert.match(css,/grid-template-columns/);
 assert.match(fp,/ResponsiveContainer/);
 assert.match(fp,/\/crm\/operations/);
 assert.match(fp,/\/crm\/quotations/);
});

import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("100+ unique sourced competitor pages and actionable comparison",()=>{
 const doc=read("docs/empresia-competitor-101-page-benchmark.md");
 const entries=[...doc.matchAll(/^- \d{3}\. \[[^\]]+\]\((https:\/\/[^)]+)\)/gm)].map(x=>x[1]);
 assert.equal(entries.length,101,"100-plus comparable URL entries expected");
 assert.equal(new Set(entries.map(x=>x.replace(/\/$/,"").toLowerCase())).size,101,"URLs must be unique");
 assert.match(doc,/modelo comercial/i);
 assert.match(doc,/no.*auditoría visual/i);
});
test("sales site prioritizes business outcomes with official brand and visible product",()=>{
 const s=read("app/aurevector/sales-page.tsx");
 assert.match(s,/De cada conversación/);
 assert.match(s,/Representación ilustrativa/);
 assert.match(s,/empresia-logo\.svg/);
 assert.match(s,/\/empresia\/start/);
 for(const x of ['id="sistema"','id="funciones"','id="preguntas"','id="diagnostico"'])assert.ok(s.includes(x),x);
 assert.doesNotMatch(s,/LOOK SOCIAL MEDIA/);
});
test("each public plan has a guarded PayPal recurring checkout with exact USD price",()=>{
 const p=read("app/aurevector/pricing.tsx");
 const c=read("app/aurevector/pricing-cta.tsx");
 assert.match(p,/<PricingCTA plan={plan\.key}\/>/);
 assert.match(p,/price:"80"/);
 assert.match(p,/price:"460"/);
 assert.match(p,/price:"800"/);
 assert.match(c,/essential:8000,growth:46000,scale:80000/);
 assert.match(c,/\.eq\("status","published"\)/);
 assert.match(c,/o\?\.kind==="monthly"/);
 assert.match(c,/paypal_plan_id/);
 assert.match(c,/\/empresia\/checkout\?offer=/);
 assert.match(c,/state==="ready"/);
 assert.match(c,/Suscripción PayPal en preparación/);
 assert.doesNotMatch(c,/ncp\/payment|PLB-|www\.paypal\.com\/ncp/);
});
test("the recurring PayPal return uses a single canonical Empresia domain",()=>{
 const edge=read("supabase/functions/empresia-commerce/index.ts");
 assert.match(edge,/const origin="https:\/\/portal-empresia\.vercel\.app";/);
 assert.match(edge,/return_url:origin\+"/);
 assert.match(edge,/cancel_url:origin\+"/);
 assert.doesNotMatch(edge,/https:\/\/crm-look\.vercel\.app/);
});
test("all /empresia pages have the same visual scope and official logos",()=>{
 const layout=read("app/empresia/layout.tsx");
 const theme=read("app/empresia/empresia-brand.css");
 const css=read("app/aurevector/aurevector.module.css");
 const start=read("app/aurevector/start/ai-onboarding.tsx");
 const pilot=read("app/empresia/soluciones/page.tsx");
 for(const page of ["app/empresia/checkout/page.tsx","app/empresia/tienda/page.tsx"]){
   assert.match(read(page),/empresia-logo\.svg/);
 }
 assert.match(layout,/empresia-brand-scope/);
 assert.match(theme,/--brand-blue:#315bff/);
 assert.match(css,/#315bff/);
 assert.match(start,/empresia-logo\.svg/);
 assert.match(pilot,/empresia-logo\.svg/);
});

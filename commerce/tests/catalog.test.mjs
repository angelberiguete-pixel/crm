import {readFileSync} from "node:fs";
import test from "node:test";import assert from "node:assert/strict";import {DEMO_PRODUCTS,LABELS} from "../lib/catalog.js";
test("15 complete demo offerings",()=>{assert.equal(DEMO_PRODUCTS.length,15);assert.equal(new Set(DEMO_PRODUCTS.map(p=>p.id)).size,DEMO_PRODUCTS.length);for(const p of DEMO_PRODUCTS){assert.ok(LABELS[p.category]);assert.equal(p.currency,"USD");assert.ok(p.price_cents>=100);assert.equal(p.published,false);}});
test("service prices exactly match the launch proposal",()=>{const prices=[1500,1900,2500,2900,3500,3900,4500,4900,7900,8900,9900];assert.deepEqual(DEMO_PRODUCTS.filter(p=>p.category==="servicio").map(p=>p.price_cents),prices);});

test("guest storefront has no public signup or login CTA",()=>{const p=readFileSync(new URL("../app/page.jsx",import.meta.url),"utf8");assert.doesNotMatch(p,/signUp|Crea tu cuenta|Iniciar sesión|Regístrate/);assert.match(p,/Sin registro ni contraseña/);});

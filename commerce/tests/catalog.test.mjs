import {readFileSync} from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import {DEMO_PRODUCTS,LABELS,LAUNCH_PRICES} from "../lib/catalog.js";

test("catálogo LATAM consistente y sin ofertas publicadas por accidente",()=>{
 assert.equal(DEMO_PRODUCTS.length,17);
 assert.equal(new Set(DEMO_PRODUCTS.map(p=>p.id)).size,DEMO_PRODUCTS.length);
 for(const p of DEMO_PRODUCTS){
  assert.ok(LABELS[p.category]);
  assert.equal(p.currency,"USD");
  assert.ok(p.price_cents>=100);
  assert.equal(p.published,false);
  assert.equal(LAUNCH_PRICES[p.id],p.price_cents);
 }
});

test("CV Express no supera US$5 y el acompañamiento laboral tiene alcance distinto",()=>{
 assert.equal(DEMO_PRODUCTS.find(p=>p.id==="cv-pro").price_cents,490);
 const plus=DEMO_PRODUCTS.find(p=>p.id==="postulacion-plus");
 assert.equal(plus.price_cents,2490);
 assert.match(plus.description,/No garantizamos entrevistas/);
});

test("comercio sin registro de compradores ni pasarela falsa",()=>{
 const page=readFileSync(new URL("../app/page.jsx",import.meta.url),"utf8");
 assert.doesNotMatch(page,/signUp|Crea tu cuenta|Iniciar sesi[oó]n|Regístrate/);
 assert.match(page,/Sin registro ni contraseña/);
 assert.match(page,/checkoutReady/);
});

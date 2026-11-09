import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = p => readFileSync(new URL("../"+p, import.meta.url), "utf8");
const page = read("app/empresia/page.tsx");
const form = read("app/empresia/empresia-demo-form.tsx");
const css = read("app/empresia/empresia-landing.module.css");

test("Empresia has its own commercial landing without changing tenant entry",()=>{
  assert.match(page,/EMPRESIA/);
  assert.match(page,/Solicitar evaluación gratuita/);
  assert.match(page,/id="evaluacion"/);
  assert.match(page,/EmpresiaDemoForm/);
  assert.match(page,/href="\/acceso-crm"/);
  assert.doesNotMatch(page,/LOOK SOCIAL MEDIA/);
  assert.match(css,/@media\(max-width:520px\)/);
});

test("pilot pricing is explicitly indicative and does not trigger checkout",()=>{
  assert.match(page,/US\$99/);
  assert.match(page,/US\$197/);
  assert.match(page,/Precio orientativo/);
  assert.match(page,/no constituye una oferta de compra automática/);
  assert.doesNotMatch(page,/api\/paypal|paypal\.com\/checkout|functions\.invoke\("paypal/);
});

test("inbound demo only submits with explicit contact approval and cannot market without it",()=>{
  assert.match(form,/name="consent" required/);
  assert.match(form,/consent: true/);
  assert.match(form,/name="email" type="email"/);
  assert.match(form,/required name="email" type="email"/);
  assert.match(form,/name="company_website_check"/);
  assert.match(form,/started_at: startedAt/);
  assert.match(form,/look-social-media-lead-capture/);
  assert.match(form,/Esto no me suscribe automáticamente a campañas promocionales/);
  assert.doesNotMatch(form,/send_bulk|sendEmailCampaign|service_role|NEXT_PUBLIC_SERVICE_ROLE/);
});

test("avoid claiming automation or analytics that have not been demonstrated",()=>{
  assert.match(page,/Representación ilustrativa/);
  assert.match(page,/requieren activación, permisos y pruebas adicionales/);
  assert.match(form,/El envío no activa automáticamente un contrato/);
  assert.match(page,/a href="#evaluacion"/);
});

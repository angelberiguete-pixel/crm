import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../app/checkout/dr-emerson-familia/page.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../app/checkout/dr-emerson-familia/page.module.css", import.meta.url), "utf8");

test("checkout links only to the intended PayPal invoice, not a second payment link", () => {
  assert.match(page, /https:\/\/www\.paypal\.com\/invoice\/p\/#HSYZR25YC89AXNJ5/);
  assert.doesNotMatch(page, /paypal\.com\/ncp\/payment/);
});

test("checkout identifies the recipient, service and invoice amount", () => {
  for (const item of ["Dr. Emerson Familia", "US$197.00", "Factura #0002", "Implementación de Solución Tecnológica e Inteligencia Artificial"]) {
    assert.ok(page.includes(item), "Missing: " + item);
  }
});

test("personalized checkout is not indexed and does not collect payment credentials", () => {
  assert.match(page, /index: false/);
  assert.match(page, /nocache: true/);
  assert.doesNotMatch(page, /<input|<form|type=["']password/);
  assert.match(page, /La opción de pagar con tarjeta sin/);
});

test("includes mobile layout and visible keyboard focus", () => {
  assert.match(styles, /max-width: 540px/);
  assert.match(styles, /focus-visible/);
});

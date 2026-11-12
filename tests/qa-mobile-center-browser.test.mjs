// Browser smoke test for the isolated evidence cockpit; no backend or production fixtures.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const base = "http://127.0.0.1:3249";
const server = spawn(process.execPath,
  ["node_modules/next/dist/bin/next", "start", "-p", "3249", "-H", "127.0.0.1"],
  { stdio: ["ignore", "ignore", "inherit"],
    env: { ...process.env, VERCEL_ENV: "preview", EMPRESIA_QA_CENTER_ENABLED: "true" } });
let browser;
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { ready = (await fetch(base + "/qa/mobile", { signal: AbortSignal.timeout(1000) })).ok; if (ready) break; }
    catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(ready, "QA route must be reachable only when preview flag is explicit");
  browser = await chromium.launch({ headless: true, channel: "chromium" });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  let productionCalls = 0;
  await context.route("https://ygipjqgyreeahslzorik.supabase.co/**", route => {
    productionCalls++;
    return route.abort();
  });
  const page = await context.newPage();
  await page.goto(base + "/qa/mobile");
  await page.getByRole("heading", { name: "Pruebas móviles de Empresia" }).waitFor();
  assert.ok(await page.getByText("Salida a beta bloqueada").isVisible());
  await page.getByRole("button", { name: /QA-06.*Propietario y cliente/ }).click();
  await page.getByText("No certificable todavía").waitFor();
  await page.waitForFunction(() => document.querySelector('form option[value="aprobada"]')?.hasAttribute("disabled") === true);
  assert.equal(await page.locator('form option[value="aprobada"]').getAttribute("disabled"), "", "real auth cannot be passed");
  await page.getByRole("button", { name: /QA-01.*Selección explícita/ }).click();
  await page.getByLabel("Resultado", { exact: true }).selectOption("bloqueada");
  await page.getByLabel("Resultado observado / motivo").fill("Bloqueada a falta de un registro de CI que corresponda al SHA probado.");
  await page.getByRole("button", { name: "Guardar resultado local" }).click();
  await page.getByRole("status").getByText(/Resultado registrado/).waitFor();
  await page.reload();
  await page.getByRole("button", { name: /QA-01.*Selección explícita/ }).getByText("Bloqueada", { exact: true }).waitFor();
  assert.ok((await page.getByRole("button", { name: /QA-01.*Selección explícita/ }).innerText()).includes("Bloqueada"));
  const dims = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  assert.ok(dims.document <= dims.viewport + 1, "QA page has no Android horizontal overflow");
  const forbidden = await page.goto(base + "/crm");
  assert.equal(forbidden?.status(), 404, "QA preview blocks real CRM routes");
  assert.equal(productionCalls, 0, "QA panel must never call production Supabase");
  console.log("PASS: local-only mobile checklist, impossible real approval, storage persistence, responsive and no production requests.");
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
}

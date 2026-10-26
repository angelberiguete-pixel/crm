// Auth outage path is simulated. No real credentials, database or tenant records are used.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const base = process.env.CRM_LOGIN_TEST_BASE_URL || "http://127.0.0.1:3176";
const server = process.env.CRM_LOGIN_TEST_BASE_URL ? null : spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "-p", "3176", "-H", "127.0.0.1"],
  { stdio: ["ignore", "ignore", "inherit"] },
);
let browser;

try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { ready = (await fetch(base + "/login", { signal: AbortSignal.timeout(1000) })).ok; if (ready) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(ready, "Next.js auth page serves HTML");
  browser = await chromium.launch({ headless: true,
    ...(process.env.CRM_TEST_CHROMIUM_PATH
      ? { executablePath: process.env.CRM_TEST_CHROMIUM_PATH, args: ["--no-sandbox", "--disable-dev-shm-usage"] }
      : { channel: "chromium" }),
  });

  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 850 } });
    await context.route("https://ygipjqgyreeahslzorik.supabase.co/**", async route => {
      if (route.request().url().includes("/auth/v1/token")) {
        await route.abort("failed");
      } else {
        await route.abort("failed");
      }
    });
    const page = await context.newPage();
    await page.goto(base + "/login");
    await mkdir("artifacts/login-qa", { recursive: true });
    await page.screenshot({ path: `artifacts/login-qa/login-ready-${width}.png`, fullPage: true });
    await page.getByLabel("Email").fill("qa@example.invalid");
    await page.getByLabel("Contraseña").fill("qa-test-password-123");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.getByText(/No se pudo conectar al servicio de acceso del CRM/).waitFor({ timeout: 15000 });
    assert.equal(await page.getByText("Failed to fetch").count(), 0, "raw errors must not leak into UI");
    assert.equal(await page.getByRole("button", { name: "Entrar", exact: true }).isDisabled(), false, "login button recovers");
    const geometry = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > window.innerWidth,
      logoWidth: document.querySelector(".look-brand-logo--login")?.getBoundingClientRect().width,
      imageVisible: document.querySelector(".look-brand-logo--login img")?.getBoundingClientRect().height > 0,
    }));
    assert.ok(!geometry.overflow, "mobile/desktop should not overflow horizontally");
    assert.ok(geometry.logoWidth > 80 && geometry.logoWidth <= 181, "embedded 220 px source must not be stretched");
    assert.ok(geometry.imageVisible, "official logo remains present");
    await page.screenshot({ path: `artifacts/login-qa/offline-message-${width}.png`, fullPage: true });
    await context.close();
  }
  console.log("PASS offline login UI, controlled 390/1440 layouts, official unaltered brand image.");
} finally {
  if (browser) await browser.close();
  if (server) server.kill();
}

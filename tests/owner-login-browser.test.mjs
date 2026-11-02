// Regression: a platform owner locked into a client must not be sent back to
// that client by the shared login. Supabase responses are stubbed; no real data.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const base = process.env.CRM_BROWSER_TEST_BASE_URL || "http://127.0.0.1:3174";
const server = process.env.CRM_BROWSER_TEST_BASE_URL ? null :
  spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3174", "-H", "127.0.0.1"], { stdio: ["ignore", "ignore", "inherit"] });
let browser;
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { ready = (await fetch(base + "/login", { signal: AbortSignal.timeout(1000) })).ok; if (ready) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(ready, "CRM web server must be ready");
  browser = await chromium.launch({ headless: true, ...(process.env.CRM_TEST_PROXY_URL
    ? { proxy: { server: process.env.CRM_TEST_PROXY_URL } }
    : { channel: "chromium" }) });
  const user = { id: "11111111-1111-4111-8111-111111111111", aud: "authenticated",
    role: "authenticated", email: "owner@example.invalid",
    app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  const token = [
    Buffer.from("{}").toString("base64url"),
    Buffer.from(JSON.stringify({ sub: user.id, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url"),
    "test-signature"
  ].join(".");
  const context = await browser.newContext({ viewport: { width: 390, height: 844 },
    isMobile: true, hasTouch: true, ignoreHTTPSErrors: Boolean(process.env.CRM_TEST_PROXY_URL) });
  let platformOwner = false;
  await context.addInitScript(({ user, token }) => {
    localStorage.setItem("sb-ygipjqgyreeahslzorik-auth-token", JSON.stringify({
      access_token: token, refresh_token: "qa-refresh",
      expires_at: Math.floor(Date.now()/1000)+3600, expires_in: 3600,
      token_type: "bearer", user
    }));
  }, { user, token });
  await context.route("https://ygipjqgyreeahslzorik.supabase.co/**", async route => {
    const url = new URL(route.request().url());
    let response = [];
    if (url.pathname.endsWith("/platform_current_access")) response = { is_platform_admin: platformOwner };
    else if (url.pathname.endsWith("/user")) response = user;
    else if (url.pathname.endsWith("/token")) response = {
      access_token: token, refresh_token: "qa-refresh-2", token_type: "bearer",
      expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+3600, user
    };
    await route.fulfill({ status: 200, contentType: "application/json",
      headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(response) });
  });

  const page = await context.newPage();
  await page.goto(base + "/look-social-media");
  assert.equal(await page.getByRole("link", { name: "Acceso CRM", exact: true }).getAttribute("href"),
    "/login", "public access must go through login");

  await page.goto(base + "/login");
  await page.getByRole("button", { name: "Cerrar sesión de empresa para entrar como propietario" }).waitFor();
  assert.equal(new URL(page.url()).pathname, "/login",
    "a client-locked session must not silently redirect back to Family Power");
  await page.getByRole("button", { name: "Cerrar sesión de empresa para entrar como propietario" }).click();
  await page.getByText("Sesión anterior cerrada.", { exact: false }).waitFor();
  platformOwner = true;
  await page.getByLabel("Email").fill("owner@example.invalid");
  await page.getByLabel("Contraseña").fill("test-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("**/mis-empresas");
  assert.equal(new URL(page.url()).pathname, "/mis-empresas",
    "a verified platform owner goes to the company portfolio");

  console.log("PASS: public login entry, locked client session exit, and owner portfolio routing (mocked Supabase).");
} finally {
  if (browser) await browser.close();
  if (server) server.kill();
}

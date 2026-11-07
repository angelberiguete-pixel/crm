// Controlled browser verification: mock CRM auth and OpenReply HTTP responses;
// no real provider keys, Instagram accounts or messages.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const base = process.env.CRM_BROWSER_TEST_BASE_URL || "http://127.0.0.1:3214";
const server = process.env.CRM_BROWSER_TEST_BASE_URL ? null : spawn(process.execPath,
  ["node_modules/next/dist/bin/next", "start", "-p", "3214", "-H", "127.0.0.1"], { stdio: ["ignore", "ignore", "inherit"] });
let browser;
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { ready = (await fetch(base + "/login", { signal: AbortSignal.timeout(1000) })).ok; if (ready) break; } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  assert.ok(ready, "CRM server starts");
  browser = await chromium.launch({ headless: true, ...(process.env.CRM_TEST_CHROMIUM_PATH ? { executablePath: process.env.CRM_TEST_CHROMIUM_PATH, args: ["--no-sandbox", "--disable-dev-shm-usage"] } : { channel: "chromium" }) });
  const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", F = "ffffffff-ffff-4fff-8fff-ffffffffffff";
  const user = { id: "11111111-1111-4111-8111-111111111111", aud: "authenticated", role: "authenticated", email: "owner@example.invalid", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  const token = [Buffer.from("{}").toString("base64url"), Buffer.from(JSON.stringify({ sub: user.id, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url"), "qa"].join(".");
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(({ user, token }) => localStorage.setItem("sb-ygipjqgyreeahslzorik-auth-token", JSON.stringify({ access_token: token, refresh_token: "qa", expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: "bearer", user })), { user, token });
  let active = A, mode = "missing", deferStats = false, releaseStats, statsArrived;
  const calls = [];
  await ctx.route("https://ygipjqgyreeahslzorik.supabase.co/**", async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    const body = req.postDataJSON?.() ?? {}, tenant = body.p_tenant_id ?? active;
    let result = [];
    if (path.endsWith("/list_my_tenants")) result = [
      { tenant_id: A, tenant_name: "Empresa Uno", tenant_slug: "empresa-uno", membership_role: "owner", is_active: active === A },
      { tenant_id: B, tenant_name: "Empresa Dos", tenant_slug: "empresa-dos", membership_role: "owner", is_active: active === B },
      { tenant_id: F, tenant_name: "Family Power", tenant_slug: "family-power", membership_role: "owner", is_active: active === F },
    ];
    else if (path.endsWith("/set_active_tenant")) { active = body.p_tenant_id; result = { tenant_id: active }; }
    else if (path.endsWith("/tenant_current_permissions")) result = { all: true };
    else if (path.endsWith("/tenant_effective_modules")) result = [{ module_key: "settings", enabled: true }];
    else if (path.endsWith("/tenant_integration_health")) result = { tenant_id: tenant, whatsapp_verified_route: false, ai_spending_blocked: true, staff_profiles: 0, channels: [] };
    else if (path.endsWith("/openreply_bridge_status")) result = { tenant_id: tenant, routes: [], received_events: tenant === A ? 3 : 0, draft_quotes: tenant === A ? 1 : 0, last_received_at: null };
    else if (path.endsWith("/user")) result = user;
    else if (path.endsWith("/tenant_settings")) result = null;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(result), headers: { "access-control-allow-origin": "*" } });
  });
  await ctx.route("**/api/integrations/openreply?**", async route => {
    const req = route.request(), params = new URL(req.url()).searchParams, tenantId = params.get("tenantId");
    assert.equal(req.method(), "GET", "integration cannot mutate campaigns");
    assert.equal(req.headers().authorization, "Bearer " + token);
    calls.push({ tenantId, campaignId: params.get("campaignId") });
    if (mode === "failure") return route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "provider_key_rejected" }) });
    const common = { tenantId, state: mode === "missing" || tenantId === B ? "not_configured" : "connected_readonly", dashboardUrl: null, checkedAt: new Date().toISOString() };
    if (params.has("campaignId")) {
      if (deferStats) { statsArrived?.(); await new Promise(r => { releaseStats = r; }); }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...common, stats: { campaignId: "campaign-a", sent: 7, failed: 1, pending: 2, skipped: 3, rawClicks: 19 } }) }).catch(() => undefined);
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...common, campaigns: common.state === "not_configured" ? [] : [{ id: "campaign-a", name: "Catálogo Empresa Uno", isActive: true, keywords: ["CATÁLOGO"] }] }) });
  });
  const page = await ctx.newPage();
  await page.goto(base + "/crm/integrations");
  const panel = page.getByRole("region", { name: "Automatización de Instagram con OpenReply" });
  await panel.getByText("OpenReply todavía no está conectado a esta empresa.").waitFor();
  await panel.getByText("Pendiente de autorizar Instagram y verificar la cuenta de esta empresa.", { exact: false }).waitFor();
  assert.equal(await panel.getByLabel("Eventos comerciales recibidos").getByText("3", { exact: true }).count(), 1);
  await panel.getByLabel("Comentario de prueba").fill("Quiero COTIZACION por favor 🙌");
  await panel.getByRole("button", { name: "Probar coincidencia" }).click();
  assert.match(await panel.getByRole("status").innerText(), /COTIZACIÓN/);
  await panel.getByLabel("Comentario de prueba").fill("precios");
  await panel.getByRole("button", { name: "Probar coincidencia" }).click();
  assert.match(await panel.getByRole("status").innerText(), /Sin coincidencia/);
  await panel.getByLabel("Coincidir con palabras completas").uncheck();
  await panel.getByRole("button", { name: "Probar coincidencia" }).click();
  assert.match(await panel.getByRole("status").innerText(), /PRECIO/);
  assert.equal(calls.length, 1, "simulator does not call any API");
  mode = "connected";
  await panel.getByRole("button", { name: "Actualizar campañas" }).click();
  await panel.getByText("API de campañas verificada", { exact: true }).waitFor();
  await panel.getByRole("button", { name: "Ver resultados de Catálogo Empresa Uno" }).click();
  await panel.getByRole("region", { name: "Resultados de la campaña" }).waitFor();
  assert.ok(await panel.getByText("19", { exact: true }).isVisible());
  assert.ok(await panel.getByText("No representan personas únicas ni ventas.", { exact: false }).isVisible());
  const size = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: innerWidth }));
  assert.ok(size.scroll <= size.inner + 2, "390px panel fits: " + JSON.stringify(size));
  mode = "failure";
  await panel.getByRole("button", { name: "Actualizar campañas" }).click();
  await panel.getByRole("alert").waitFor();
  assert.equal(await panel.getByText("API de campañas verificada", { exact: true }).count(), 0);
  mode = "connected";
  await panel.getByRole("button", { name: "Actualizar campañas" }).click();
  await panel.getByRole("button", { name: "Ver resultados de Catálogo Empresa Uno" }).waitFor();
  // Resolve a delayed A response after the entire tenant context has changed.
  deferStats = true;
  const statsStarted = new Promise(r => { statsArrived = r; });
  await panel.getByRole("button", { name: "Ver resultados de Catálogo Empresa Uno" }).click();
  await statsStarted;
  await page.getByLabel("Empresa activa").selectOption(B);
  await panel.getByText("OpenReply todavía no está conectado a esta empresa.").waitFor();
  releaseStats?.();
  assert.equal(await panel.getByText("Catálogo Empresa Uno", { exact: true }).count(), 0);
  assert.equal(await panel.getByRole("region", { name: "Resultados de la campaña" }).count(), 0);
  assert.equal(calls.at(-1).tenantId, B);
  assert.equal(await panel.getByLabel("Eventos comerciales recibidos").getByText("3", { exact: true }).count(), 0, "previous company's event count is cleared");
  const beforeFamily = calls.length;
  await page.getByLabel("Empresa activa").selectOption(F);
  await page.getByRole("heading", { name: "Integraciones", exact: true }).waitFor();
  assert.equal(await panel.count(), 0, "Family Power does not render or query the new integration");
  assert.equal(calls.length, beforeFamily);
  console.log("PASS: OpenReply missing/connected/error states, Spanish simulator, native metrics, 390px layout, company isolation and Family Power exclusion (mocked services).");
} finally { if (browser) await browser.close(); if (server) server.kill("SIGTERM"); }

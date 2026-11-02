#!/usr/bin/env node
/**
 * Real HTTP MCP pilot, no LLM costs or data changes.
 * Two independently authenticated, pre-existing TEST accounts are required.
 * Never store real JWTs in code/CI logs or share customer records.
 */
import assert from "node:assert/strict";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VERSION = "2025-11-25";
const keys = [
  "MCP_PILOT_URL", "MCP_PILOT_FAMILY_TOKEN", "MCP_PILOT_OTHER_TOKEN",
  "MCP_PILOT_FAMILY_TENANT_ID", "MCP_PILOT_OTHER_TENANT_ID"
];

export function validateConfiguration(env) {
  const missing = keys.filter((key) => !env[key]);
  if (missing.length) throw Error("Faltan variables: " + missing.join(", "));
  const url = new URL(env.MCP_PILOT_URL);
  const allowed = url.protocol === "https:" && url.hostname.endsWith(".vercel.app");
  const local = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  if ((!allowed && !local) || url.pathname !== "/api/mcp" || url.search || url.hash ||
      url.username || url.password) throw Error("Utiliza únicamente el MCP de una vista previa de Vercel o localhost.");
  if (!UUID.test(env.MCP_PILOT_FAMILY_TENANT_ID) || !UUID.test(env.MCP_PILOT_OTHER_TENANT_ID) ||
      env.MCP_PILOT_FAMILY_TENANT_ID === env.MCP_PILOT_OTHER_TENANT_ID) {
    throw Error("Se requieren dos empresas con UUID distintos.");
  }
  if (env.MCP_PILOT_FAMILY_TOKEN === env.MCP_PILOT_OTHER_TOKEN) {
    throw Error("Las dos pruebas deben utilizar usuarios y tokens distintos.");
  }
  return url.toString();
}

export function createMcpClient(url, token, options = {}) {
  let nextId = 1;
  const send = async (method, params) => {
    const id = nextId++;
    const headers = {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
      "Authorization": "Bearer " + token,
      ...(method === "initialize" ? {} : { "MCP-Protocol-Version": VERSION })
    };
    if (options.protectionBypass) headers["x-vercel-protection-bypass"] = options.protectionBypass;
    const response = await (options.fetch ?? fetch)(url, {
      method: "POST", headers,
      body: JSON.stringify({ jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) }),
      signal: AbortSignal.timeout(12000),
      redirect: "error"
    });
    if (!response.ok) {
      throw Error("MCP HTTP " + response.status +
        (response.status === 503 ? " (servidor no habilitado)" : "") +
        (response.status === 401 ? " (revisar token de prueba)" : "") +
        (response.status === 403 ? " (revisar protección y origen)" : ""));
    }
    if (!(response.headers.get("content-type") ?? "").includes("application/json")) {
      throw Error("La respuesta MCP no es JSON.");
    }
    const result = await response.json();
    if (result.jsonrpc !== "2.0" || result.id !== id || result.error) {
      throw Error("Respuesta MCP inválida: " + (result.error?.message ?? "identificador incorrecto"));
    }
    return result.result;
  };
  return {
    initialize: () => send("initialize", {
      protocolVersion: VERSION, capabilities: {},
      clientInfo: { name: "angel-beriguete-mcp-test-agent", version: "0.1.0" }
    }),
    tools: () => send("tools/list", {}),
    call: (name, args = {}) => send("tools/call", { name, arguments: args })
  };
}

function contentJson(answer) {
  assert.ok(answer && Array.isArray(answer.content) && answer.content[0]?.type === "text",
    "No hay respuesta de herramienta MCP");
  return JSON.parse(answer.content[0].text);
}

function expectDenied(answer) {
  assert.equal(answer.isError, true, "¡FALLO DE AISLAMIENTO! El MCP no denegó la operación cruzada.");
  const data = contentJson(answer);
  assert.ok(typeof data.error === "string", "La denegación no explica su motivo.");
}

export async function runPilot(env, dependencies = {}) {
  const url = validateConfiguration(env);
  const settings = { protectionBypass: env.MCP_PILOT_VERCEL_BYPASS, ...dependencies };
  const family = createMcpClient(url, env.MCP_PILOT_FAMILY_TOKEN, settings);
  const other = createMcpClient(url, env.MCP_PILOT_OTHER_TOKEN, settings);
  const familyTenant = env.MCP_PILOT_FAMILY_TENANT_ID;
  const otherTenant = env.MCP_PILOT_OTHER_TENANT_ID;
  const output = [];

  for (const [name, client] of [["family", family], ["other", other]]) {
    const greeting = await client.initialize();
    assert.equal(greeting.protocolVersion, VERSION, name + ": protocolo inesperado");
    const catalog = await client.tools();
    const tools = catalog.tools.map((t) => t.name);
    assert.ok(tools.includes("crm.get_workspace_context"), name + ": falta acceso al contexto");
    assert.ok(tools.includes("crm.list_contacts"), name + ": faltan contactos");
    const contextResult = await client.call("crm.get_workspace_context");
    assert.notEqual(contextResult.isError, true, name + ": no hay empresa activa");
    const context = contentJson(contextResult);
    const expectedId = name === "family" ? familyTenant : otherTenant;
    const expectedSlug = name === "family" ? "family-power" : env.MCP_PILOT_OTHER_SLUG;
    assert.equal(context.company.tenant_id, expectedId, name + ": empresa activa equivocada");
    if (expectedSlug) assert.equal(context.company.tenant_slug, expectedSlug);
    output.push({ account: name, tenant_verified: true, tool_count: tools.length });
  }

  // Positive: Family Power is readable with its own user's permissions.
  const ownFamily = await family.call("crm.list_contacts", { tenant_id: familyTenant, limit: 1 });
  assert.notEqual(ownFamily.isError, true, "Family Power: lectura legítima denegada");
  const familyData = contentJson(ownFamily);
  assert.equal(familyData.tenant_id, familyTenant);
  assert.ok(Array.isArray(familyData.records));
  assert.ok(familyData.records.every((row) => row.tenant_id === familyTenant),
    "¡FALLO! La respuesta contiene filas de otra empresa.");
  // Negative: Family Power user may not request rows from the other tenant.
  expectDenied(await family.call("crm.list_contacts", { tenant_id: otherTenant, limit: 1 }));

  // Positive: the unrelated company's own account can read its own records.
  const ownOther = await other.call("crm.list_contacts", { tenant_id: otherTenant, limit: 1 });
  assert.notEqual(ownOther.isError, true, "Otra empresa: lectura legítima denegada");
  const otherData = contentJson(ownOther);
  assert.equal(otherData.tenant_id, otherTenant);
  assert.ok(Array.isArray(otherData.records));
  assert.ok(otherData.records.every((row) => row.tenant_id === otherTenant),
    "¡FALLO! La respuesta de la otra empresa incluye datos ajenos.");
  // Negative: other company's credentials cannot read Family Power.
  expectDenied(await other.call("crm.list_contacts", { tenant_id: familyTenant, limit: 1 }));

  return {
    result: "PASS", environment: "preview", isolation: "both_directions",
    checks: output,
    // Counts only, never show customer names, phones, emails, records or tokens.
    own_reads: { family: familyData.count, other: otherData.count }
  };
}

if (process.argv[1] && import.meta.url === new URL("file://" + process.argv[1]).href) {
  runPilot(process.env).then(
    (summary) => { process.stdout.write(JSON.stringify(summary, null, 2) + "\n"); },
    (err) => { process.stderr.write("MCP pilot FAIL: " + err.message + "\n"); process.exitCode = 1; }
  );
}

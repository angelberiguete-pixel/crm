#!/usr/bin/env node
/**
 * Real LLM -> MCP tool-call adapter for an isolated Family Power preview.
 * NEVER sends CRM JWTs, customer records or agent prompts to an LLM provider.
 * Disabled unless explicit opt-in flags and API key are provided.
 * Requires successful two-user isolation pilot before activation.
 *
 * User must run: node scripts/mcp-family-power-pilot.mjs   (PASS)
 * Only then, with separate explicit consent:
 * MCP_AGENT_RUN=YES MCP_AGENT_SEND_CATALOG=YES node scripts/mcp-family-power-agent.mjs
 */
import assert from "node:assert/strict";
import { createMcpClient, validateConfiguration } from "./mcp-family-power-pilot.mjs";

const required = (e, key) => {
  if (!e[key]) throw Error("Falta " + key);
  return e[key];
};

function safeCatalogRow(value) {
  // Only approved, product-facing fields. No email, phone, provider credentials,
  // tenant metadata, private prompts or arbitrary JSON fields.
  return { sku: value.sku, name: value.name, description: value.description,
    currency: value.currency, sale_price: value.sale_price, stock_snapshot: value.stock_snapshot };
}

async function modelResponse(env, input, tools) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    redirect: "error",
    headers: {
      Authorization: "Bearer " + env.OPENAI_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: env.MCP_AGENT_MODEL || "gpt-5.6-terra",
      store: false, parallel_tool_calls: false,
      max_output_tokens: 450,
      tools,
      input
    }),
    signal: AbortSignal.timeout(60000)
  });
  if (!response.ok) throw Error("El proveedor IA devolvió HTTP " + response.status);
  const json = await response.json();
  if (!Array.isArray(json.output)) throw Error("Respuesta del modelo incompleta");
  return json;
}

export async function runReadOnlyAgent(env) {
  if (env.MCP_AGENT_RUN !== "YES" || env.MCP_AGENT_SEND_CATALOG !== "YES") {
    throw Error("Agente deshabilitado: exige MCP_AGENT_RUN=YES y MCP_AGENT_SEND_CATALOG=YES.");
  }
  required(env,"OPENAI_API_KEY");
  validateConfiguration(env); // Two distinct test accounts and preview URL required.
  const mcp = createMcpClient(env.MCP_PILOT_URL, env.MCP_PILOT_FAMILY_TOKEN,
    { protectionBypass: env.MCP_PILOT_VERCEL_BYPASS });
  await mcp.initialize();
  const catalog = await mcp.tools();
  if (!catalog.tools.some((item) => item.name === "crm.list_products")) {
    throw Error("El usuario no tiene habilitada la consulta de productos.");
  }
  const contextResult = await mcp.call("crm.get_workspace_context");
  assert.notEqual(contextResult.isError, true);
  const context = JSON.parse(contextResult.content[0].text);
  assert.equal(context.company.tenant_slug, "family-power");
  assert.equal(context.company.tenant_id, env.MCP_PILOT_FAMILY_TENANT_ID);

  const tools = [{
    type: "function",
    name: "consultar_productos_family_power",
    description: "Consulta hasta 3 productos aprobados por el servidor MCP de Family Power. Solo lectura.",
    strict: true,
    parameters: {
      type: "object", properties: {
        query: { type: "string", description: "Nombre parcial del producto; usa una cadena vacía para listar los más recientes." },
        limit: { type: "integer", description: "Máximo de 1 a 3 productos." }
      }, required: ["query","limit"], additionalProperties: false
    }
  }];
  const prompt = env.MCP_AGENT_PROMPT || "Muéstrame tres productos registrados de Family Power y explica sus precios sin inventarlos.";
  const input = [
    { role: "system", content: "Eres un asistente interno de Family Power, de solo lectura. Nunca ejecutes acciones comerciales ni inventes cifras. Usa solamente consultar_productos_family_power." },
    { role: "user", content: prompt }
  ];
  const first = await modelResponse(env, input, tools);
  const calls = first.output.filter((x) => x.type === "function_call");
  if (calls.length !== 1 || calls[0].name !== "consultar_productos_family_power") {
    throw Error("El modelo no generó la única consulta permitida.");
  }
  let arg;
  try { arg = JSON.parse(calls[0].arguments); }
  catch { throw Error("Argumentos inválidos del modelo."); }
  assert.equal(typeof arg.query, "string");
  assert.ok(Number.isInteger(arg.limit) && arg.limit >= 1 && arg.limit <= 3);
  const params = { tenant_id: context.company.tenant_id, limit: arg.limit };
  if (arg.query.trim()) params.query = arg.query.slice(0,80);
  const toolReply = await mcp.call("crm.list_products", params);
  if (toolReply.isError) throw Error("El MCP denegó la consulta autorizada.");
  const result = JSON.parse(toolReply.content[0].text);
  if (result.tenant_id !== context.company.tenant_id ||
      !Array.isArray(result.records) ||
      result.records.some((record) => record.tenant_id !== context.company.tenant_id)) {
    throw Error("Posible cruce de información entre empresas.");
  }

  // Separate customer-specific consent is needed before this sends catalog data.
  // The two explicit flags above opt in; never send any CRM access tokens.
  const sanitized = result.records.map(safeCatalogRow);
  const next = await modelResponse(env, [
    ...input, ...first.output,
    { type: "function_call_output", call_id: calls[0].call_id,
      output: JSON.stringify({ source: "Family Power", count: sanitized.length, products: sanitized }) }
  ], tools);
  if (next.output.some((x) => x.type === "function_call")) {
    throw Error("El agente alcanzó su límite de una llamada MCP.");
  }
  const answer = next.output.filter((x) => x.type === "message")
    .flatMap((x) => x.content ?? []).filter((x) => x.type === "output_text")
    .map((x) => x.text).join("\n").trim();
  return { agent: "family-power-catalog-readonly", tenant_verified: true,
    mcp_tool_calls: 1, answer };
}

if (process.argv[1] && import.meta.url === new URL("file://" + process.argv[1]).href) {
  runReadOnlyAgent(process.env).then(
    (output) => process.stdout.write(JSON.stringify(output, null, 2) + "\n"),
    (err) => { process.stderr.write("MCP agent FAIL: " + err.message + "\n"); process.exitCode=1; }
  );
}

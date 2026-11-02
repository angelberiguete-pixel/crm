import assert from "node:assert/strict";
import test from "node:test";
import { createMcpClient, runPilot, validateConfiguration } from "../scripts/mcp-family-power-pilot.mjs";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const env = {
  MCP_PILOT_URL: "https://mcp-fake-preview.vercel.app/api/mcp",
  MCP_PILOT_FAMILY_TOKEN: "test-family-token",
  MCP_PILOT_OTHER_TOKEN: "test-other-token",
  MCP_PILOT_FAMILY_TENANT_ID: A, MCP_PILOT_OTHER_TENANT_ID: B,
  MCP_PILOT_OTHER_SLUG: "sublimaciones-lazala"
};

function fakeFetch({ leak = false, denyLegitimate = false } = {}) {
  return async (_url, options) => {
    const req = JSON.parse(options.body);
    const family = options.headers.Authorization === "Bearer " + env.MCP_PILOT_FAMILY_TOKEN;
    const own = family ? A : B;
    const slug = family ? "family-power" : "sublimaciones-lazala";
    let result;
    if (req.method === "initialize") {
      result = { protocolVersion: "2025-11-25", serverInfo: { name: "fixture" }, capabilities: { tools: {} } };
    } else if (req.method === "tools/list") {
      result = { tools: [{ name: "crm.get_workspace_context" }, { name: "crm.list_contacts" }] };
    } else if (req.params?.name === "crm.get_workspace_context") {
      result = { content: [{ type: "text", text: JSON.stringify({
        company: { tenant_id: own, tenant_slug: slug }, read_only_tools: ["crm.list_contacts"] }) }] };
    } else if (req.params?.name === "crm.list_contacts") {
      const id = req.params.arguments.tenant_id;
      const permitted = id === own;
      if (!permitted && !leak || permitted && denyLegitimate) {
        result = { isError: true, content: [{ type: "text", text: JSON.stringify({ error: "denied" }) }] };
      } else {
        result = { content: [{ type: "text", text: JSON.stringify({
          tenant_id: id, records: [{ id: "synthetic", tenant_id: id }], count: 1
        }) }] };
      }
    }
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: req.id, result }), {
      headers: { "Content-Type": "application/json" }, status: 200
    });
  };
}

test("pilot config rejects production domains, identical tokens and identical tenant ids", () => {
  assert.equal(validateConfiguration(env), env.MCP_PILOT_URL);
  assert.throws(() => validateConfiguration({ ...env, MCP_PILOT_URL: "https://crm.example.com/api/mcp" }));
  assert.throws(() => validateConfiguration({ ...env, MCP_PILOT_URL: "https://mcp-fake-preview.vercel.app/other" }));
  assert.throws(() => validateConfiguration({ ...env, MCP_PILOT_OTHER_TOKEN: env.MCP_PILOT_FAMILY_TOKEN }));
  assert.throws(() => validateConfiguration({ ...env, MCP_PILOT_OTHER_TENANT_ID: A }));
  assert.throws(() => validateConfiguration({ ...env, MCP_PILOT_FAMILY_TOKEN: "" }));
});

test("pilot exercises a full MCP handshake and positive/negative tool calls with two identities", async () => {
  const out = await runPilot(env, { fetch: fakeFetch() });
  assert.equal(out.result, "PASS");
  assert.equal(out.isolation, "both_directions");
  assert.equal(out.checks.length, 2);
});

test("pilot FAILS if the MCP leaks a foreign tenant's data", async () => {
  await assert.rejects(runPilot(env, { fetch: fakeFetch({ leak: true }) }), /FALLO DE AISLAMIENTO/);
});

test("pilot FAILS if a legitimate authorized user cannot read their own records", async () => {
  await assert.rejects(runPilot(env, { fetch: fakeFetch({ denyLegitimate: true }) }), /lectura legítima denegada/);
});

test("pilot client must not send a token to redirects", async () => {
  const client = createMcpClient(env.MCP_PILOT_URL, env.MCP_PILOT_FAMILY_TOKEN, {
    fetch: async (_url, args) => {
      assert.equal(args.redirect, "error");
      assert.ok(args.headers.Authorization.startsWith("Bearer "));
      return new Response("", { status: 503 });
    }
  });
  await assert.rejects(client.initialize(), /503/);
});

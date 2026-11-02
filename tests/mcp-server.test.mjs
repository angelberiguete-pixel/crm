import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import {
  MCP_PROTOCOL_VERSION, MCP_DATASETS, MCP_TOOLS, parseMcpRequest, rpcError, rpcResult,
  validateMcpToolCall, validMcpOrigin, mcpToolText
} from "../lib/mcp-protocol.ts";

const tenant = "11111111-1111-4111-8111-111111111111";
const params = (name, extra = {}) => ({ name, arguments: { tenant_id: tenant, ...extra } });

test("Only the six explicitly approved read-only tools are exposed", () => {
  assert.equal(MCP_PROTOCOL_VERSION, "2025-11-25");
  assert.equal(MCP_TOOLS.length, 6);
  assert.deepEqual(MCP_TOOLS.map((tool) => tool.name), MCP_DATASETS.map((entry) => entry.name));
  for (const tool of MCP_TOOLS) {
    assert.equal(tool.annotations.readOnlyHint, true);
    assert.equal(tool.annotations.destructiveHint, false);
    assert.deepEqual(tool.inputSchema.required, ["tenant_id"]);
    assert.equal(tool.inputSchema.additionalProperties, false);
  }
  for (const data of MCP_DATASETS) {
    assert.match(data.columns, /^id,tenant_id,/);
    assert.ok(data.permission && data.module);
    assert.doesNotMatch(data.columns, /system_prompt|settings|secret|token|metadata/);
  }
});

test("Tool calls require explicit tenant, allowlisted names and bounded input", () => {
  const call = validateMcpToolCall(params("crm.list_contacts", { limit: 20, query: "  José " }));
  assert.equal(call?.tenantId, tenant);
  assert.equal(call?.limit, 20);
  assert.equal(call?.query, "José");
  assert.equal(validateMcpToolCall(params("crm.list_contacts"))?.limit, 10);
  for (const args of [
    { name: "crm.delete_contacts", arguments: { tenant_id: tenant } },
    { name: "crm.list_contacts", arguments: {} },
    params("crm.list_contacts", { tenant_id: "other-tenant" }),
    params("crm.list_contacts", { limit: 26 }),
    params("crm.list_contacts", { limit: 0 }),
    params("crm.list_contacts", { limit: "10" }),
    params("crm.list_contacts", { query: "x".repeat(81) }),
    params("crm.list_contacts", { injected: true }),
    params("crm.list_orders", { query: "hidden" })
  ]) assert.equal(validateMcpToolCall(args), null);
});

test("Protocol request validation and JSON-RPC helpers reject invalid input", () => {
  assert.equal(parseMcpRequest([]), null);
  assert.equal(parseMcpRequest({ jsonrpc: "2.0", method: "initialize", id: null }), null);
  assert.equal(parseMcpRequest({ jsonrpc: "2.0", method: "initialize", id: 1.1 }), null);
  assert.equal(parseMcpRequest({ jsonrpc: "1.0", method: "tools/list", id: 1 }), null);
  assert.deepEqual(parseMcpRequest({ jsonrpc: "2.0", method: "tools/list", id: 2 }), {
    jsonrpc: "2.0", method: "tools/list", id: 2
  });
  assert.deepEqual(rpcResult("a", { ok: true }), { jsonrpc: "2.0", id: "a", result: { ok: true } });
  assert.equal(rpcError(null, -32600, "bad").error.code, -32600);
  assert.equal(mcpToolText({ value: 1 }).content[0].text, '{"value":1}');
});

test("Cross-origin requests are denied while same-origin and native MCP clients work", () => {
  assert.equal(validMcpOrigin(null, "https://crm.example.com/api/mcp"), true);
  assert.equal(validMcpOrigin("https://crm.example.com", "https://crm.example.com/api/mcp"), true);
  assert.equal(validMcpOrigin("https://evil.example", "https://crm.example.com/api/mcp"), false);
  assert.equal(validMcpOrigin("not a url", "https://crm.example.com/api/mcp"), false);
});

test("Server route verifies JWT, selected tenant, module permissions and RLS without write capabilities", () => {
  const source = readFileSync(new URL("../app/api/mcp/route.ts", import.meta.url), "utf8");
  assert.match(source, /validMcpOrigin/);
  assert.match(source, /auth\.getUser/);
  assert.match(source, /list_my_tenants/);
  assert.match(source, /membership\.is_active === true/);
  assert.match(source, /tenant_current_permissions/);
  assert.match(source, /tenant_effective_modules/);
  assert.match(source, /module\.enabled !== true/);
  assert.match(source, /\.eq\("tenant_id", call\.tenantId\)/);
  assert.match(source, /\.limit\(call\.limit\)/);
  assert.match(source, /persistSession: false/);
  assert.doesNotMatch(source, /service_role|serviceRole|\\.insert\(|\\.upsert\(|\\.update\(|\\.delete\(/);
});

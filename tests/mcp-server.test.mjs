import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import {
  MCP_PROTOCOL_VERSION, MCP_DATASETS, MCP_TOOLS, MCP_WORKSPACE_TOOL,
  parseMcpRequest, rpcError, rpcResult, validateMcpToolCall,
  validMcpOrigin, validWorkspaceToolArgs, mcpToolText
} from "../lib/mcp-protocol.ts";
import { selectedMcpWorkspace, allowedMcpDatasets, validateMcpWorkspaceAccess } from "../lib/mcp-access.ts";

const tenantA = "11111111-1111-4111-8111-111111111111";
const tenantB = "22222222-2222-4222-8222-222222222222";
const params = (name, extra = {}) => ({ name, arguments: { tenant_id: tenantA, ...extra } });
const membership = (tenant_id, is_active = true) => ({
  tenant_id, tenant_name: "Empresa de prueba", tenant_slug: "empresa-prueba",
  membership_role: "owner", is_active
});

test("MCP exposes only the six read-only data tools plus safe workspace discovery", () => {
  assert.equal(MCP_PROTOCOL_VERSION, "2025-11-25");
  assert.equal(MCP_TOOLS.length, 7);
  assert.equal(MCP_WORKSPACE_TOOL.name, "crm.get_workspace_context");
  assert.deepEqual(MCP_TOOLS.slice(1).map((tool) => tool.name), MCP_DATASETS.map((data) => data.name));
  for (const tool of MCP_TOOLS) {
    assert.equal(tool.annotations.readOnlyHint, true);
    assert.equal(tool.annotations.destructiveHint, false);
    assert.equal(tool.inputSchema.additionalProperties, false);
  }
  for (const data of MCP_DATASETS) {
    assert.match(data.columns, /^id,tenant_id,/);
    assert.ok(data.permission && data.module);
    assert.doesNotMatch(data.columns, /system_prompt|settings|secret|token|metadata/);
  }
});

test("Workspace tool accepts only empty input", () => {
  assert.equal(validWorkspaceToolArgs({ name: "crm.get_workspace_context" }), true);
  assert.equal(validWorkspaceToolArgs({ name: "crm.get_workspace_context", arguments: {} }), true);
  assert.equal(validWorkspaceToolArgs({ name: "crm.get_workspace_context", arguments: { tenant_id: tenantB } }), false);
  assert.equal(validWorkspaceToolArgs({ name: "crm.list_contacts", arguments: {} }), false);
});

test("Tool calls require explicit tenant, allowlisted names and bounded input", () => {
  const call = validateMcpToolCall(params("crm.list_contacts", { limit: 20, query: "  José " }));
  assert.equal(call?.tenantId, tenantA);
  assert.equal(call?.limit, 20);
  assert.equal(call?.query, "José");
  assert.equal(validateMcpToolCall(params("crm.list_contacts"))?.limit, 10);
  for (const args of [
    { name: "crm.delete_contacts", arguments: { tenant_id: tenantA } },
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

test("Selected workspace must be exactly one active, well-formed membership", () => {
  assert.equal(selectedMcpWorkspace([]), null);
  assert.equal(selectedMcpWorkspace([membership(tenantA, false)]), null);
  assert.equal(selectedMcpWorkspace([membership(tenantA), membership(tenantB)]), null);
  assert.equal(selectedMcpWorkspace([{ tenant_id: tenantA, is_active: true }]), null);
  assert.equal(selectedMcpWorkspace([membership(tenantA), membership(tenantB, false)])?.tenant_id, tenantA);
  assert.equal(selectedMcpWorkspace([membership(tenantA, false), membership(tenantB)])?.tenant_id, tenantB);
});

test("Tool visibility respects role + enabled modules and cannot cross companies", () => {
  const modules = [
    { module_key: "contacts", enabled: true },
    { module_key: "products", enabled: false },
    { module_key: "quotations", enabled: true },
    { module_key: "operations", enabled: false },
    { module_key: "ai_agents", enabled: false }
  ];
  const allowed = allowedMcpDatasets({ contacts: true, quotations: true, operations: true }, modules);
  assert.deepEqual(allowed.map((dataset) => dataset.name), ["crm.list_contacts", "crm.list_quotations"]);
  const active = selectedMcpWorkspace([membership(tenantA)]);
  assert.equal(validateMcpWorkspaceAccess(active, tenantA, allowed, "crm.list_contacts"), true);
  assert.equal(validateMcpWorkspaceAccess(active, tenantB, allowed, "crm.list_contacts"), false);
  assert.equal(validateMcpWorkspaceAccess(active, tenantA, allowed, "crm.list_products"), false);
  assert.equal(validateMcpWorkspaceAccess(null, tenantA, allowed, "crm.list_contacts"), false);
  assert.deepEqual(allowedMcpDatasets(null, modules), []);
  assert.deepEqual(allowedMcpDatasets({ all: true }, null), []);
  assert.deepEqual(allowedMcpDatasets({}, modules), []);
  assert.equal(allowedMcpDatasets({ all: true }, modules).some((item) => item.name === "crm.list_products"), false);
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

test("Cross-origin requests denied while same-origin and native MCP clients work", () => {
  assert.equal(validMcpOrigin(null, "https://crm.example.com/api/mcp"), true);
  assert.equal(validMcpOrigin("https://crm.example.com", "https://crm.example.com/api/mcp"), true);
  assert.equal(validMcpOrigin("https://evil.example", "https://crm.example.com/api/mcp"), false);
  assert.equal(validMcpOrigin("not a url", "https://crm.example.com/api/mcp"), false);
});

test("HTTP handler is disabled by default, verifies JWT, and always queries with RLS", () => {
  const source = readFileSync(new URL("../app/api/mcp/route.ts", import.meta.url), "utf8");
  assert.match(source, /process\.env\.MCP_INTERNAL_ENABLED === "true"/);
  assert.match(source, /if \(!enabled\(\)\) return unavailable\(\)/);
  assert.match(source, /validMcpOrigin/);
  assert.match(source, /auth\.getUser/);
  assert.match(source, /selectedMcpWorkspace/);
  assert.match(source, /tenant_current_permissions/);
  assert.match(source, /tenant_effective_modules/);
  assert.match(source, /validateMcpWorkspaceAccess/);
  assert.match(source, /\.eq\("tenant_id", call\.tenantId\)/);
  assert.match(source, /\.limit\(call\.limit\)/);
  assert.match(source, /persistSession: false/);
  assert.match(source, /"WWW-Authenticate"/);
  assert.match(source, /console\.info\("crm_mcp_tool_call"/);
  assert.doesNotMatch(source, /service_role|serviceRole|\.insert\(|\.upsert\(|\.update\(|\.delete\(/);
});

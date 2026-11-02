import assert from "node:assert/strict";
import test from "node:test";
import { runReadOnlyAgent } from "../scripts/mcp-family-power-agent.mjs";

test("LLM MCP agent is off by default and does not reach a paid API", async () => {
  await assert.rejects(runReadOnlyAgent({}), /deshabilitado/);
  await assert.rejects(runReadOnlyAgent({ MCP_AGENT_RUN: "YES" }), /deshabilitado/);
  await assert.rejects(runReadOnlyAgent({ MCP_AGENT_RUN: "YES", MCP_AGENT_SEND_CATALOG: "YES" }), /OPENAI_API_KEY/);
});

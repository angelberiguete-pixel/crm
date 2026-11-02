import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const page=readFileSync(new URL("../app/mcp-pilot/page.tsx",import.meta.url),"utf8");
const ui=readFileSync(new URL("../components/mcp-pilot-test.tsx",import.meta.url),"utf8");
test("MCP pilot browser page cannot appear in production",()=>{
  assert.match(page,/process\.env\.VERCEL_ENV !== "preview"/);
  assert.match(page,/process\.env\.MCP_INTERNAL_ENABLED !== "true"/);
  assert.match(page,/notFound\(\)/);
});
test("MCP pilot form uses two separate sessions with no persistence, no local token storage",()=>{
  assert.match(ui,/persistSession:false/);
  assert.match(ui,/auth\.signInWithPassword/);
  assert.match(ui,/auth\.signOut\(\{scope:"local"\}\)/);
  assert.match(ui,/family\.userId!==other\.userId/);
  assert.match(ui,/family\.tenantId!==other\.tenantId/);
  assert.match(ui,/Family Power → Lazala: denegado/);
  assert.match(ui,/Lazala → Family Power: denegado/);
  assert.doesNotMatch(ui,/localStorage|sessionStorage|document\.cookie|console\.log|NEXT_PUBLIC_.*(TOKEN|SECRET)/);
  assert.doesNotMatch(ui,/textContent\s*=|innerHTML/);
});

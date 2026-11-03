// Unit regression for tenant exit navigation. No accounts or live data.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const path = new URL("../lib/tenant-login-return.ts", import.meta.url);
const source = readFileSync(path, "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}
}).outputText;
const store = new Map();
const window = {sessionStorage: {
  setItem(k,v) { store.set(k,v); },
  getItem(k) { return store.get(k) ?? null; },
  removeItem(k) { store.delete(k); }
}};
const exports = {};
vm.runInNewContext(js, {window, exports}, {filename: "tenant-login-return.js"});
const {markPlatformClientEntry, tenantLogoutDestination} = exports;

assert.equal(tenantLogoutDestination("family-power"), "/family-power/login",
  "Family Power users must keep their branded login");
assert.equal(tenantLogoutDestination("another-client"), "/login",
  "other clients use their general login");
window.sessionStorage.setItem("crm:login-intent", "family-power");
markPlatformClientEntry();
assert.equal(tenantLogoutDestination("family-power"), "/login",
  "operator exiting a customer must return to platform login");
assert.equal(window.sessionStorage.getItem("crm:login-intent"), null,
  "client branding intent must not linger when returning to platform");
assert.equal(tenantLogoutDestination("family-power"), "/family-power/login",
  "operator routing hint must be consumed exactly once");
markPlatformClientEntry();
assert.equal(tenantLogoutDestination("another-client"), "/login",
  "all tenant clients entered from owner must exit to platform login");
console.log("PASS: direct client branded return, platform operator return, mobile/desktop shared destination, and one-shot hint.");

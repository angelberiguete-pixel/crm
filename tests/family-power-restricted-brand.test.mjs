import {test} from "node:test";
import {readFileSync} from "node:fs";
import assert from "node:assert/strict";

const gate=readFileSync(new URL("../components/tenant-permission-gate.tsx",import.meta.url),"utf8");
const css=readFileSync(new URL("../app/globals.css",import.meta.url),"utf8");

test("Only a resolved Family Power tenant receives branded restricted-access UI",()=>{
  assert.match(gate,/setRestrictedFamilyBrand\(activeTenant\.tenant_slug==="family-power"\)/);
  assert.match(gate,/restrictedFamilyBrand\?"auth-shell family-power-denied":"auth-shell"/);
  assert.match(gate,/familyPowerRestriction/);
});

test("Denied-access style uses original corporate color and preserves other tenant default",()=>{
  assert.match(css,/\.auth-shell\.family-power-denied\{/);
  assert.match(css,/#d20a14/i);
  assert.match(css,/\.auth-shell\.family-power-denied \.button\.primary/);
});

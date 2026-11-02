import {readFileSync} from "node:fs";
import {test} from "node:test";
import assert from "node:assert/strict";

test("Family Power conversation CTA routes to its authorized integrations area", () => {
  const content=readFileSync(new URL("../components/omnichannel-inbox.tsx", import.meta.url),"utf8");
  assert.match(content,/activeTenant\?\.tenant_slug==="family-power"\?"\/crm\/integrations":"\/crm\/channels"/);
  assert.match(content,/Preparar canales de esta empresa/);
});

test("Family Power integrations remains controlled by settings permissions", () => {
  const gate=readFileSync(new URL("../components/tenant-permission-gate.tsx",import.meta.url),"utf8");
  assert.match(gate,/integrations: "settings"/);
  assert.match(gate,/restrictedFamilySections=\["companies","sales","marketing","channels","automations","sessions"\]/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
const component=readFileSync(new URL("../components/customer-history.tsx",import.meta.url),"utf8");
const css=readFileSync(new URL("../components/customer-history.module.css",import.meta.url),"utf8");
test("commercial dossier has keyboard-safe modal controls",()=>{
  assert.match(component,/ref=\{closeButtonRef\}/);
  assert.match(component,/document\.addEventListener\("keydown",trapTab,true\)/);
  assert.match(component,/event\.key==="Escape"/);
  assert.match(component,/opener\?\.isConnected/);
  assert.match(component,/document\.body\.style\.overflow="hidden"/);
  assert.match(css,/:focus-visible\{outline:3px/);
});

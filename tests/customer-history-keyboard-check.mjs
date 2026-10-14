import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const css = readFileSync("components/customer-history.module.css", "utf8");
assert.match(css, /focus-visible/);
assert.match(css, /outline:3px solid/);
console.log("PASS: customer dossier keyboard focus styles");

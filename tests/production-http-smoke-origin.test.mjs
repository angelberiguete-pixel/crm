// Regression guard for production HTTP smoke: redirects must not leave the configured origin.
// Read-only static assertion; does not contact production or send credentials.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./production-http-smoke.mjs", import.meta.url), "utf8");
assert.match(source, /finalUrl\.origin\s*,\s*expectedOrigin/, "smoke must assert final response origin");
assert.match(source, /redirect\s*:\s*["']manual["']|redirect\s*:\s*["']follow["']/, "redirect behavior must be explicit");
console.log("PASS: production smoke declares same-origin redirect gate");

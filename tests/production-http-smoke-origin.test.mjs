// Static wiring guard complements functional redirect tests.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const smoke = readFileSync(new URL("./production-http-smoke.mjs", import.meta.url), "utf8");
const helper = readFileSync(new URL("./production-http-redirects.mjs", import.meta.url), "utf8");
assert.match(smoke, /import\s*\{\s*fetchSameOrigin\s*\}\s*from\s*["']\.\/production-http-redirects\.mjs["']/, "smoke must import guarded fetch");
assert.match(smoke, /await\s+fetchSameOrigin\s*\(/, "smoke must call guarded fetch");
assert.doesNotMatch(smoke, /redirect\s*:\s*["']follow["']/, "smoke must not follow redirects automatically");
assert.match(helper, /redirect\s*:\s*["']manual["']/, "guarded fetch must inspect redirects manually");
assert.match(helper, /target\.origin\s*!==\s*initial\.origin/, "guarded fetch must reject foreign origins");
console.log("PASS: smoke uses manual same-origin redirect guard");

import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";
const root = new URL("../../",import.meta.url);
const sql=readFileSync(new URL("./tenant-creation-guard-regression.sql",import.meta.url),"utf8");
const ci=readFileSync(new URL("../../.github/workflows/ci.yml",import.meta.url),"utf8");
const src=readFileSync(new URL("./security-source-regressions.test.mjs",import.meta.url),"utf8");

// Ten independently reported regression-contract checks. These do not replace live DB tests.
test("01: privileged tenant creation is named explicitly",()=>assert.match(sql,/private\.create_tenant_impl\(text,text\)/));
test("02: function existence is checked before authorization",()=>assert.match(sql,/definition IS NULL/));
test("03: SECURITY DEFINER mode is checked",()=>assert.match(sql,/IF NOT is_definer/));
test("04: authenticated EXECUTE is inspected",()=>assert.match(sql,/has_function_privilege\('authenticated'/));
test("05: an internal admin guard is required",()=>assert.match(sql,/crm_is_platform_admin/));
test("06: missing internal guard causes an explicit failure",()=>assert.match(sql,/SECURITY FAILURE/));
test("07: source credential scan is defined",()=>assert.match(src,/secretPattern/));
test("08: public credential exposure scan is defined",()=>assert.match(src,/NEXT_PUBLIC_/));
test("09: credential scan is a mandatory CI step",()=>assert.match(ci,/node --test tests\/security\/security-source-regressions\.test\.mjs/));
test("10: CI runs for pull requests targeting main",()=>assert.match(ci,/pull_request:\s*\n\s*branches:\s*\[main\]/));

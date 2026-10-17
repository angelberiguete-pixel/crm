import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync, readdirSync} from "node:fs";
import {join} from "node:path";

const root = new URL("../../", import.meta.url).pathname;
const read = path => readFileSync(join(root,path),"utf8");
const walk = path => readdirSync(join(root,path),{withFileTypes:true}).flatMap(entry=>{
  const child=join(path,entry.name);
  return entry.isDirectory()?walk(child):[child];
});
const applicationFiles = ["app","components","lib","supabase/functions"].flatMap(folder=>walk(folder))
  .filter(path=>/\.(ts|tsx|js|jsx|mjs)$/.test(path));
const secretPattern = /(?:sb_secret_[a-zA-Z0-9_-]{8,}|sk_live_[a-zA-Z0-9]{8,}|ghp_[a-zA-Z0-9]{28,})/;

test("server and browser application source contains no literal secret tokens",()=>{
  for(const file of applicationFiles){
    assert.doesNotMatch(read(file),secretPattern,`Credential-shaped literal in ${file}`);
  }
});
test("browser-exposed environment variable names never include credential classes",()=>{
  const forbidden=/NEXT_PUBLIC_[A-Z0-9_]*(?:SERVICE_ROLE|SECRET|PRIVATE_KEY|ADMIN_KEY|ACCESS_TOKEN|REFRESH_TOKEN|CLIENT_SECRET)/;
  for(const file of applicationFiles){
    assert.doesNotMatch(read(file),forbidden,`Public credential exposure in ${file}`);
  }
});
test("privileged tenant creation regression SQL is tracked",()=>{
  const sql=read("tests/security/tenant-creation-guard-regression.sql");
  assert.match(sql,/private\.create_tenant_impl/);
  assert.match(sql,/authenticated/);
  assert.match(sql,/crm_is_platform_admin/);
});

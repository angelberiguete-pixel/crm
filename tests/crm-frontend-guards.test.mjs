import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync,readdirSync} from "node:fs";
import {join} from "node:path";
const root=new URL("../",import.meta.url).pathname;
const source=(file)=>readFileSync(join(root,file),"utf8");
const publicSource=["app","components","lib"].flatMap(folder=>{
  function walk(path){
    return readdirSync(join(root,path),{withFileTypes:true}).flatMap(ent=>{
      const child=join(path,ent.name);
      return ent.isDirectory()?walk(child):(/\.(?:tsx?|jsx?)$/.test(ent.name)?[child]:[]);
    });
  }
  return walk(folder);
});
test("browser code never publishes administrative environment variables or literal secret keys",()=>{
  const forbidden=/NEXT_PUBLIC_[A-Z0-9_]*(?:SERVICE_ROLE|SECRET|PRIVATE_KEY|ADMIN_KEY|ACCESS_TOKEN)|\bsb_secret_[A-Za-z0-9]+\b|\bsk_live_[A-Za-z0-9]+\b|\bghp_[A-Za-z0-9]{28,}\b/g;
  for(const file of publicSource){
    const found=source(file).match(forbidden);
    assert.equal(found,null,file+" contains a forbidden client-side secret pattern");
  }
});
test("company channel requests reset stale UI and check tenant identity after a save",()=>{
  const content=source("components/crm-channel-setup.tsx");
  assert.match(content,/activeTenantId\.current!==requestTenantId/);
  assert.match(content,/setIdentifier\(""/);
  assert.match(content,/supabase\.rpc\("tenant_register_channel_request"/);
  assert.match(content,/No se pudo registrar la solicitud/);
});
test("commercial dashboard does not disguise failed counts as confirmed zeros",()=>{
  const content=source("components/crm-commercial-dashboard.tsx");
  assert.match(content,/companies\.error\?null/);
  assert.match(content,/contacts\.error\?null/);
  assert.match(content,/Los no disponibles se muestran/);
  assert.match(content,/Primeros pasos/);
});

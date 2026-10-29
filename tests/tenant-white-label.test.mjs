import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolveTenantBrand,safeTenantAsset,safeHex,tenantBrandStyle} from "../lib/tenant-brand.ts";
const a={tenant_id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",tenant_slug:"eurevector",tenant_name:"Look Social Media"};
const b={tenant_id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",tenant_slug:"sublimaciones-lazala",tenant_name:"Sublimaciones Lazala"};

test("Look official identity is preserved, other businesses never inherit its logo/color",()=>{
 const look=resolveTenantBrand(a);
 const client=resolveTenantBrand(b,{brand_name:"Lazala Studio",primary_color:"#0f766e",secondary_color:"#14532d",accent_color:"#d97706"});
 assert.equal(look.officialLookBrand,true);
 assert.equal(look.primaryColor,"#2563EB");
 assert.equal(client.officialLookBrand,false);
 assert.equal(client.name,"Lazala Studio");
 assert.equal(client.primaryColor,"#0F766E");
 assert.equal(client.secondaryColor,"#14532D");
 assert.equal(client.accentColor,"#D97706");
 assert.notEqual(tenantBrandStyle(client)["--brand-gradient"],tenantBrandStyle(look)["--brand-gradient"]);
 assert.equal(resolveTenantBrand(b).logoUrl,null);
 assert.equal(resolveTenantBrand(b).initials,"SL");
});
test("unsafe logo, favicon and color input cannot become executable or a CSS injection",()=>{
 for(const x of [null,"","http://example.com/a.svg","javascript:alert(1)","data:image/svg+xml,<svg/>","//example.com/file.svg","/../oops.svg","/foo\\bar.png","https://user:pass@host.example/logo.png", "x".repeat(1300)]){
   assert.equal(safeTenantAsset(x),null,String(x));
 }
 assert.equal(safeTenantAsset("https://cdn.example.com/company/logo.png"),"https://cdn.example.com/company/logo.png");
 assert.equal(safeTenantAsset("/client-logos/logo.png"),"/client-logos/logo.png");
 assert.equal(safeHex("red; background: url(x)","#334155"),"#334155");
 assert.equal(safeHex("#badc0f","#334155"),"#BADC0F");
 assert.equal(resolveTenantBrand(b,{primary_color:"blue",logo_url:"data:image/svg+xml,x"}).primaryColor,"#334155");
});
test("tenant branding is loaded behind membership gate and never writes global root CSS",()=>{
 const provider=readFileSync(new URL("../components/tenant-brand-provider.tsx",import.meta.url),"utf8");
 const gate=readFileSync(new URL("../components/tenant-permission-gate.tsx",import.meta.url),"utf8");
 const logo=readFileSync(new URL("../components/brand-logo.tsx",import.meta.url),"utf8");
 const settings=readFileSync(new URL("../components/crm-workspace.tsx",import.meta.url),"utf8");
 assert.match(gate,/TenantContextProvider[\s\S]+?TenantBrandProvider/);
 assert.match(gate,/key=\{tenant\.tenant_id\}/);
 assert.match(provider,/\.eq\("tenant_id",tenant\.tenant_id\)/);
 assert.match(provider,/data-tenant-brand=\{brand\.slug\}/);
 assert.doesNotMatch(provider,/document\.documentElement\.style|document\.body\.style/);
 assert.match(logo,/tenantBrand\.officialLookBrand/);
 assert.match(logo,/tenantBrand\.logoUrl/);
 assert.match(settings,/TENANT_BRAND_UPDATED/);
 assert.match(settings,/\.eq\("tenant_id",tenantId\)\.select\("tenant_id"\)\.maybeSingle\(\)/);
 assert.match(settings,/Logo principal sin fondo \(URL HTTPS o ruta local\)/);
});

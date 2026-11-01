import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(file)=>readFileSync(new URL("../"+file,import.meta.url),"utf8");

test("all loading fallbacks use tenant identity instead of defaulting to agency logo",()=>{
 const route=read("components/route-loading-brand.tsx");
 const root=read("app/loading.tsx");
 const gate=read("components/tenant-permission-gate.tsx");
 const provider=read("components/tenant-brand-provider.tsx");
 const styles=read("app/globals.css");
 assert.match(route,/window\.sessionStorage\.getItem\("crm:login-intent"\)/);
 assert.match(route,/intent==="family-power"/);
 assert.match(route,/client-brands\/family-power\/logo-color-sin-fondo\.svg/);
 assert.match(route,/route-loading-neutral/);
 assert.doesNotMatch(root,/<BrandLogo/);
 assert.match(root,/<RouteLoadingBrand size="loading"/);
 assert.match(gate,/tenant-access-loading/);
 assert.match(gate,/<RouteLoadingBrand size="loading"/);
 assert.match(gate,/<RouteLoadingBrand size="login"/);
 assert.match(gate,/<RouteLoadingBrand size="compact"/);
 assert.match(styles,/tenant-brand-scope\[data-tenant-brand="family-power"\] \.loading::before/);
 assert.match(styles,/tenant-access-loading\.loading::before\{display:none\}/);
 assert.match(styles,/\.route-loading-neutral/);
 assert.match(provider,/setItem\("crm:login-intent","family-power"\)/);
});
test("non-Family-Power customer loaders never inherit Look Social Media image",()=>{
 const styles=read("app/globals.css");
 const route=read("components/route-loading-brand.tsx");
 assert.match(styles,/not\(\[data-tenant-brand="family-power"\]\):not\(\[data-tenant-brand="eurevector"\]\) \.loading::before/);
 assert.match(styles,/display:none/);
 assert.match(route,/path\.startsWith\("\/look-social-media"\)/);
 assert.doesNotMatch(route,/const \[identity,setIdentity\]=useState<Identity>\("platform"\)/);
});

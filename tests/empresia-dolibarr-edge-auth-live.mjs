// Live unauthenticated security contract. No keys, no customer data, no writes.
// A 403 verifies that a public caller cannot read ERP data, not that the provider is connected.
import assert from "node:assert/strict";

const origin="https://ygipjqgyreeahslzorik.supabase.co";
const endpoint=new URL("/functions/v1/empresia-dolibarr",origin);
const headers={"Content-Type":"application/json","Accept":"application/json"};

const timeout=()=>AbortSignal.timeout(15000);

const get=await fetch(endpoint,{method:"GET",signal:timeout()});
assert.equal(get.status,405,"public GET must be disabled");
const getBody=await get.json();
assert.equal(getBody.error,"method_not_allowed");

const invalid=await fetch(endpoint,{
  method:"POST",headers,body:JSON.stringify({action:"products",tenant_id:"not-a-tenant"}),
  signal:timeout(),
});
assert.equal(invalid.status,400,"invalid tenant must be rejected before authentication");
const invalidBody=await invalid.json();
assert.equal(invalidBody.error,"invalid_tenant");

const forbidden=await fetch(endpoint,{
  method:"POST",headers,body:JSON.stringify({action:"products",tenant_id:"00000000-0000-0000-0000-000000000000"}),
  signal:timeout(),
});
assert.equal(forbidden.status,403,"no anonymous access to ERP");
const deniedBody=await forbidden.json();
assert.equal(deniedBody.error,"forbidden");
assert.ok(!JSON.stringify(deniedBody).includes("DOLAPIKEY"));

console.log("PASS: production Empresia ERP Edge Function rejects GET, invalid tenant and anonymous product reads.");

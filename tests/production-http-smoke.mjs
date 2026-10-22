// Public-production HTTP checks: no passwords, service keys, or simulated sessions.
// This proves routes respond over HTTPS; it does NOT prove authenticated CRM flows.
import assert from "node:assert/strict";
import { fetchSameOrigin } from "./production-http-redirects.mjs";

const base=process.env.CRM_PRODUCTION_URL || "https://crm-revenue-os.vercel.app";
const baseUrl = new URL(base);
if (baseUrl.protocol !== "https:") throw new Error("CRM_PRODUCTION_URL must use HTTPS");
const expectedOrigin = baseUrl.origin;
const routes=["/login","/reset-password","/accept-invite","/look-social-media","/platform-admin","/crm","/crm/inbox","/crm/channels"];
for(const route of routes){
 let finalError=null,passed=false;
 for(let attempt=1;attempt<=3;attempt++){
  try{
   const response=await fetchSameOrigin(new URL(route,base),{
    method:"GET",
    headers:{"User-Agent":"LOOK-SOCIAL-MEDIA-readonly-qa/1.0","Accept":"text/html"},
    signal:AbortSignal.timeout(14000)
   });
   const finalUrl=new URL(response.url);
   const body=await response.text();
   assert.equal(finalUrl.protocol,"https:","must stay on HTTPS");
   assert.equal(finalUrl.origin,expectedOrigin,`${route} redirected to an unexpected origin: ${finalUrl.origin}`);
   assert.equal(response.status,200,`${route} should return HTTP 200, actual ${response.status}`);
   assert.match(response.headers.get("content-type")??"",/text\/html/i,"HTML required");
   assert.match(body,/(look social media|crm)/i,"branded application response expected");
   assert.ok(!/localhost:3000/i.test(response.url),"public route must not resolve to localhost");
   console.log(`PASS ${route} -> ${response.status} ${finalUrl.pathname} (${body.length} chars)`);
   passed=true;break;
  }catch(error){finalError=error;if(attempt<3)await new Promise(resolve=>setTimeout(resolve,1500*attempt));}
 }
 if(!passed)throw new Error(`Production smoke failure on ${route}: ${String(finalError)}`);
}
console.log("PASS: production public HTTPS/HTML routes. Credentials, tenants, Storage and password emails NOT tested.");

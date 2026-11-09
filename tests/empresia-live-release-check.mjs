// Public release gate: tests real HTML on the existing public Vercel deployment.
// No credentials, no database writes, no simulated visitors or billing.
import assert from "node:assert/strict";

const base = process.env.CRM_PRODUCTION_URL || "https://crm-revenue-os.vercel.app";

async function visit(path) {
  let response, lastError;
  for (let i=0;i<3;i++) {
    try {
      response = await fetch(new URL(path,base), {
        method:"GET", redirect:"follow", headers:{"Accept":"text/html","User-Agent":"Empresia-release-check/1.0"},
        signal:AbortSignal.timeout(16000),
      });
      break;
    } catch (e) {
      lastError=e;
      if(i<2)await new Promise(resolve=>setTimeout(resolve,1000*(i+1)));
    }
  }
  if(!response)throw new Error(path+" unreachable: "+String(lastError));
  const html=await response.text();
  const uri=new URL(response.url);
  const title=html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]??"(sin título)";
  console.log(JSON.stringify({requested:path,final:uri.pathname,status:response.status,title,bytes:html.length,brandInHtml:/Empresia/i.test(html)}));
  assert.equal(uri.protocol,"https:");
  assert.equal(response.status,200,path+" should be public");
  assert.match(response.headers.get("content-type")||"",/text\/html/i);
  return {html,uri};
}

const landing=await visit("/empresia");
assert.equal(landing.uri.pathname,"/empresia","the main commercial landing must exist");
assert.match(landing.html,/<title[^>]*>[^<]*Empresia/i,"production title must be Empresia");
assert.match(landing.html,/empresia-logo\.svg/,"the actual landing must render the Empresia logo");
assert.match(landing.html,/href="\/empresia\/start"/,"onboarding CTA must use new URL");
assert.doesNotMatch(landing.html,/LOOK SOCIAL MEDIA/i,"old brand must not appear on landing");

const legacy=await visit("/look-social-media");
assert.equal(legacy.uri.pathname,"/empresia","old marketing links must redirect to Empresia");

const login=await visit("/login");
assert.match(login.html,/alt="Empresia"/,"login must identify the platform as Empresia");
console.log("PASS: live Vercel identity is Empresia, old links redirect, and login uses new branding");

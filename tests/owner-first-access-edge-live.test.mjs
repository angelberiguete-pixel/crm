// Real Supabase Edge Function probe with an invalid ticket. It cannot claim an owner ticket.
import assert from "node:assert/strict";
const url="https://ygipjqgyreeahslzorik.supabase.co/functions/v1/owner-initial-password";
const origin="https://crm-revenue-os.vercel.app";
const bad="Q".repeat(44);
const r=await fetch(url,{
  method:"POST",
  headers:{"Origin":origin,"Content-Type":"application/json"},
  body:JSON.stringify({ticket:bad}),signal:AbortSignal.timeout(15000)
});
const data=await r.json();
assert.equal(r.status,400,"invalid ticket must be rejected with 400 rather than issuing Auth tokens");
assert.equal(r.headers.get("access-control-allow-origin"),origin,"only configured production origin permitted");
assert.ok(typeof data.error==="string","safe error response should be JSON");
assert.equal(data.token_hash,undefined,"never generate recovery OTP for invalid tickets");
console.log("PASS: live Supabase Edge Function rejects unknown first-access code, no recovery OTP issued.");

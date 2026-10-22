import assert from "node:assert/strict";
import http from "node:http";
import { fetchSameOrigin } from "./production-http-redirects.mjs";

// Local-only redirect behavior regression: no external network or real CRM credentials.
let foreignRequests = 0;
const target = http.createServer((req, res) => {
  foreignRequests += 1;
  res.writeHead(200, { "content-type": "text/html" });
  res.end("CRM");
});
await new Promise(resolve => target.listen(0, "127.0.0.1", resolve));
const origin = http.createServer((req, res) => {
  if (req.url === "/internal") res.writeHead(302, { Location: "/ok" });
  else if (req.url === "/external") res.writeHead(302, { Location: `http://127.0.0.1:${target.address().port}/ok` });
  else res.writeHead(200, { "content-type": "text/html" });
  res.end("CRM");
});
await new Promise(resolve => origin.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${origin.address().port}`;
async function verify(path) {
  const response = await fetchSameOrigin(new URL(path, base));
  assert.equal(new URL(response.url).origin, new URL(base).origin, "unexpected redirect origin");
  return response.status;
}
try {
  assert.equal(await verify("/internal"), 200);
  await assert.rejects(verify("/external"), /unexpected redirect origin/);
  assert.equal(foreignRequests, 0, "rejected redirect must never contact foreign origin");
  console.log("PASS same-origin accepted; cross-origin rejected without any foreign request");
} finally {
  origin.close();
  target.close();
}

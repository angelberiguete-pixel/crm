import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchSameOrigin } from "./production-http-redirects.mjs";

const base = "https://crm-revenue-os.vercel.app/login";
function response(status, location) {
  return { status, headers: new Headers(location ? { location } : {}) };
}
test("1. ordinary response passes", async () => {
  assert.equal((await fetchSameOrigin(base, {}, async () => response(200))).status, 200);
});
test("2. relative redirect passes", async () => {
  const visited = [];
  await fetchSameOrigin(base, {}, async (url, init) => {
    visited.push(url.toString());
    assert.equal(init.redirect, "manual");
    return response(visited.length === 1 ? 302 : 200, "/login");
  });
  assert.equal(visited.length, 2);
});
test("3. same-origin absolute redirect passes", async () => {
  let count = 0;
  await fetchSameOrigin(base, {}, async () => response(++count === 1 ? 301 : 200, base));
  assert.equal(count, 2);
});
test("4. foreign hostname rejected before fetch", async () => {
  let count = 0;
  await assert.rejects(fetchSameOrigin(base, {}, async () => {
    count++; return response(302, "https://example.com/steal");
  }), /unexpected redirect origin/);
  assert.equal(count, 1);
});
test("5. http downgrade rejected", async () => {
  await assert.rejects(fetchSameOrigin(base, {}, async () => response(302, "http://crm-revenue-os.vercel.app/")), /unexpected redirect origin/);
});
test("6. foreign port rejected", async () => {
  await assert.rejects(fetchSameOrigin(base, {}, async () => response(302, "https://crm-revenue-os.vercel.app:444/")), /unexpected redirect origin/);
});
test("7. userinfo lookalike host rejected", async () => {
  await assert.rejects(fetchSameOrigin(base, {}, async () => response(302, "https://crm-revenue-os.vercel.app@evil.example/")), /unexpected redirect origin/);
});
test("8. missing Location rejected", async () => {
  await assert.rejects(fetchSameOrigin(base, {}, async () => response(302)), /without Location/);
});
test("9. redirect loop limited to five hops", async () => {
  let count = 0;
  await assert.rejects(fetchSameOrigin(base, {}, async () => { count++; return response(302, "/again"); }), /too many same-origin redirects/);
  assert.equal(count, 6);
});
test("10. redirect statuses 303 307 308 handled", async () => {
  for (const status of [303, 307, 308]) {
    let count = 0;
    await fetchSameOrigin(base, {}, async () => response(++count === 1 ? status : 200, "/ok"));
    assert.equal(count, 2);
  }
});

import {test} from "node:test";
import assert from "node:assert/strict";
import {validateWebhookDraftUrl} from "../lib/automation-webhook-validation.ts";

test("accepts an HTTPS domain without credentials",()=>{
  assert.equal(validateWebhookDraftUrl(" https://hooks.example.org/new-lead "),null);
});
test("rejects insecure or malformed webhook destinations",()=>{
  for(const value of ["","hello","http://hooks.example.org/event","ftp://hooks.example.org",
    "https://localhost/hook","https://internal.local/hook","https://db.internal/hook",
    "https://127.0.0.1/hook","https://192.168.10.2/hook",
    "https://[::1]/hook","https://example.org:8080/hook","https://u:p@example.org/hook",
    "https://example.org/hook#fragment","https://example.org/hook?token=secret",
    "https://example.org/hook?api_key=hidden"]){
    assert.ok(validateWebhookDraftUrl(value),value+" must be rejected before saving");
  }
});
test("does not present client-side input validation as backend authorization",()=>{
  const error=validateWebhookDraftUrl("https://hooks.example.org");
  assert.equal(error,null);
});

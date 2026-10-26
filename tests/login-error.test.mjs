import assert from "node:assert/strict";
import { test } from "node:test";
import { describeAuthIssue } from "../lib/auth-error.ts";

test("Supabase network errors identify infrastructure failure without blaming credentials", () => {
  for (const error of [
    new Error("Failed to fetch"),
    { name: "AuthRetryableFetchError", message: "Network request failed", status: 0 },
    { message: "fetch failed", code: "unexpected_failure" },
    { code: "network_error" },
    { code: "request_timeout" },
  ]) {
    const result = describeAuthIssue(error);
    assert.match(result, /No se pudo conectar al servicio/);
    assert.match(result, /credenciales no han sido verificadas/);
  }
});

test("incorrect credentials and email confirmation remain distinct from network errors", () => {
  assert.match(describeAuthIssue({ code: "invalid_credentials", message: "Invalid login credentials" }), /contraseña no son correctos/);
  assert.match(describeAuthIssue({ code: "email_not_confirmed" }), /confirmado su correo/);
  assert.match(describeAuthIssue({ status: 429 }), /demasiados intentos/);
});

test("unrecognized Auth messages never expose raw backend details or tokens", () => {
  const raw="secret_ref: test-secret-123 internal sql failure";
  const result=describeAuthIssue({ message:raw, status:500 });
  assert.doesNotMatch(result, /test-secret|internal sql/);
  assert.match(result, /No fue posible completar/);
});

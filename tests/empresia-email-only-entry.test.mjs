import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=(p)=>readFileSync(new URL("../"+p,import.meta.url),"utf8");

test("Empresia and Family Power use password login without email magic links",()=>{
  const login=read("app/login/page.tsx");
  const family=read("app/family-power/login/page.tsx");
  const legacy=read("app/acceso-correo/page.tsx");
  const client=read("lib/supabase.ts");

  assert.match(login,/supabase\.auth\.signInWithPassword/);
  assert.match(family,/supabase\.auth\.signInWithPassword/);
  assert.doesNotMatch(login,/signInWithOtp|requestEmailLogin|Entrar sin contraseña por correo|href="\/acceso-correo"/);
  assert.doesNotMatch(family,/signInWithOtp|resendOwnerConfirmation|Reenviar confirmación|OWNER_EMAIL/);
  assert.match(legacy,/redirect\("\/login"\)/);
  assert.match(client,/persistSession:\s*true/);
  assert.match(client,/autoRefreshToken:\s*true/);
  assert.match(login,/platform_current_access/);
  assert.match(family,/familyPowerMembership/);
  assert.match(family,/set_active_tenant/);
});

test("Password recovery is optional and cannot bypass authentication",()=>{
  const login=read("app/login/page.tsx");
  const family=read("app/family-power/login/page.tsx");
  assert.match(login,/resetPasswordForEmail/);
  assert.match(family,/resetPasswordForEmail/);
  assert.doesNotMatch(login,/service_role|admin\.updateUserById/);
  assert.doesNotMatch(family,/service_role|admin\.updateUserById/);
});

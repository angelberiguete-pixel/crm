import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const page=readFileSync(new URL("../app/family-power/login/page.tsx",import.meta.url),"utf8");
test("first-time Family Power owner can request an account without a private code",()=>{
 assert.match(page,/nombre completo, correo y contraseña/);
 assert.match(page,/correo propietario preautorizado/);
 assert.match(page,/href="\/family-power\/registro"/);
 assert.doesNotMatch(page,/código privado para crear su propia cuenta/);
});
test("login remains membership-gated, no registration inside login itself",()=>{
 assert.match(page,/supabase\.auth\.signInWithPassword/);
 assert.match(page,/familyPowerMembership/);
 assert.doesNotMatch(page,/supabase\.auth\.signUp/);
});

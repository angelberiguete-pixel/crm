import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const page=readFileSync(new URL("../app/family-power/login/page.tsx",import.meta.url),"utf8");
test("Family Power owner signs in with password while new accounts use separate registration",()=>{
 assert.match(page,/No se envían enlaces ni códigos por email para iniciar sesión/);
 assert.match(page,/Entra directamente con tu correo y contraseña/);
 assert.match(page,/href="\/family-power\/registro"/);
 assert.doesNotMatch(page,/código privado para crear su propia cuenta/);
 assert.doesNotMatch(page,/resendOwnerConfirmation|Reenviar confirmación|signInWithOtp/);
});
test("login remains membership-gated, no registration inside login itself",()=>{
 assert.match(page,/supabase\.auth\.signInWithPassword/);
 assert.match(page,/familyPowerMembership/);
 assert.doesNotMatch(page,/supabase\.auth\.signUp/);
});

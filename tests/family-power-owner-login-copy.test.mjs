import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const page=readFileSync(new URL("../app/family-power/login/page.tsx",import.meta.url),"utf8");

test("first-time Family Power owner is not required to have a preapproved existing account",()=>{
 assert.match(page,/tu cuenta se crea con una activación privada de Family Power/);
 assert.match(page,/no necesitas una cuenta anterior/);
 assert.match(page,/código privado para crear su propia cuenta y contraseña/);
 assert.doesNotMatch(page,/Inicia sesión con la cuenta que te haya autorizado Family Power/);
});
test("the production login stays secure, not an unprotected owner signup",()=>{
 assert.match(page,/supabase\.auth\.signInWithPassword/);
 assert.match(page,/familyPowerMembership/);
 assert.doesNotMatch(page,/supabase\.auth\.signUp/);
});

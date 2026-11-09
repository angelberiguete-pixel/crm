import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const login=readFileSync(new URL("../app/family-power/login/page.tsx",import.meta.url),"utf8");
const signup=readFileSync(new URL("../app/family-power/registro/page.tsx",import.meta.url),"utf8");
const admin=readFileSync(new URL("../components/platform-admin.tsx",import.meta.url),"utf8");
const sql=readFileSync(new URL("../supabase/migrations/20261105122000_family_power_owner_self_registration.sql",import.meta.url),"utf8");

test("Family Power login offers owner registration and keeps existing secure login",()=>{
 assert.match(login,/href="\/family-power\/registro"/);
 assert.match(login,/supabase\.auth\.signInWithPassword/);
 assert.match(login,/familyPowerMembership/);
 assert.doesNotMatch(login,/supabase\.auth\.signUp/);
});
test("registration captures name, email and password without client-side tenant privileges",()=>{
 assert.match(signup,/Nombre completo/);
 assert.match(signup,/Correo electrónico/);
 assert.match(signup,/Crea tu contraseña/);
 assert.match(signup,/supabase\.auth\.signUp/);
 assert.match(signup,/registration_source:"family-power"/);
 assert.doesNotMatch(signup,/platform_add_member|set_active_tenant/);
});
test("pending requests require an audited platform-owner decision",()=>{
 assert.match(sql,/after insert on auth\.users/);
 assert.match(sql,/enable row level security/);
 assert.match(sql,/private\.crm_is_platform_owner\(\)/);
 assert.match(sql,/email_confirmed_at is not null/);
 assert.match(sql,/platform_add_member\(v_req\.tenant_id,v_req\.user_id,'owner','active'\)/);
 assert.match(admin,/platform_review_family_power_registration/);
 assert.match(admin,/Solicitudes de registro pendientes/);
});

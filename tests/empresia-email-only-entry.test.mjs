import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(p)=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("email-only access is prominent and never requires password",()=>{
 const entry=read("app/acceso-correo/page.tsx"),login=read("app/login/page.tsx");
 assert.match(login,/href="\/acceso-correo"/);
 assert.match(entry,/supabase\.auth\.signInWithOtp/);
 assert.match(entry,/shouldCreateUser:false/);
 assert.match(entry,/emailRedirectTo:new URL\("\/login",window\.location\.origin\)/);
 assert.match(entry,/supabase\.auth\.getUser/);
 assert.match(entry,/platform_current_access/);
 assert.match(entry,/isAdmin\?"\/platform-admin":"\/crm"/);
 assert.doesNotMatch(entry,/type="password"|auth\.signUp|updateUser\(|service_role|platform_add_member/);
 assert.match(entry,/role="status"/);
});

import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {authSignInMessage,authEmailActionMessage} from "../lib/auth-entry-feedback.ts";

const source=(path)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("distinguishes password errors from unconfirmed email and rate limits",()=>{
 assert.match(authSignInMessage("invalid_credentials"),/contraseña no coinciden/);
 assert.match(authSignInMessage("email_not_confirmed"),/confirmar el correo/);
 assert.match(authSignInMessage("over_email_send_rate_limit"),/límite/);
 assert.match(authEmailActionMessage("over_email_send_rate_limit"),/limita el envío/);
 assert.doesNotMatch(authSignInMessage("invalid_credentials"),/service_role|SUPABASE|stack trace/);
});

test("passwordless login proves mailbox ownership without creating users or elevating roles",()=>{
 const login=source("app/login/page.tsx");
 assert.match(login,/supabase\.auth\.signInWithOtp\(/);
 assert.match(login,/shouldCreateUser: false/);
 assert.match(login,/emailRedirectTo: new URL\("\/login", window\.location\.origin\)/);
 assert.match(login,/Entrar sin contraseña por correo/);
 assert.match(login,/if \(data\.session\) await routeAuthenticatedUser\(\)/);
 assert.doesNotMatch(login,/platform_add_member|service_role|setUserClaims/);
});

test("global Empresia login recovers password using current host and routes admins separately",()=>{
 const login=source("app/login/page.tsx");
 assert.match(login,/new URL\("\/reset-password",window\.location\.origin\)/);
 assert.match(login,/authSignInMessage\(result\.error\.code\)/);
 assert.match(login,/authEmailActionMessage\(error\.code\)/);
 assert.match(login,/href="\/family-power\/login"/);
 assert.match(login,/value\.is_platform_admin \? "\/platform-admin" : "\/crm"/);
 assert.doesNotMatch(login,/redirectTo = "https:\/\/crm-revenue-os\.vercel\.app\/reset-password"/);
});

test("Family Power shows verified owner actions while keeping membership security",()=>{
 const login=source("app/family-power/login/page.tsx");
 const signup=source("app/family-power/registro/page.tsx");
 const recovery=source("app/reset-password/page.tsx");
 assert.match(login,/authSignInMessage\(result\.error\?\.code\)/);
 assert.match(login,/email_not_confirmed/);
 assert.match(login,/supabase\.auth\.resend\(/);
 assert.match(login,/email:OWNER_EMAIL/);
 assert.match(login,/emailRedirectTo:new URL\("\/family-power\/login",window\.location\.origin\)/);
 assert.match(login,/familyPowerMembership\(list\.data/);
 assert.match(login,/supabase\.rpc\("set_active_tenant"/);
 assert.match(login,/href="\/login"/);
 assert.match(signup,/supabase\.auth\.resend\(/);
 assert.match(signup,/email:RESERVED_OWNER_EMAIL/);
 assert.match(signup,/readOnly/);
 assert.match(recovery,/EMPRESIA · ACCESO SEGURO/);
 assert.match(recovery,/isPasswordRecoverySession\(session\)/);
 assert.doesNotMatch(login,/platform_add_member|updateUser\(\{password/);
});

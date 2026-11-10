import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");

test("Family Power only offers owner signup to preapproved mailbox",()=>{
  const signup=read("app/family-power/registro/page.tsx");
  assert.match(signup,/RESERVED_OWNER_EMAIL="familypower1@hotmail\.com"/);
  assert.match(signup,/email\.trim\(\)\.toLowerCase\(\)!==RESERVED_OWNER_EMAIL/);
  assert.match(signup,/email:RESERVED_OWNER_EMAIL/);
  assert.match(signup,/readOnly/);
  assert.match(signup,/minLength=\\{12\\}/);
  assert.doesNotMatch(signup,/family-power\/pagos/);
  assert.doesNotMatch(signup,/platform_add_member/);
});

test("verified signup automatically selects the correct tenant without cross-tenant rights",()=>{
  const signup=read("app/family-power/registro/page.tsx");
  const login=read("app/family-power/login/page.tsx");
  assert.match(signup,/emailRedirectTo:new URL\("\/family-power\/login",window\.location\.origin\)/);
  assert.match(signup,/identity\.data\.user\.email_confirmed_at/);
  assert.match(signup,/t\.tenant_slug===FAMILY_TENANT_SLUG/);
  assert.match(signup,/t\.membership_role==="owner"/);
  assert.match(signup,/set_active_tenant/);
  assert.match(signup,/window\.location\.assign\("\/crm"\)/);
  assert.match(login,/familyPowerMembership/);
  assert.match(login,/set_active_tenant/);
});

test("DB grants only to real server-verified email; admin account preserved",()=>{
  const sql=read("supabase/migrations/20261110110400_family_power_preapproved_verified_owner.sql");
  assert.match(sql,/auth\.users/);
  assert.match(sql,/family_power_preapproved_owner_on_auth/);
  assert.match(sql,/new\.email_confirmed_at is null/);
  const proof=read("supabase/migrations/20261110111500_family_power_email_confirmation_proof.sql");
  assert.match(proof,/new\.confirmation_sent_at is null/);
  assert.match(proof,/new\.email_confirmed_at < new\.confirmation_sent_at/);
  assert.match(sql,/v_email<>'familypower1@hotmail\.com'/);
  assert.match(sql,/insert into public\.memberships\(tenant_id,user_id,role,status\)/);
  assert.match(sql,/values\(v_tenant,new\.id,'owner','active'\)/);
  assert.match(sql,/new\.id is distinct from v_platform_owner/);
  assert.match(sql,/revoke all on function/);
  assert.doesNotMatch(sql,/insert into public\.tenants|update public\.tenants\s+set owner_user_id/);
});

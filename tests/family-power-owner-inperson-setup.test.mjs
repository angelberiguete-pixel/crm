import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const sql=read("supabase/migrations/20261103201000_family_power_inperson_owner_activation.sql");
const edge=read("supabase/functions/family-power-owner-setup/index.ts");
const owner=read("app/family-power/activar-propietario/page.tsx");
const operator=read("app/platform-admin/family-power-propietario/page.tsx");
const login=read("app/family-power/login/page.tsx");
test("one-time ticket is private, expires and is consumed atomically",()=>{
  assert.match(sql,/private\.family_power_owner_activations/);
  assert.match(sql,/enable row level security/);
  assert.match(sql,/revoke all on private\.family_power_owner_activations from public,anon,authenticated,service_role/i);
  assert.match(sql,/token_sha256 text not null unique/);
  assert.match(sql,/interval '15 minutes'/);
  assert.match(sql,/set claimed_at=now\(\)/);
  assert.match(sql,/a\.claimed_at is null and a\.finalized_at is null/);
  assert.match(sql,/a\.expires_at>now\(\)/);
  for(const name of ["fp_owner_activation_issue","fp_owner_activation_claim","fp_owner_activation_finish"]){
    assert.match(sql,new RegExp("revoke all on function public\\."+name));
    assert.match(sql,new RegExp("grant execute on function public\\."+name));
  }
});
test("owner transfer is tenant-specific, audited and preserves agency as admin",()=>{
  assert.match(sql,/t\.slug='family-power'/);
  assert.match(sql,/pu\.status='active'/);
  assert.match(sql,/owner_already_transferred/);
  assert.match(sql,/insert into public\.memberships\(tenant_id,user_id,role,status\)/);
  assert.match(sql,/values\(v_row\.tenant_id,p_user,'owner','active'\)/);
  assert.match(sql,/update public\.tenants set owner_user_id=p_user/);
  assert.match(sql,/update public\.memberships set role='admin'/);
  assert.match(sql,/family_power\.owner_transferred_in_person/);
  assert.match(sql,/email_ownership_verified',false/);
});
test("edge handler never permits email-only self-registration or exposes secret key",()=>{
  assert.match(edge,/platform_current_access/);
  assert.match(edge,/identity_confirmed!==true\|\|body\.company_controls_email!==true/);
  assert.match(edge,/crypto\.getRandomValues\(new Uint8Array\(32\)\)/);
  assert.match(edge,/crypto\.subtle\.digest\("SHA-256"/);
  assert.match(edge,/if\(action==="claim"\)/);
  assert.match(edge,/email_confirm:true/);
  assert.match(edge,/email_ownership_verified:false/);
  assert.match(edge,/service\.auth\.admin\.createUser/);
  assert.match(edge,/service\.rpc\("fp_owner_activation_finish"/);
  assert.match(edge,/service\.auth\.admin\.deleteUser/);
  assert.doesNotMatch(edge,/console\.log\(.*(ticket|password)/);
  assert.doesNotMatch(owner,/NEXT_PUBLIC_SUPABASE_SERVICE_ROLE|service_role/);
});
test("proprietor chooses password in branded page; token remains in fragment",()=>{
  assert.match(operator,/company_controls_email:true/);
  assert.match(operator,/identity_confirmed:true/);
  assert.match(operator,/activar-propietario#ticket=/);
  assert.match(owner,/window\.history\.replaceState/);
  assert.match(owner,/new URLSearchParams\(window\.location\.hash/);
  assert.match(owner,/autoComplete="new-password"/);
  assert.match(owner,/password\.length<12/);
  assert.match(owner,/action:"claim"/);
  assert.match(owner,/\/family-power\/login/);
  assert.match(login,/supabase\.auth\.signInWithPassword/);
  assert.doesNotMatch(login,/supabase\.auth\.signUp/);
});

test("Family Power login exposes protected first access, not unrestricted signup",()=>{
  const css=read("app/family-power/login/family-login.module.css");
  assert.match(login,/href="\\/family-power\\/activar-propietario"/);
  assert.match(login,/Crear mi contraseña de propietario/);
  assert.match(login,/Acceso por invitación/);
  assert.doesNotMatch(login,/supabase\\.auth\\.signUp/);
  assert.match(css,/ownerRegistrationLink/);
  assert.match(owner,/id="fp-owner-ticket"/);
  assert.match(owner,/onChange=\\{e=>setTicket/);
  assert.match(owner,/disabled=\\{busy\\|\\|!loaded\\|\\|!ticket\\}/);
  assert.match(operator,/id="owner-setup-code"/);
});

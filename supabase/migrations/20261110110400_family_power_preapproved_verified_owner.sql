-- Verified Family Power owner mailbox, pre-approved by Empresia on 2026-11-10.
-- Public registration never assigns roles; Supabase Auth verified email is read on server.
-- Existing platform owner retains their tenant and global administration privileges.
CREATE OR REPLACE FUNCTION private.family_power_preapproved_owner_on_auth()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_tenant uuid;
  v_platform_owner uuid;
  v_email text := lower(btrim(coalesce(new.email,'')));
begin
  -- Never affect any other customer or Supabase user.
  select t.id,t.owner_user_id into v_tenant,v_platform_owner
  from public.tenants t
  where t.slug='family-power' and t.status in ('active','trial')
  limit 1;

  if v_tenant is null then return new; end if;

  -- If the approved owner changes email, immediately suspend their business
  -- membership until they again own and verify the approved mailbox.
  if tg_op='UPDATE' and lower(btrim(coalesce(old.email,'')))='familypower1@hotmail.com'
    and (v_email<>'familypower1@hotmail.com' or new.email_confirmed_at is null)
    and new.id is distinct from v_platform_owner then
    update public.memberships
      set status='suspended',updated_at=now()
      where tenant_id=v_tenant and user_id=new.id and role='owner' and status='active';
  end if;

  if v_email<>'familypower1@hotmail.com' or new.email_confirmed_at is null then
    return new;
  end if;

  -- Serialize this single-account preauthorization against repeated Auth updates.
  perform 1 from public.tenants where id=v_tenant for update;

  insert into public.memberships(tenant_id,user_id,role,status)
  values(v_tenant,new.id,'owner','active')
  on conflict(tenant_id,user_id) do update
    set role='owner',status='active',updated_at=now()
    where public.memberships.role is distinct from 'owner'
       or public.memberships.status is distinct from 'active';

  -- Keep the existing registration review queue consistent for the owner.
  update public.family_power_access_requests
     set status='approved',reviewed_at=coalesce(reviewed_at,now()),
         reviewed_by=coalesce(reviewed_by,v_platform_owner)
   where tenant_id=v_tenant and user_id=new.id
     and email='familypower1@hotmail.com' and status='pending';

  return new;
end;
$function$
;

revoke all on function private.family_power_preapproved_owner_on_auth()
  from public,anon,authenticated;

drop trigger if exists on_family_power_verified_owner_signup on auth.users;
create trigger on_family_power_verified_owner_signup
 after insert or update of email,email_confirmed_at on auth.users
 for each row execute function private.family_power_preapproved_owner_on_auth();

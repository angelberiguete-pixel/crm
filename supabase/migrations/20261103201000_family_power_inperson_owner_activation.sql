-- Family Power owner in-person activation (review-only; no user created by this migration).
-- This is NOT email ownership verification. The platform operator must validate
-- identity face-to-face AND use an address controlled by Family Power.
-- No anonymous access to the activation ledger or privileged RPCs.
create table if not exists private.family_power_owner_activations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  requested_by uuid not null references auth.users(id),
  login_email text not null,
  owner_name text not null,
  token_sha256 text not null unique check(token_sha256 ~ '^[0-9a-f]{64}$'),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  claimed_at timestamptz,
  finalized_at timestamptz,
  created_user_id uuid references auth.users(id)
);
alter table private.family_power_owner_activations enable row level security;
revoke all on private.family_power_owner_activations from public,anon,authenticated,service_role;

-- An Edge Function holding the server-side secret alone can call these RPCs.
-- Every RPC is SECURITY DEFINER with an empty search path, fixed tenant slug
-- and explicit EXECUTE revocation. This avoids exposing private to PostgREST.
create or replace function public.fp_owner_activation_issue(
 p_email text, p_name text, p_hash text, p_actor uuid)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid; v_tenant uuid; v_existing_owner uuid;
begin
 if p_email is null or length(p_email)>254
    or p_email !~* '^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$'
    or p_email <> lower(btrim(p_email))
    or p_name is null or length(btrim(p_name)) not between 3 and 120
    or p_hash !~ '^[0-9a-f]{64}$' then
   raise exception 'invalid_activation_request' using errcode='22023';
 end if;
 if not exists(select 1 from public.platform_users pu where pu.user_id=p_actor and pu.status='active'
      and pu.platform_role in ('platform_admin','platform_owner')) then
   raise exception 'platform_operator_required' using errcode='42501';
 end if;
 select t.id,t.owner_user_id into v_tenant,v_existing_owner
 from public.tenants t where t.slug='family-power' and t.status='active' for update;
 if v_tenant is null then raise exception 'tenant_not_ready'; end if;
 if not exists(select 1 from public.platform_users pu where pu.user_id=v_existing_owner and pu.status='active') then
   raise exception 'owner_already_transferred';
 end if;
 if exists(select 1 from public.memberships m
           where m.tenant_id=v_tenant and m.role='owner' and m.status='active'
             and not exists(select 1 from public.platform_users pu
                            where pu.user_id=m.user_id and pu.status='active')) then
   raise exception 'customer_owner_already_active';
 end if;
 if exists(select 1 from auth.users u where lower(u.email)=p_email) then
   raise exception 'email_already_has_account';
 end if;
 if exists(select 1 from private.family_power_owner_activations a
           where a.tenant_id=v_tenant and a.issued_at>now()-interval '60 seconds') then
   raise exception 'activation_cooldown';
 end if;
 update private.family_power_owner_activations
    set expires_at=now()
    where tenant_id=v_tenant and finalized_at is null and claimed_at is null;
 insert into private.family_power_owner_activations
   (tenant_id,requested_by,login_email,owner_name,token_sha256,expires_at)
 values(v_tenant,p_actor,p_email,btrim(p_name),p_hash,now()+interval '15 minutes')
 returning id into v_id;
 insert into public.audit_logs(id,tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
 values(gen_random_uuid(),v_tenant,p_actor,'family_power.owner_activation_issued','owner_activation',v_id,
 jsonb_build_object('method','in_person','email_ownership_verified',false,'expires_minutes',15));
 return v_id;
end $$;
revoke all on function public.fp_owner_activation_issue(text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.fp_owner_activation_issue(text,text,text,uuid) to service_role;

create or replace function public.fp_owner_activation_claim(p_email text,p_hash text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_row private.family_power_owner_activations%rowtype;
begin
 if p_hash is null or p_hash !~ '^[0-9a-f]{64}$'
    or p_email is null or length(p_email)>254 then
   raise exception 'invalid_or_expired_activation' using errcode='22023';
 end if;
 update private.family_power_owner_activations a
    set claimed_at=now()
 where a.token_sha256=p_hash
   and a.login_email=lower(btrim(p_email))
   and a.claimed_at is null and a.finalized_at is null
   and a.expires_at>now()
 returning a.* into v_row;
 if v_row.id is null then
   raise exception 'invalid_or_expired_activation' using errcode='22023';
 end if;
 return jsonb_build_object('claim_id',v_row.id,'tenant_id',v_row.tenant_id,
     'login_email',v_row.login_email,'owner_name',v_row.owner_name);
end $$;
revoke all on function public.fp_owner_activation_claim(text,text) from public,anon,authenticated;
grant execute on function public.fp_owner_activation_claim(text,text) to service_role;

create or replace function public.fp_owner_activation_finish(p_claim uuid,p_user uuid)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_row private.family_power_owner_activations%rowtype;
        v_current_owner uuid; v_owner_role uuid; v_admin_role uuid;
begin
 select * into v_row from private.family_power_owner_activations
 where id=p_claim for update;
 if v_row.id is null or v_row.claimed_at is null or v_row.finalized_at is not null
    or v_row.expires_at<now() or v_row.claimed_at<now()-interval '5 minutes' then
   raise exception 'invalid_or_expired_activation';
 end if;
 if not exists(select 1 from auth.users u where u.id=p_user
     and lower(u.email)=v_row.login_email and u.email_confirmed_at is not null) then
   raise exception 'new_user_mismatch';
 end if;
 if exists(select 1 from public.platform_users p where p.user_id=p_user)
    or exists(select 1 from public.memberships m where m.user_id=p_user) then
   raise exception 'not_a_new_customer_user';
 end if;
 select t.owner_user_id into v_current_owner from public.tenants t
    where t.id=v_row.tenant_id and t.slug='family-power' and t.status='active' for update;
 if v_current_owner is null or not exists(select 1 from public.platform_users pu
      where pu.user_id=v_current_owner and pu.status='active') then
   raise exception 'owner_transfer_not_permitted';
 end if;
 select tr.id into v_owner_role from public.tenant_roles tr
    where tr.tenant_id=v_row.tenant_id and tr.role_key='owner';
 select tr.id into v_admin_role from public.tenant_roles tr
    where tr.tenant_id=v_row.tenant_id and tr.role_key='admin';
 if v_owner_role is null or v_admin_role is null then raise exception 'roles_missing'; end if;
 insert into public.memberships(tenant_id,user_id,role,status)
   values(v_row.tenant_id,p_user,'owner','active');
 insert into public.tenant_role_bindings(tenant_id,user_id,role_id,created_by)
   values(v_row.tenant_id,p_user,v_owner_role,v_row.requested_by);
 insert into public.user_profiles(user_id,full_name,locale,timezone)
   values(p_user,v_row.owner_name,'es-DO','America/Santo_Domingo')
   on conflict(user_id) do update set full_name=excluded.full_name;
 -- Existing platform operator remains an audited support admin, NOT owner.
 update public.tenants set owner_user_id=p_user,updated_at=now()
   where id=v_row.tenant_id and owner_user_id=v_current_owner;
 update public.memberships set role='admin',updated_at=now()
   where tenant_id=v_row.tenant_id and user_id=v_current_owner;
 update public.tenant_role_bindings set role_id=v_admin_role,updated_at=now()
   where tenant_id=v_row.tenant_id and user_id=v_current_owner;
 update private.family_power_owner_activations
    set finalized_at=now(),created_user_id=p_user where id=p_claim;
 insert into public.audit_logs(id,tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
 values(gen_random_uuid(),v_row.tenant_id,v_row.requested_by,
   'family_power.owner_transferred_in_person','tenant',v_row.tenant_id,
   jsonb_build_object('customer_owner_user_id',p_user,'previous_owner_user_id',v_current_owner,
     'email_ownership_verified',false,'method','one_time_in_person_token'));
 return true;
end $$;
revoke all on function public.fp_owner_activation_finish(uuid,uuid) from public,anon,authenticated;
grant execute on function public.fp_owner_activation_finish(uuid,uuid) to service_role;

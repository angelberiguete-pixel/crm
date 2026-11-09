-- Family Power: authenticated self-registration and platform-only owner approval.
-- Creating an Auth user never grants tenant permissions.
create table if not exists public.family_power_access_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null check (length(btrim(full_name)) between 3 and 120),
  approved_display_name text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  unique(tenant_id,user_id)
);
alter table public.family_power_access_requests enable row level security;
revoke all on public.family_power_access_requests from public,anon,authenticated;
grant select on public.family_power_access_requests to authenticated;
drop policy if exists family_power_requests_platform_read on public.family_power_access_requests;
create policy family_power_requests_platform_read on public.family_power_access_requests
for select to authenticated using (private.crm_is_platform_admin());

-- Users may request access by signing up with their own verified email/password.
-- The signup metadata only queues an unprivileged request; it never assigns a role.
create or replace function private.queue_family_power_registration()
returns trigger language plpgsql security definer set search_path=''
as $fn$
declare v_tenant uuid; v_name text;
begin
  if coalesce(new.raw_user_meta_data->>'registration_source','') <> 'family-power' then
    return new;
  end if;
  v_name:=btrim(coalesce(new.raw_user_meta_data->>'full_name',''));
  if length(v_name)<3 or length(v_name)>120 or nullif(btrim(coalesce(new.email,'')),'') is null then
    return new;
  end if;
  select t.id into v_tenant from public.tenants t where t.slug='family-power' and t.status='active' limit 1;
  if v_tenant is null then return new; end if;
  insert into public.family_power_access_requests(tenant_id,user_id,email,full_name)
  values(v_tenant,new.id,lower(btrim(new.email)),v_name)
  on conflict(tenant_id,user_id) do nothing;
  return new;
end $fn$;
revoke all on function private.queue_family_power_registration() from public,anon,authenticated;
drop trigger if exists on_family_power_auth_registration on auth.users;
create trigger on_family_power_auth_registration after insert on auth.users
for each row execute function private.queue_family_power_registration();

-- Final authorization is an audited, transactional platform-owner-only decision.
create or replace function public.platform_review_family_power_registration(
 p_request_id uuid,p_approve boolean,p_display_name text default null
)
returns jsonb language plpgsql security definer set search_path=''
as $fn$
declare v_req public.family_power_access_requests%rowtype;
        v_owner uuid; v_display text; v_email_verified boolean; v_admin_role uuid;
begin
  if auth.uid() is null or not private.crm_is_platform_owner() then
    raise exception 'Platform owner required' using errcode='42501';
  end if;
  if p_approve is null then raise exception 'Decision required' using errcode='22023'; end if;
  select * into v_req from public.family_power_access_requests
   where id=p_request_id for update;
  if v_req.id is null or v_req.status<>'pending' then
    raise exception 'Pending request not found' using errcode='22023';
  end if;
  if not exists(select 1 from public.tenants where id=v_req.tenant_id and slug='family-power' and status='active') then
    raise exception 'Family Power workspace unavailable' using errcode='22023';
  end if;
  v_display:=btrim(coalesce(p_display_name,''));
  if p_approve then
    if length(v_display)<3 or length(v_display)>120 then
      raise exception 'Approved full name required' using errcode='22023';
    end if;
    select u.email_confirmed_at is not null and lower(u.email)=v_req.email
      into v_email_verified from auth.users u where u.id=v_req.user_id;
    if not coalesce(v_email_verified,false) then
      raise exception 'Email must be verified before approval' using errcode='22023';
    end if;
    select t.owner_user_id into v_owner from public.tenants t where t.id=v_req.tenant_id for update;
    perform public.platform_add_member(v_req.tenant_id,v_req.user_id,'owner','active');
    update public.tenants set owner_user_id=v_req.user_id,updated_at=now() where id=v_req.tenant_id;
    if v_owner is distinct from v_req.user_id then
      update public.memberships set role='admin',updated_at=now()
        where tenant_id=v_req.tenant_id and user_id=v_owner and role='owner';
      select id into v_admin_role from public.tenant_roles
        where tenant_id=v_req.tenant_id and role_key='admin' limit 1;
      if v_admin_role is not null then
        update public.tenant_role_bindings set role_id=v_admin_role,updated_at=now()
          where tenant_id=v_req.tenant_id and user_id=v_owner;
      end if;
    end if;
    insert into public.user_profiles(user_id,full_name)
      values(v_req.user_id,v_display)
      on conflict(user_id) do update set full_name=excluded.full_name,updated_at=now();
  else
    v_display:=null;
  end if;
  update public.family_power_access_requests
    set status=case when p_approve then 'approved' else 'rejected' end,
        approved_display_name=v_display,reviewed_at=now(),reviewed_by=auth.uid()
    where id=v_req.id;
  insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
    values(v_req.tenant_id,auth.uid(),
       case when p_approve then 'family_power.owner_registration_approved' else 'family_power.owner_registration_rejected' end,
       'user',v_req.user_id,
       jsonb_build_object('request_id',v_req.id,'email',v_req.email,'approved_name',v_display));
  return jsonb_build_object('ok',true,'status',case when p_approve then 'approved' else 'rejected' end);
end $fn$;
revoke all on function public.platform_review_family_power_registration(uuid,boolean,text) from public,anon;
grant execute on function public.platform_review_family_power_registration(uuid,boolean,text) to authenticated;

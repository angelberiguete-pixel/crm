-- Deterministic tenant context for multi-tenant CRM navigation.
-- Keeps the platform owner/client support flow on the tenant explicitly selected
-- from the AUREVECTOR console instead of relying on an unordered membership row.

create table if not exists private.user_active_tenants (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  updated_at timestamptz not null default now()
);

revoke all on table private.user_active_tenants from public, anon, authenticated;

create or replace function private.crm_active_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select uat.tenant_id
  from private.user_active_tenants uat
  where uat.user_id = auth.uid()
$$;

create or replace function private.crm_active_tenant_matches(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select uat.tenant_id = p_tenant_id
      from private.user_active_tenants uat
      where uat.user_id = auth.uid()
    ),
    true
  )
$$;

grant execute on function private.crm_active_tenant_id() to authenticated;
grant execute on function private.crm_active_tenant_matches(uuid) to authenticated;

create or replace function public.list_my_tenants()
returns table (
  tenant_id uuid,
  tenant_name text,
  tenant_slug text,
  membership_role text,
  is_active boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    t.id,
    t.name,
    t.slug,
    m.role,
    (uat.tenant_id = t.id) as is_active
  from public.memberships m
  join public.tenants t on t.id = m.tenant_id
  left join private.user_active_tenants uat on uat.user_id = m.user_id
  where m.user_id = auth.uid()
    and m.status = 'active'
  order by (uat.tenant_id = t.id) desc nulls last, t.name
$$;

grant execute on function public.list_my_tenants() to authenticated;
revoke all on function public.list_my_tenants() from anon;

create or replace function public.set_active_tenant(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select m.role
    into v_role
  from public.memberships m
  where m.user_id = v_user_id
    and m.tenant_id = p_tenant_id
    and m.status = 'active';

  if v_role is null then
    raise exception 'Active tenant membership required';
  end if;

  insert into private.user_active_tenants(user_id, tenant_id, updated_at)
  values(v_user_id, p_tenant_id, now())
  on conflict(user_id) do update
    set tenant_id = excluded.tenant_id,
        updated_at = now();

  insert into public.audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
  values(
    p_tenant_id,
    v_user_id,
    'tenant.active_context_changed',
    'tenant',
    p_tenant_id,
    jsonb_build_object('role', v_role)
  );

  return jsonb_build_object('tenant_id', p_tenant_id, 'role', v_role);
end;
$$;

grant execute on function public.set_active_tenant(uuid) to authenticated;
revoke all on function public.set_active_tenant(uuid) from anon;

create or replace function public.clear_active_tenant()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  delete from private.user_active_tenants
  where user_id = v_user_id;

  return true;
end;
$$;

grant execute on function public.clear_active_tenant() to authenticated;
revoke all on function public.clear_active_tenant() from anon;

-- Once a user explicitly selects a tenant, ordinary membership reads are scoped
-- to that tenant. Users without an active preference keep the previous behavior,
-- preserving onboarding and existing single-tenant accounts.
drop policy if exists memberships_select on public.memberships;
create policy memberships_select on public.memberships
for select
using (
  private.has_tenant_access(tenant_id)
  and private.crm_active_tenant_matches(tenant_id)
);

-- Platform support access now also establishes the active tenant context and
-- never demotes an existing owner membership to admin.
create or replace function public.platform_join_tenant_as_admin(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  if not private.crm_is_platform_admin() then
    raise exception 'Platform admin required';
  end if;

  insert into public.memberships as m(tenant_id, user_id, role, status)
  values(p_tenant_id, auth.uid(), 'admin', 'active')
  on conflict(tenant_id, user_id) do update
    set role = case when m.role = 'owner' then 'owner' else 'admin' end,
        status = 'active'
  returning role into v_role;

  insert into private.user_active_tenants(user_id, tenant_id, updated_at)
  values(auth.uid(), p_tenant_id, now())
  on conflict(user_id) do update
    set tenant_id = excluded.tenant_id,
        updated_at = now();

  insert into public.audit_logs(tenant_id, actor_user_id, action, entity_type, metadata)
  values(
    p_tenant_id,
    auth.uid(),
    'platform.support_access_granted',
    'membership',
    jsonb_build_object(
      'reason', 'platform_admin_tenant_access',
      'active_tenant_context', true,
      'role', v_role
    )
  );

  return jsonb_build_object('tenant_id', p_tenant_id, 'role', v_role);
end;
$$;

grant execute on function public.platform_join_tenant_as_admin(uuid) to authenticated;
revoke all on function public.platform_join_tenant_as_admin(uuid) from anon;

create or replace function private.crm_clear_active_tenant_on_membership_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from private.user_active_tenants
    where user_id = old.user_id
      and tenant_id = old.tenant_id;
    return old;
  end if;

  if old.status = 'active' and new.status <> 'active' then
    delete from private.user_active_tenants
    where user_id = old.user_id
      and tenant_id = old.tenant_id;
  end if;

  return new;
end;
$$;

drop trigger if exists memberships_clear_active_tenant on public.memberships;
create trigger memberships_clear_active_tenant
after update of status or delete on public.memberships
for each row execute function private.crm_clear_active_tenant_on_membership_change();

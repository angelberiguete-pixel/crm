create or replace function private.membership_role_for_tenant_role(p_role_key text)
returns text
language sql
immutable
set search_path=''
as $$
  select case
    when p_role_key='owner' then 'owner'
    when p_role_key in ('admin','admin_business') then 'admin'
    when p_role_key='manager' then 'manager'
    when p_role_key='viewer' then 'viewer'
    else 'agent'
  end
$$;

create or replace function public.platform_set_member_role(p_tenant_id uuid, p_user_id uuid, p_role_key text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_role_id uuid;
  v_membership_role text;
begin
  if not private.crm_is_platform_admin() then raise exception 'Platform admin required'; end if;

  select tr.id into v_role_id
  from public.tenant_roles tr
  where tr.tenant_id=p_tenant_id and tr.role_key=p_role_key
  limit 1;
  if v_role_id is null then raise exception 'Tenant role not found'; end if;

  v_membership_role := private.membership_role_for_tenant_role(p_role_key);

  update public.memberships
  set role=v_membership_role,status='active',updated_at=now()
  where tenant_id=p_tenant_id and user_id=p_user_id;
  if not found then raise exception 'Membership not found'; end if;

  insert into public.tenant_role_bindings(tenant_id,user_id,role_id,created_by)
  values(p_tenant_id,p_user_id,v_role_id,auth.uid())
  on conflict(tenant_id,user_id) do update set role_id=excluded.role_id,updated_at=now();

  insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
  values(p_tenant_id,auth.uid(),'platform.member_role_changed','membership',p_user_id,jsonb_build_object('role_key',p_role_key,'base_role',v_membership_role));

  return jsonb_build_object('tenant_id',p_tenant_id,'user_id',p_user_id,'role_key',p_role_key,'base_role',v_membership_role);
end;
$$;

create or replace function public.platform_add_member(
  p_tenant_id uuid,
  p_user_id uuid,
  p_role_key text,
  p_status text default 'invited'
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_role_id uuid;
  v_membership_role text;
begin
  if not private.crm_is_platform_admin() then raise exception 'Platform admin required'; end if;
  if p_status not in ('invited','active') then raise exception 'Invalid membership status'; end if;

  select tr.id into v_role_id
  from public.tenant_roles tr
  where tr.tenant_id=p_tenant_id and tr.role_key=p_role_key
  limit 1;
  if v_role_id is null then raise exception 'Tenant role not found'; end if;

  v_membership_role := private.membership_role_for_tenant_role(p_role_key);

  insert into public.memberships(tenant_id,user_id,role,status)
  values(p_tenant_id,p_user_id,v_membership_role,p_status)
  on conflict(tenant_id,user_id) do update
    set role=excluded.role,status=excluded.status,updated_at=now();

  insert into public.tenant_role_bindings(tenant_id,user_id,role_id,created_by)
  values(p_tenant_id,p_user_id,v_role_id,auth.uid())
  on conflict(tenant_id,user_id) do update
    set role_id=excluded.role_id,updated_at=now();

  insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
  values(p_tenant_id,auth.uid(),'platform.member_invited','membership',p_user_id,jsonb_build_object('role_key',p_role_key,'status',p_status));

  return jsonb_build_object('tenant_id',p_tenant_id,'user_id',p_user_id,'role_key',p_role_key,'status',p_status);
end;
$$;

create or replace function public.accept_my_tenant_invites()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := auth.uid();
  v_tenant uuid;
  v_count integer;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  update public.memberships
  set status='active',updated_at=now()
  where user_id=v_user and status='invited';

  get diagnostics v_count = row_count;

  select m.tenant_id into v_tenant
  from public.memberships m
  where m.user_id=v_user and m.status='active'
  order by m.updated_at desc,m.created_at desc
  limit 1;

  if v_tenant is not null then
    insert into private.user_active_tenants(user_id,tenant_id,updated_at)
    values(v_user,v_tenant,now())
    on conflict(user_id) do update set tenant_id=excluded.tenant_id,updated_at=now();

    insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
    values(v_tenant,v_user,'tenant.invitation_accepted','membership',v_user,jsonb_build_object('activated_memberships',v_count));
  end if;

  return jsonb_build_object('activated',v_count,'tenant_id',v_tenant);
end;
$$;

revoke all on function private.membership_role_for_tenant_role(text) from public, anon, authenticated;
revoke all on function public.platform_add_member(uuid,uuid,text,text) from public, anon;
revoke all on function public.accept_my_tenant_invites() from public, anon;
grant execute on function public.platform_add_member(uuid,uuid,text,text) to authenticated;
grant execute on function public.accept_my_tenant_invites() to authenticated;

-- Additional control-plane RPCs for Eurevector Platform Owner.

create or replace function public.platform_admin_plans()
returns setof jsonb
language plpgsql
security definer
set search_path=''
as $$
begin
  if not private.crm_is_platform_admin() then raise exception 'Platform admin required'; end if;
  return query select to_jsonb(p) from public.plans p order by p.code;
end;
$$;
revoke all on function public.platform_admin_plans() from public,anon;
grant execute on function public.platform_admin_plans() to authenticated;

create or replace function public.platform_set_member_role(p_tenant_id uuid,p_user_id uuid,p_role_key text)
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

  v_membership_role := case when p_role_key in ('owner','admin') then p_role_key else 'member' end;

  update public.memberships
  set role=v_membership_role,status='active'
  where tenant_id=p_tenant_id and user_id=p_user_id;
  if not found then raise exception 'Membership not found'; end if;

  insert into public.tenant_role_bindings(tenant_id,user_id,role_id,created_by)
  values(p_tenant_id,p_user_id,v_role_id,auth.uid())
  on conflict(tenant_id,user_id) do update set role_id=excluded.role_id,updated_at=now();

  insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id)
  values(p_tenant_id,auth.uid(),'platform.member_role_changed','membership',p_user_id);

  return jsonb_build_object('tenant_id',p_tenant_id,'user_id',p_user_id,'role_key',p_role_key);
end;
$$;
revoke all on function public.platform_set_member_role(uuid,uuid,text) from public,anon;
grant execute on function public.platform_set_member_role(uuid,uuid,text) to authenticated;

create or replace function public.platform_admin_tenant_roles(p_tenant_id uuid)
returns table(role_key text,role_name text,description text,permissions jsonb,is_system boolean)
language plpgsql
security definer
set search_path=''
as $$
begin
  if not private.crm_is_platform_admin() then raise exception 'Platform admin required'; end if;
  return query
  select tr.role_key,tr.name,tr.description,tr.permissions,tr.is_system
  from public.tenant_roles tr
  where tr.tenant_id=p_tenant_id
  order by case tr.role_key when 'owner' then 0 when 'admin' then 1 when 'manager' then 2 when 'sales' then 3 when 'viewer' then 4 else 10 end,tr.name;
end;
$$;
revoke all on function public.platform_admin_tenant_roles(uuid) from public,anon;
grant execute on function public.platform_admin_tenant_roles(uuid) to authenticated;

create or replace function public.platform_set_member_role(p_tenant_id uuid, p_user_id uuid, p_role_key text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_role_id uuid;
  v_membership_role text;
  v_status text;
begin
  if not private.crm_is_platform_admin() then raise exception 'Platform admin required'; end if;

  select tr.id into v_role_id
  from public.tenant_roles tr
  where tr.tenant_id=p_tenant_id and tr.role_key=p_role_key
  limit 1;
  if v_role_id is null then raise exception 'Tenant role not found'; end if;

  v_membership_role := private.membership_role_for_tenant_role(p_role_key);

  update public.memberships
  set role=v_membership_role,updated_at=now()
  where tenant_id=p_tenant_id and user_id=p_user_id
  returning status into v_status;
  if not found then raise exception 'Membership not found'; end if;

  insert into public.tenant_role_bindings(tenant_id,user_id,role_id,created_by)
  values(p_tenant_id,p_user_id,v_role_id,auth.uid())
  on conflict(tenant_id,user_id) do update set role_id=excluded.role_id,updated_at=now();

  insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
  values(p_tenant_id,auth.uid(),'platform.member_role_changed','membership',p_user_id,jsonb_build_object('role_key',p_role_key,'base_role',v_membership_role,'membership_status',v_status));

  return jsonb_build_object('tenant_id',p_tenant_id,'user_id',p_user_id,'role_key',p_role_key,'base_role',v_membership_role,'status',v_status);
end;
$$;

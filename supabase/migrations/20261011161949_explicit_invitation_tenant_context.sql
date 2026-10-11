create or replace function public.accept_my_tenant_invites()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_tenant uuid; v_count integer; v_memberships integer;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  with activated as (
    update public.memberships m set status='active',updated_at=now()
    from public.tenants t where m.user_id=v_user and m.status='invited' and t.id=m.tenant_id and t.status in ('active','trial')
    returning m.tenant_id
  ), audited as (
    insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
    select tenant_id,v_user,'tenant.invitation_accepted','membership',v_user,jsonb_build_object('context_selection','explicit_or_single_membership') from activated
    returning id
  ) select count(*) into v_count from audited;

  select count(*) into v_memberships from public.memberships m join public.tenants t on t.id=m.tenant_id
  where m.user_id=v_user and m.status='active' and t.status in ('active','trial');
  -- Preserve a deliberate, still-authorized choice. Never choose the newest row.
  select a.tenant_id into v_tenant from private.user_active_tenants a
  join public.memberships m on m.tenant_id=a.tenant_id and m.user_id=a.user_id and m.status='active'
  join public.tenants t on t.id=m.tenant_id and t.status in ('active','trial') where a.user_id=v_user;
  if v_tenant is null and v_memberships=1 then
    select m.tenant_id into v_tenant from public.memberships m join public.tenants t on t.id=m.tenant_id
    where m.user_id=v_user and m.status='active' and t.status in ('active','trial');
  end if;
  if v_tenant is not null then
    insert into private.user_active_tenants(user_id,tenant_id,updated_at) values(v_user,v_tenant,now())
    on conflict(user_id) do update set tenant_id=excluded.tenant_id,updated_at=now();
  else delete from private.user_active_tenants where user_id=v_user; end if;
  return jsonb_build_object('activated',v_count,'tenant_id',v_tenant,'membership_count',v_memberships,'needs_selection',v_memberships>1 and v_tenant is null);
end;
$$;

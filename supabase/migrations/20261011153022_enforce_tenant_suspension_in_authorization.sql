create or replace function private.crm_tenant_is_operational(p_tenant_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.tenants t where t.id=p_tenant_id and t.status in ('active','trial')); $$;
revoke all on function private.crm_tenant_is_operational(uuid) from public,anon,authenticated;

create or replace function private.has_tenant_access(p_tenant_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select private.is_platform_admin() or (private.crm_tenant_is_operational(p_tenant_id) and exists(
 select 1 from public.memberships m where m.tenant_id=p_tenant_id and m.user_id=(select auth.uid()) and m.status='active'
)); $$;

create or replace function private.has_tenant_role(p_tenant_id uuid,p_roles text[])
returns boolean language sql stable security definer set search_path=''
as $$ select private.is_platform_admin() or (private.crm_tenant_is_operational(p_tenant_id) and exists(
 select 1 from public.memberships m where m.tenant_id=p_tenant_id and m.user_id=(select auth.uid()) and m.status='active' and m.role=any(p_roles)
)); $$;

create or replace function private.is_tenant_admin(p_tenant_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select private.has_tenant_role(p_tenant_id,array['owner','admin']::text[]); $$;

create or replace function private.crm_is_tenant_member(p_tenant_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select private.has_tenant_access(p_tenant_id); $$;

create or replace function private.crm_is_tenant_admin(p_tenant_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select private.is_tenant_admin(p_tenant_id); $$;

create or replace function public.tenant_current_permissions(p_tenant_id uuid)
returns jsonb language sql stable security definer set search_path=''
as $$ select case when private.crm_is_platform_admin() then '{"all":true}'::jsonb
else coalesce((select tr.permissions from public.tenant_role_bindings b
 join public.tenant_roles tr on tr.id=b.role_id and tr.tenant_id=b.tenant_id
 join public.memberships m on m.tenant_id=b.tenant_id and m.user_id=b.user_id and m.status='active'
 join public.tenants t on t.id=m.tenant_id and t.status in ('active','trial')
 where b.tenant_id=p_tenant_id and b.user_id=auth.uid() limit 1),'{}'::jsonb) end; $$;

create or replace function public.list_my_tenants()
returns table(tenant_id uuid,tenant_name text,tenant_slug text,membership_role text,is_active boolean)
language sql stable security definer set search_path=''
as $$ select t.id,t.name,t.slug,m.role,coalesce(uat.tenant_id=t.id,false)
 from public.memberships m join public.tenants t on t.id=m.tenant_id
 left join private.user_active_tenants uat on uat.user_id=m.user_id
 where m.user_id=auth.uid() and m.status='active'
 and (t.status in ('active','trial') or private.crm_is_platform_admin())
 order by (uat.tenant_id=t.id) desc nulls last,t.name; $$;

create or replace function public.set_active_tenant(p_tenant_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_user_id uuid:=auth.uid(); v_role text;
begin
 if v_user_id is null then raise exception 'Authentication required'; end if;
 select m.role into v_role from public.memberships m join public.tenants t on t.id=m.tenant_id
 where m.user_id=v_user_id and m.tenant_id=p_tenant_id and m.status='active'
 and (t.status in ('active','trial') or private.crm_is_platform_admin());
 if v_role is null then raise exception 'Active tenant membership required'; end if;
 insert into private.user_active_tenants(user_id,tenant_id,updated_at) values(v_user_id,p_tenant_id,now())
 on conflict(user_id) do update set tenant_id=excluded.tenant_id,updated_at=now();
 insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
 values(p_tenant_id,v_user_id,'tenant.active_context_changed','tenant',p_tenant_id,jsonb_build_object('role',v_role));
 return jsonb_build_object('tenant_id',p_tenant_id,'role',v_role);
end; $$;


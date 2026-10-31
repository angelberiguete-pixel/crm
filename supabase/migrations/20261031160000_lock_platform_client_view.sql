-- Session-scoped client view for platform owners.
-- Once an owner opens a client's company the SAME login loses platform
-- capabilities until sign-out. This is enforced server-side, not only in UI.
create table if not exists private.platform_client_view_sessions (
 user_id uuid not null references auth.users(id) on delete cascade,
 session_id text not null check(length(session_id) between 20 and 160),
 tenant_id uuid not null references public.tenants(id) on delete cascade,
 entered_at timestamptz not null default now(),
 primary key(user_id,session_id)
);
revoke all on private.platform_client_view_sessions from public,anon,authenticated;

create or replace function private.platform_client_view_tenant()
returns uuid language sql stable security definer set search_path=''
as $$
 select v.tenant_id from private.platform_client_view_sessions v
 where v.user_id=(select auth.uid())
  and v.session_id=(select auth.jwt()->>'session_id')
 limit 1
$$;

create or replace function private.crm_is_platform_admin()
returns boolean language sql stable security definer set search_path=''
as $$
 select private.platform_client_view_tenant() is null
   and exists(select 1 from public.platform_users pu
     where pu.user_id=(select auth.uid()) and pu.status='active'
       and pu.platform_role in ('platform_owner','platform_admin'));
$$;

-- Ensure client-view sessions cannot read other companies via direct REST.
create or replace function private.has_tenant_access(p_tenant_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
 select (private.platform_client_view_tenant() is null
   or private.platform_client_view_tenant()=p_tenant_id)
  and (private.is_platform_admin()
       or (private.crm_tenant_is_operational(p_tenant_id)
         and exists(select 1 from public.memberships m
           where m.tenant_id=p_tenant_id and m.user_id=(select auth.uid()) and m.status='active')));
$$;
create or replace function private.has_tenant_role(p_tenant_id uuid,p_roles text[])
returns boolean language sql stable security definer set search_path=''
as $$
 select (private.platform_client_view_tenant() is null
   or private.platform_client_view_tenant()=p_tenant_id)
  and (private.is_platform_admin()
       or (private.crm_tenant_is_operational(p_tenant_id)
         and exists(select 1 from public.memberships m
           where m.tenant_id=p_tenant_id and m.user_id=(select auth.uid())
             and m.status='active' and m.role=any(p_roles))));
$$;

create or replace function public.platform_current_access()
returns jsonb language sql stable security definer set search_path=''
as $$
 select jsonb_build_object(
   'is_platform_admin',private.crm_is_platform_admin(),
   'is_platform_user',private.crm_is_platform_user()
      and private.platform_client_view_tenant() is null,
   'role',case when private.platform_client_view_tenant() is null then
     (select pu.platform_role from public.platform_users pu
       where pu.user_id=auth.uid() and pu.status='active' limit 1)
     else null end);
$$;

create or replace function public.list_my_tenants()
returns table(tenant_id uuid,tenant_name text,tenant_slug text,membership_role text,is_active boolean)
language sql stable security definer set search_path=''
as $$
 select t.id,t.name,t.slug,m.role,coalesce(uat.tenant_id=t.id,false)
 from public.memberships m join public.tenants t on t.id=m.tenant_id
 left join private.user_active_tenants uat on uat.user_id=m.user_id
 where m.user_id=auth.uid() and m.status='active'
   and (t.status in ('active','trial') or private.crm_is_platform_admin())
   and (private.platform_client_view_tenant() is null
       or t.id=private.platform_client_view_tenant())
 order by (uat.tenant_id=t.id) desc nulls last,t.name;
$$;

create or replace function public.set_active_tenant(p_tenant_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_user_id uuid:=auth.uid();v_role text;
begin
 if v_user_id is null then raise exception 'Authentication required' using errcode='42501';end if;
 if private.platform_client_view_tenant() is not null
   and private.platform_client_view_tenant()<>p_tenant_id
 then raise exception 'Cierra sesión antes de volver a la administración de plataforma' using errcode='42501';end if;
 select m.role into v_role from public.memberships m join public.tenants t on t.id=m.tenant_id
 where m.user_id=v_user_id and m.tenant_id=p_tenant_id and m.status='active'
   and (t.status in ('active','trial') or private.crm_is_platform_admin());
 if v_role is null then raise exception 'Active tenant membership required' using errcode='42501';end if;
 insert into private.user_active_tenants(user_id,tenant_id,updated_at)
 values(v_user_id,p_tenant_id,now())
 on conflict(user_id) do update set tenant_id=excluded.tenant_id,updated_at=now();
 insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
 values(p_tenant_id,v_user_id,'tenant.active_context_changed','tenant',p_tenant_id,
        jsonb_build_object('role',v_role));
 return jsonb_build_object('tenant_id',p_tenant_id,'role',v_role);
end;
$$;

create or replace function public.platform_join_tenant_as_admin(p_tenant_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_role text;v_slug text;v_session text;
begin
 if not private.crm_is_platform_admin()
 then raise exception 'Platform admin required' using errcode='42501';end if;
 select t.slug into v_slug from public.tenants t where t.id=p_tenant_id
   and t.status in ('active','trial');
 if v_slug is null then raise exception 'Company not active' using errcode='P0002';end if;
 v_session:=auth.jwt()->>'session_id';
 if length(coalesce(v_session,'')) not between 20 and 160
 then raise exception 'Valid authenticated session required for tenant isolation' using errcode='42501';end if;
 insert into public.memberships as m(tenant_id,user_id,role,status)
 values(p_tenant_id,auth.uid(),'admin','active')
 on conflict(tenant_id,user_id) do update
   set role=case when m.role='owner' then 'owner' else 'admin' end,status='active'
 returning role into v_role;
 insert into private.user_active_tenants(user_id,tenant_id,updated_at)
 values(auth.uid(),p_tenant_id,now())
 on conflict(user_id) do update set tenant_id=excluded.tenant_id,updated_at=now();

 -- Only opening an external/client business enters locked customer-view mode.
 if v_slug<>'eurevector' then
   insert into private.platform_client_view_sessions(user_id,session_id,tenant_id)
   values(auth.uid(),v_session,p_tenant_id)
   on conflict(user_id,session_id) do nothing;
 end if;
 insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,metadata)
 values(p_tenant_id,auth.uid(),'platform.support_access_granted','membership',
   jsonb_build_object('reason','support_access','role',v_role,
                      'client_view_locked_until_signout',v_slug<>'eurevector'));
 return jsonb_build_object('tenant_id',p_tenant_id,'role',v_role,
   'client_view_locked',v_slug<>'eurevector');
end;
$$;

-- Tenant admin permissions remain company-scoped while the platform
-- owner is in a session locked to a specific client.
create or replace function public.tenant_current_permissions(p_tenant_id uuid)
returns jsonb language sql stable security definer set search_path=''
as $$
 select case when not private.crm_active_tenant_matches(p_tenant_id)
   or (private.platform_client_view_tenant() is not null
       and private.platform_client_view_tenant()<>p_tenant_id)
   then '{}'::jsonb
   when private.crm_is_platform_admin() then '{"all":true}'::jsonb
   when private.platform_client_view_tenant()=p_tenant_id
     and private.has_tenant_role(p_tenant_id,array['owner','admin']::text[])
   then '{"all":true}'::jsonb
   else coalesce((
     select tr.permissions from public.tenant_role_bindings b
     join public.tenant_roles tr on tr.id=b.role_id and tr.tenant_id=b.tenant_id
     join public.memberships m on m.tenant_id=b.tenant_id and m.user_id=b.user_id
       and m.status='active'
     join public.tenants t on t.id=m.tenant_id and t.status in ('active','trial')
     where b.tenant_id=p_tenant_id and b.user_id=auth.uid() limit 1
   ),'{}'::jsonb) end;
$$;

comment on function private.platform_client_view_tenant()
 is 'Session-scoped, server-owned customer view; platform navigation and all platform admin bypasses are unavailable until signout.';

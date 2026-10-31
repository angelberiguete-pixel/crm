-- In a locked customer session, actual owner/admin membership grants customer
-- modules, but never platform-only permissions. A platform support operator
-- joined as tenant-admin must see that tenant's standard admin tools.
create or replace function public.tenant_current_permissions(p_tenant_id uuid)
returns jsonb language sql stable security definer set search_path=''
as $$
 select case
   when auth.uid() is null or not private.crm_active_tenant_matches(p_tenant_id)
     then '{}'::jsonb
   when private.crm_is_platform_admin() then '{"all":true}'::jsonb
   when exists(select 1 from public.memberships m
     where m.tenant_id=p_tenant_id and m.user_id=auth.uid()
       and m.status='active' and m.role in ('owner','admin'))
     then '{"all":true}'::jsonb
   else coalesce((
     select tr.permissions from public.tenant_role_bindings b
     join public.tenant_roles tr on tr.id=b.role_id and tr.tenant_id=b.tenant_id
     join public.memberships m on m.tenant_id=b.tenant_id
       and m.user_id=b.user_id and m.status='active'
     join public.tenants t on t.id=m.tenant_id and t.status in ('active','trial')
     where b.tenant_id=p_tenant_id and b.user_id=auth.uid() limit 1
   ),'{}'::jsonb)
 end;
$$;

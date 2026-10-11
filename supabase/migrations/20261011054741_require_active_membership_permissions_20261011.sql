-- LOOK SOCIAL MEDIA CRM: membership status guard.
create or replace function public.tenant_current_permissions(p_tenant_id uuid)
returns jsonb language sql stable security definer set search_path = ''
as $function$
select case when private.crm_is_platform_admin() then '{"all":true}'::jsonb
else coalesce((select tr.permissions from public.tenant_role_bindings b
join public.tenant_roles tr on tr.id=b.role_id and tr.tenant_id=b.tenant_id
join public.memberships m on m.tenant_id=b.tenant_id and m.user_id=b.user_id and m.status='active'
where b.tenant_id=p_tenant_id and b.user_id=auth.uid() limit 1),'{}'::jsonb) end;
$function$;

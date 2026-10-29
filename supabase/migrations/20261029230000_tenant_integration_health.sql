-- Tenant-scoped integration truth. This is a READ-ONLY snapshot, not a connection.
-- Never returns access tokens, API keys, webhook secrets, email OAuth data or full provider IDs.
-- Uses existing channel request ledger and verified Meta phone route mapping.
create or replace function public.tenant_integration_health(p_tenant_id uuid)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_result jsonb;
  v_whatsapp boolean;
  v_agents integer;
  v_ai_spending_enabled boolean := false;
begin
  if auth.uid() is null or p_tenant_id is null
     or not (private.is_tenant_admin(p_tenant_id) or private.is_platform_admin()) then
    raise exception 'tenant_admin_required' using errcode='42501';
  end if;
  if not exists(select 1 from public.tenants where id=p_tenant_id and status='active') then
    raise exception 'tenant_not_active' using errcode='42501';
  end if;
  select exists(
    select 1 from public.meta_whatsapp_routes r
    join public.channels c on c.id=r.channel_id and c.tenant_id=r.tenant_id
    where r.tenant_id=p_tenant_id and r.is_enabled=true
      and r.verified_at is not null and c.status='connected'
      and c.provider='whatsapp'
  ) into v_whatsapp;
  select count(*) into v_agents from public.ai_agents a
    where a.tenant_id=p_tenant_id and a.status in ('draft','active','paused');
  select coalesce(has_function_privilege('service_role',p.oid,'EXECUTE'),false)
    into v_ai_spending_enabled
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='reserve_ai_employee_budgeted_trial'
    limit 1;
  return pg_catalog.jsonb_build_object(
    'tenant_id',p_tenant_id,
    'whatsapp_verified_route',v_whatsapp,
    'ai_spending_blocked',not coalesce(v_ai_spending_enabled,false),
    'staff_profiles',v_agents,
    'channels',coalesce((
       select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
         'id',c.id,'provider',c.provider,'name',left(c.name,90),
         'record_status',c.status,
         'verified',case when c.provider='whatsapp' then
             exists(select 1 from public.meta_whatsapp_routes r
                where r.tenant_id=p_tenant_id and r.channel_id=c.id
                  and r.is_enabled and r.verified_at is not null and c.status='connected')
           else false end
       ) order by c.provider,c.created_at)
       from public.channels c
       where c.tenant_id=p_tenant_id and c.provider in ('whatsapp','instagram','email')
    ),'[]'::jsonb)
  );
end;
$$;
revoke all on function public.tenant_integration_health(uuid) from PUBLIC,anon,authenticated;
grant execute on function public.tenant_integration_health(uuid) to authenticated;
comment on function public.tenant_integration_health(uuid) is
  'Safe per-tenant integration readiness. Only authenticated tenant administrators; no provider secrets, no unverified connected claims.';
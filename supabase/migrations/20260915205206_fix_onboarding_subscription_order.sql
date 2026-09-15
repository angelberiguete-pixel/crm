-- Keep onboarding compatible with the current subscription foreign-key lifecycle.
-- Production already contains this change; this file brings the repository back in sync.

create or replace function private.create_tenant_impl(p_name text, p_slug text)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_plan_id uuid;
  v_pipeline_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_name is null or length(trim(p_name)) < 2 then
    raise exception 'Tenant name is required';
  end if;

  if p_slug is null or p_slug !~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$' then
    raise exception 'Invalid tenant slug';
  end if;

  insert into public.tenants(name, slug, owner_user_id)
  values (trim(p_name), lower(p_slug), v_user_id)
  returning id into v_tenant_id;

  select id
  into v_plan_id
  from public.plans
  where code = 'starter'
  limit 1;

  if v_plan_id is not null then
    insert into public.tenant_subscriptions(tenant_id, plan_id, status, provider)
    values (v_tenant_id, v_plan_id, 'trialing', 'manual');
  end if;

  insert into public.memberships(tenant_id, user_id, role, status)
  values (v_tenant_id, v_user_id, 'owner', 'active');

  insert into public.tenant_settings(tenant_id, brand_name)
  values (v_tenant_id, trim(p_name));

  insert into public.pipelines(tenant_id, name, is_default, created_by)
  values (v_tenant_id, 'Ventas', true, v_user_id)
  returning id into v_pipeline_id;

  insert into public.pipeline_stages(
    tenant_id,
    pipeline_id,
    name,
    position,
    win_probability,
    stage_type
  )
  values
    (v_tenant_id, v_pipeline_id, 'Nuevo', 10, 0.10, 'open'),
    (v_tenant_id, v_pipeline_id, 'Calificado', 20, 0.30, 'open'),
    (v_tenant_id, v_pipeline_id, 'Propuesta', 30, 0.60, 'open'),
    (v_tenant_id, v_pipeline_id, 'Negociación', 40, 0.80, 'open'),
    (v_tenant_id, v_pipeline_id, 'Ganado', 50, 1.00, 'won'),
    (v_tenant_id, v_pipeline_id, 'Perdido', 60, 0.00, 'lost');

  insert into public.audit_logs(
    tenant_id,
    actor_user_id,
    action,
    entity_type,
    entity_id
  )
  values (v_tenant_id, v_user_id, 'tenant.created', 'tenant', v_tenant_id);

  return v_tenant_id;
end;
$function$;

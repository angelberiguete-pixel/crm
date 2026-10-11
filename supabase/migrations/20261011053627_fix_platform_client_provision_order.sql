create or replace function public.platform_create_client_tenant(
  p_name text,
  p_slug text,
  p_plan_code text default 'starter',
  p_vertical text default null,
  p_template_key text default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_plan_id uuid;
  v_pipeline_id uuid;
  v_template_exists boolean := false;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if not private.crm_is_platform_admin() then raise exception 'Platform admin required'; end if;
  if p_name is null or length(trim(p_name)) < 2 then raise exception 'Tenant name is required'; end if;
  if p_slug is null or p_slug !~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$' then raise exception 'Invalid tenant slug'; end if;

  select p.id into v_plan_id
  from public.plans p
  where p.code=p_plan_code and p.is_active
  limit 1;
  if v_plan_id is null then raise exception 'Plan not found or inactive'; end if;

  if p_template_key is not null then
    select exists(
      select 1 from public.crm_templates ct
      where ct.template_key=p_template_key and ct.status='active'
    ) into v_template_exists;
    if not v_template_exists then raise exception 'CRM template not found or inactive'; end if;
  end if;

  insert into public.tenants(name,slug,owner_user_id)
  values(trim(p_name),lower(p_slug),v_user_id)
  returning id into v_tenant_id;

  -- The subscription must exist before membership insertion because quota
  -- enforcement resolves the enabled users feature from the active plan.
  insert into public.tenant_subscriptions(tenant_id,plan_id,status,provider)
  values(v_tenant_id,v_plan_id,'active','manual');

  insert into public.memberships(tenant_id,user_id,role,status)
  values(v_tenant_id,v_user_id,'owner','active');

  insert into public.tenant_settings(tenant_id,brand_name)
  values(v_tenant_id,trim(p_name));

  insert into public.pipelines(tenant_id,name,is_default,created_by)
  values(v_tenant_id,'Ventas',true,v_user_id)
  returning id into v_pipeline_id;

  insert into public.pipeline_stages(tenant_id,pipeline_id,name,position,win_probability,stage_type)
  values
    (v_tenant_id,v_pipeline_id,'Nuevo',10,0.10,'open'),
    (v_tenant_id,v_pipeline_id,'Calificado',20,0.30,'open'),
    (v_tenant_id,v_pipeline_id,'Propuesta',30,0.60,'open'),
    (v_tenant_id,v_pipeline_id,'Negociación',40,0.80,'open'),
    (v_tenant_id,v_pipeline_id,'Ganado',50,1.00,'won'),
    (v_tenant_id,v_pipeline_id,'Perdido',60,0.00,'lost');

  insert into public.agency_client_accounts(
    tenant_id,plan_id,vertical,template_key,monthly_recurring_cents,status,onboarding_status,customizations,created_by
  )
  select v_tenant_id,v_plan_id,nullif(trim(p_vertical),''),p_template_key,p.monthly_price_cents,
         'onboarding','in_progress','{}'::jsonb,v_user_id
  from public.plans p where p.id=v_plan_id;

  if p_template_key is not null then
    perform public.install_crm_template(v_tenant_id,p_template_key);
  end if;

  perform public.set_active_tenant(v_tenant_id);

  insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
  values(
    v_tenant_id,v_user_id,'platform.client_tenant_created','tenant',v_tenant_id,
    jsonb_build_object('plan_code',p_plan_code,'vertical',p_vertical,'template_key',p_template_key)
  );

  return v_tenant_id;
end;
$$;

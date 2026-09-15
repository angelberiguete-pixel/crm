-- Re-declare platform RPCs using only audit_log columns already used by the existing CRM.

create or replace function public.install_crm_template(p_tenant_id uuid,p_template_key text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_template public.crm_templates%rowtype;
  v_pipeline_id uuid;
  v_module record;
  v_stage record;
begin
  if not private.crm_is_tenant_admin(p_tenant_id) then
    raise exception 'Insufficient privileges for tenant';
  end if;

  select * into v_template from public.crm_templates where template_key=p_template_key and status='active';
  if v_template.id is null then raise exception 'Template not found'; end if;

  for v_module in select * from public.crm_template_modules where template_id=v_template.id loop
    insert into public.tenant_module_overrides(tenant_id,module_key,enabled,config)
    values(p_tenant_id,v_module.module_key,v_module.enabled,v_module.config)
    on conflict(tenant_id,module_key) do update set enabled=excluded.enabled,config=excluded.config,updated_at=now();
  end loop;

  for v_stage in select * from public.crm_template_pipeline_stages where template_id=v_template.id order by pipeline_name,position loop
    select p.id into v_pipeline_id from public.pipelines p
    where p.tenant_id=p_tenant_id and p.name=v_stage.pipeline_name
    order by p.created_at asc limit 1;

    if v_pipeline_id is null then
      insert into public.pipelines(tenant_id,name,is_default,created_by)
      values(p_tenant_id,v_stage.pipeline_name,false,auth.uid())
      returning id into v_pipeline_id;
    end if;

    insert into public.pipeline_stages(tenant_id,pipeline_id,name,position,win_probability,stage_type)
    select p_tenant_id,v_pipeline_id,v_stage.name,v_stage.position,v_stage.win_probability,v_stage.stage_type
    where not exists(
      select 1 from public.pipeline_stages ps
      where ps.tenant_id=p_tenant_id and ps.pipeline_id=v_pipeline_id and ps.name=v_stage.name
    );
  end loop;

  insert into public.tenant_template_installs(tenant_id,template_id,template_version,status,installed_by,config)
  values(p_tenant_id,v_template.id,v_template.version,'installed',auth.uid(),v_template.config)
  on conflict(tenant_id,template_id) do update
    set template_version=excluded.template_version,status='installed',installed_by=auth.uid(),installed_at=now(),config=excluded.config;

  insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id)
  values(p_tenant_id,auth.uid(),'template.installed','crm_template',v_template.id);

  return jsonb_build_object('template_key',v_template.template_key,'template_version',v_template.version,'pipeline_id',v_pipeline_id);
end;
$$;

create or replace function public.platform_set_tenant_module(p_tenant_id uuid,p_module_key text,p_enabled boolean,p_config jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if not private.crm_is_platform_admin() then raise exception 'Platform admin required'; end if;
  insert into public.tenant_module_overrides(tenant_id,module_key,enabled,config,created_by)
  values(p_tenant_id,p_module_key,p_enabled,coalesce(p_config,'{}'::jsonb),auth.uid())
  on conflict(tenant_id,module_key) do update set enabled=excluded.enabled,config=excluded.config,updated_at=now();
  insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id)
  values(p_tenant_id,auth.uid(),'platform.module_changed','tenant',p_tenant_id);
end;
$$;

create or replace function public.platform_assign_plan(p_tenant_id uuid,p_plan_code text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_plan_id uuid;
begin
  if not private.crm_is_platform_admin() then raise exception 'Platform admin required'; end if;
  select p.id into v_plan_id from public.plans p where p.code=p_plan_code limit 1;
  if v_plan_id is null then raise exception 'Plan not found'; end if;

  update public.tenant_subscriptions set plan_id=v_plan_id,status='active',provider='manual' where tenant_id=p_tenant_id;
  if not found then
    insert into public.tenant_subscriptions(tenant_id,plan_id,status,provider)
    values(p_tenant_id,v_plan_id,'active','manual');
  end if;

  insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id)
  values(p_tenant_id,auth.uid(),'platform.plan_assigned','subscription',v_plan_id);
  return jsonb_build_object('tenant_id',p_tenant_id,'plan_code',p_plan_code,'status','active');
end;
$$;

create or replace function public.platform_join_tenant_as_admin(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
begin
  if not private.crm_is_platform_admin() then raise exception 'Platform admin required'; end if;

  insert into public.memberships(tenant_id,user_id,role,status)
  values(p_tenant_id,auth.uid(),'admin','active')
  on conflict(tenant_id,user_id) do update set role='admin',status='active';

  insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id)
  values(p_tenant_id,auth.uid(),'platform.support_access_granted','tenant',p_tenant_id);

  return jsonb_build_object('tenant_id',p_tenant_id,'role','admin');
end;
$$;

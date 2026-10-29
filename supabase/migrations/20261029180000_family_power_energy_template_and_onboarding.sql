-- Energy and field-service vertical template. Reuses the EXISTING CRM and tables.
-- No tenant, user, product, invoice, lead or paid subscription is created by
-- this migration. The optional Family Power company is created ONLY after a
-- signed-in platform administrator intentionally presses its onboarding button.
insert into public.crm_templates(template_key,name,vertical,description,version,status,config)
values('energia-instalaciones','Energía e instalaciones','energía y servicios técnicos',
  'Ventas, diagnósticos, visitas técnicas, presupuestos y seguimiento de instalaciones. Sin productos ni precios inventados.',
  1,'active',
  jsonb_build_object('illustrative_only',false,'default_currency','DOP',
    'requires_verified_catalog',true,'requires_contract_review',true))
on conflict(template_key) do update
set name=excluded.name,vertical=excluded.vertical,description=excluded.description,
    version=excluded.version,status=excluded.status,config=excluded.config,
    updated_at=now()
where public.crm_templates.version<=excluded.version;

insert into public.crm_template_modules(template_id,module_key,enabled,config)
select t.id,m.module_key,m.enabled,m.config
from public.crm_templates t
cross join (values
 ('dashboard',true,'{}'::jsonb),
 ('companies',true,'{}'::jsonb),
 ('contacts',true,'{}'::jsonb),
 ('pipeline',true,'{}'::jsonb),
 ('products',true,'{"requires_verified_catalog":true}'::jsonb),
 ('quotations',true,'{"requires_human_approval":true}'::jsonb),
 ('operations',true,'{"work_orders":true,"requires_human_approval":true}'::jsonb),
 ('reports',true,'{}'::jsonb),
 ('settings',true,'{}'::jsonb),
 ('inbox',true,'{}'::jsonb),
 ('automations',false,'{"requires_review":true}'::jsonb),
 ('ai_agents',false,'{"requires_authorized_provider":true}'::jsonb)
) as m(module_key,enabled,config)
join public.platform_modules pm on pm.module_key=m.module_key
where t.template_key='energia-instalaciones'
on conflict(template_id,module_key)
do update set enabled=excluded.enabled,config=excluded.config;

insert into public.crm_template_pipeline_stages(
 template_id,pipeline_name,stage_key,name,position,win_probability,stage_type)
select t.id,'Energía e instalaciones',x.stage_key,x.name,x.position,x.win_probability,x.stage_type
from public.crm_templates t
cross join (values
 ('consulta','Consulta recibida',10,0.05::numeric,'open'),
 ('diagnostico','Diagnóstico pendiente',20,0.15::numeric,'open'),
 ('cotizacion','Cotización por revisar',30,0.35::numeric,'open'),
 ('aprobacion','Aprobación solicitada',40,0.55::numeric,'open'),
 ('programacion','Instalación por programar',50,0.75::numeric,'open'),
 ('completado','Servicio completado',60,1.00::numeric,'won'),
 ('no_concretado','No concretado',70,0.00::numeric,'lost')
) as x(stage_key,name,position,win_probability,stage_type)
where t.template_key='energia-instalaciones'
on conflict(template_id,pipeline_name,stage_key)
do update set name=excluded.name,position=excluded.position,
              win_probability=excluded.win_probability,stage_type=excluded.stage_type;

-- Company-specific onboarding wraps the EXISTING audited, platform-admin-only
-- creation RPC. It cannot be called anonymously and creates zero tenant rows
-- until an authorized admin clicks the button.
create or replace function public.platform_create_family_power_tenant(
 p_plan_code text default 'starter')
returns uuid language plpgsql security invoker set search_path=''
as $$
declare
 v_tenant_id uuid;
begin
 if auth.uid() is null or not private.crm_is_platform_admin() then
   raise exception 'platform_admin_only' using errcode='42501';
 end if;
 if exists (select 1 from public.tenants t where t.slug='family-power') then
   raise exception 'family_power_tenant_already_exists' using errcode='23505';
 end if;

 -- Entire operation is transactional: a branding failure rolls the new tenant back.
 v_tenant_id:=public.platform_create_client_tenant(
   'Family Power','family-power',p_plan_code,
   'Energía e instalaciones','energia-instalaciones');

 update public.tenant_settings
 set brand_name='Family Power',
     logo_url='/client-brands/family-power/logo-negativo.svg',
     favicon_url='/client-brands/family-power/logo-compacto.svg',
     primary_color='#D20A14',secondary_color='#101115',
     accent_color='#DFE1E3',
     locale='es-DO',currency='DOP',timezone='America/Santo_Domingo',
     settings=coalesce(settings,'{}'::jsonb)||
       jsonb_build_object('branding',jsonb_build_object(
         'logo_on_dark_url','/client-brands/family-power/logo-negativo.svg',
         'logo_on_light_url','/client-brands/family-power/logo-color.svg',
         'source','family-power-crm/web/assets/branding',
         'approval','digital_usage_authorized')),
     updated_at=now()
 where tenant_id=v_tenant_id;

 if not found then
   raise exception 'family_power_branding_not_saved' using errcode='P0001';
 end if;

 insert into public.audit_logs(
 tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
 values(v_tenant_id,auth.uid(),'platform.family_power_workspace_prepared',
   'tenant',v_tenant_id,
   jsonb_build_object('source','family-power-crm','migration','NOT_STARTED',
     'real_customer_data_imported',false,'provider_connections_enabled',false));
 return v_tenant_id;
end;
$$;
revoke all on function public.platform_create_family_power_tenant(text)
 from PUBLIC,anon,authenticated;
grant execute on function public.platform_create_family_power_tenant(text)
 to authenticated;
comment on function public.platform_create_family_power_tenant(text) is
 'Explicit platform-admin-only creation of Family Power tenant using the common CRM. No import, Meta, AI or charge.';

create or replace function public.platform_reset_demo_tenant()
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_existing uuid;
  v_is_demo boolean;
  v_tenant uuid;
  v_pipeline uuid;
  v_stage_new uuid;
  v_stage_qualified uuid;
  v_stage_proposal uuid;
  v_company_a uuid;
  v_company_b uuid;
  v_contact_a uuid;
  v_contact_b uuid;
  v_contact_c uuid;
  v_opp_a uuid;
  v_opp_b uuid;
  v_quote uuid;
  v_rule uuid;
  v_trigger uuid;
  v_action uuid;
begin
  if not private.crm_is_platform_admin() then
    raise exception 'Platform admin required';
  end if;

  select t.id,
         coalesce((a.customizations->>'is_demo')::boolean,false)
  into v_existing,v_is_demo
  from public.tenants t
  left join public.agency_client_accounts a on a.tenant_id=t.id
  where t.slug='look-social-media-demo'
  limit 1;

  if v_existing is not null and not coalesce(v_is_demo,false) then
    raise exception 'A non-demo tenant already uses look-social-media-demo';
  end if;

  if v_existing is not null then
    delete from public.tenants where id=v_existing;
  end if;

  v_tenant := public.platform_create_client_tenant(
    'Look Social Media Demo',
    'look-social-media-demo',
    'professional',
    'demo',
    null
  );

  update public.tenant_settings
  set brand_name='Look Social Media Demo',
      primary_color='#2563EB',
      secondary_color='#7C3AED',
      accent_color='#00D4FF',
      currency='DOP',
      timezone='America/Santo_Domingo',
      updated_at=now()
  where tenant_id=v_tenant;

  update public.tenant_subscriptions
  set custom_monthly_price_cents=0,
      updated_at=now()
  where tenant_id=v_tenant;

  update public.agency_client_accounts
  set monthly_recurring_cents=0,
      setup_fee_cents=0,
      status='active',
      onboarding_status='complete',
      customizations=coalesce(customizations,'{}'::jsonb)
        || jsonb_build_object(
          'is_demo',true,
          'safe_to_reset',true,
          'demo_notice','Datos ficticios para demostración comercial'
        ),
      internal_notes='Tenant DEMO. Todos los registros son ficticios y pueden restablecerse.',
      updated_at=now()
  where tenant_id=v_tenant;

  select id into v_pipeline
  from public.pipelines
  where tenant_id=v_tenant and is_default
  order by created_at
  limit 1;

  select id into v_stage_new from public.pipeline_stages
  where tenant_id=v_tenant and pipeline_id=v_pipeline and name='Nuevo' limit 1;
  select id into v_stage_qualified from public.pipeline_stages
  where tenant_id=v_tenant and pipeline_id=v_pipeline and name='Calificado' limit 1;
  select id into v_stage_proposal from public.pipeline_stages
  where tenant_id=v_tenant and pipeline_id=v_pipeline and name='Propuesta' limit 1;

  insert into public.companies(tenant_id,name,email,phone,city,sector,metadata)
  values(v_tenant,'Empresa Aurora · DEMO','contacto@aurora-demo.invalid','+1 809 000 0101','Santo Domingo','Servicios','{"demo":true}'::jsonb)
  returning id into v_company_a;

  insert into public.companies(tenant_id,name,email,phone,city,sector,metadata)
  values(v_tenant,'Grupo Centro · DEMO','hola@centro-demo.invalid','+1 809 000 0202','Santo Domingo','Comercio','{"demo":true}'::jsonb)
  returning id into v_company_b;

  insert into public.contacts(tenant_id,company_id,display_name,email,phone,whatsapp_phone,status,source,metadata)
  values(v_tenant,v_company_a,'Ana Demo','ana@aurora-demo.invalid','+1 809 000 0111','+1 809 000 0111','lead','demo','{"demo":true}'::jsonb)
  returning id into v_contact_a;

  insert into public.contacts(tenant_id,company_id,display_name,email,phone,status,source,metadata)
  values(v_tenant,v_company_b,'Carlos Demo','carlos@centro-demo.invalid','+1 809 000 0222','qualified','demo','{"demo":true}'::jsonb)
  returning id into v_contact_b;

  insert into public.contacts(tenant_id,display_name,email,phone,status,source,metadata)
  values(v_tenant,'María Demo','maria@prospecto-demo.invalid','+1 809 000 0333','lead','demo','{"demo":true}'::jsonb)
  returning id into v_contact_c;

  insert into public.opportunities(
    tenant_id,pipeline_id,stage_id,company_id,contact_id,title,value,currency,probability,status,
    acquisition_source,lead_score,next_action,next_action_at,metadata
  )
  values(
    v_tenant,v_pipeline,v_stage_new,v_company_a,v_contact_a,'Implementación CRM · DEMO',35000,'DOP',0.10,'open',
    'referido-demo',72,'Llamar y confirmar necesidades',now()+interval '1 day','{"demo":true}'::jsonb
  ) returning id into v_opp_a;

  insert into public.opportunities(
    tenant_id,pipeline_id,stage_id,company_id,contact_id,title,value,currency,probability,status,
    acquisition_source,lead_score,next_action,next_action_at,metadata
  )
  values(
    v_tenant,v_pipeline,v_stage_qualified,v_company_b,v_contact_b,'Automatización comercial · DEMO',52000,'DOP',0.30,'open',
    'web-demo',88,'Enviar propuesta',now()+interval '4 hours','{"demo":true}'::jsonb
  ) returning id into v_opp_b;

  insert into public.opportunities(
    tenant_id,pipeline_id,stage_id,contact_id,title,value,currency,probability,status,
    acquisition_source,lead_score,next_action,next_action_at,metadata
  )
  values(
    v_tenant,v_pipeline,v_stage_proposal,v_contact_c,'Seguimiento de ventas · DEMO',28000,'DOP',0.60,'open',
    'instagram-demo',81,'Dar seguimiento a propuesta',now()+interval '2 days','{"demo":true}'::jsonb
  );

  insert into public.products(
    tenant_id,sku,name,description,status,source_system,sale_price,currency,stock_snapshot,metadata
  )
  values
    (v_tenant,'DEMO-SERV-01','Servicio inicial · DEMO','Registro ficticio para demostración','active','crm',2500,'DOP',null,'{"demo":true}'::jsonb),
    (v_tenant,'DEMO-SERV-02','Paquete comercial · DEMO','Registro ficticio para demostración','active','crm',6500,'DOP',null,'{"demo":true}'::jsonb);

  insert into public.quotations(
    tenant_id,quote_number,contact_id,company_id,opportunity_id,status,currency,valid_until,
    notes,subtotal,total,metadata
  )
  values(
    v_tenant,'DEMO-Q-001',v_contact_b,v_company_b,v_opp_b,'sent','DOP',current_date+7,
    'Cotización ficticia para demostración comercial.',12500,12500,'{"demo":true}'::jsonb
  ) returning id into v_quote;

  insert into public.orders(
    tenant_id,order_number,quotation_id,contact_id,company_id,opportunity_id,status,currency,
    subtotal,total,amount_paid,notes
  )
  values(
    v_tenant,'DEMO-O-001',v_quote,v_contact_b,v_company_b,v_opp_b,'confirmed','DOP',
    12500,12500,5000,'Pedido ficticio para demostración comercial.'
  );

  insert into public.tasks(
    tenant_id,title,description,status,priority,due_at,contact_id,company_id,opportunity_id,source,metadata
  )
  values
    (v_tenant,'Llamar a Ana · DEMO','Tarea ficticia','todo','high',now()+interval '2 hours',v_contact_a,v_company_a,v_opp_a,'manual','{"demo":true}'::jsonb),
    (v_tenant,'Enviar propuesta · DEMO','Tarea ficticia','todo','normal',now()+interval '5 hours',v_contact_b,v_company_b,v_opp_b,'manual','{"demo":true}'::jsonb);

  insert into public.automation_rules(
    tenant_id,name,description,status,trigger_type,trigger_event,trigger_config,conditions,stop_on_error
  )
  values(
    v_tenant,'Seguimiento automático de lead · DEMO',
    'Flujo ficticio para enseñar el Automation Studio. No envía mensajes externos.',
    'draft','event','lead_created','{}','{}',true
  ) returning id into v_rule;

  insert into public.automation_flow_nodes(
    tenant_id,rule_id,node_key,node_type,label,position_x,position_y,config
  )
  values(v_tenant,v_rule,'trigger','trigger','Lead creado',70,220,'{}')
  returning id into v_trigger;

  insert into public.automation_flow_nodes(
    tenant_id,rule_id,node_key,node_type,action_type,label,position_x,position_y,config
  )
  values(
    v_tenant,v_rule,'task','action','create_task','Crear tarea de seguimiento',380,220,
    '{"value":"Dar seguimiento al nuevo lead · DEMO","due_minutes":60}'::jsonb
  ) returning id into v_action;

  insert into public.automation_flow_edges(
    tenant_id,rule_id,source_node_id,target_node_id
  ) values(v_tenant,v_rule,v_trigger,v_action);

  insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
  values(
    v_tenant,auth.uid(),'platform.demo_reset','tenant',v_tenant,
    jsonb_build_object('safe_demo',true,'records_are_fictitious',true)
  );

  return v_tenant;
end;
$$;

revoke all on function public.platform_reset_demo_tenant() from public,anon;
grant execute on function public.platform_reset_demo_tenant() to authenticated;

comment on function public.platform_reset_demo_tenant() is 'Creates or safely resets the isolated commercial demo tenant. Refuses to delete a same-slug tenant unless it is explicitly marked is_demo=true.';

-- Supabase applied migration 20261012013441; privileged evidence-only readiness RPC.
CREATE OR REPLACE FUNCTION public.platform_client_readiness(p_tenant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_owner boolean;
 v_subscription boolean;
 v_pipeline boolean;
 v_brand boolean;
 v_region boolean;
 v_enabled int;
 v_customer_members int;
 v_pending_invites int;
 v_channels_connected int;
 v_erp int;
 v_account_state text;
 v_checks jsonb;
begin
 if auth.uid() is null or not private.is_platform_admin() then
   raise exception 'Platform Admin requerido' using errcode='42501';
 end if;
 if p_tenant_id is null or not exists(select 1 from public.tenants where id=p_tenant_id) then
   raise exception 'Cliente no encontrado' using errcode='22023';
 end if;
 select exists(
   select 1 from public.tenants t join public.memberships m
     on m.tenant_id=t.id and m.user_id=t.owner_user_id
   where t.id=p_tenant_id and m.status='active'
 ) into v_owner;
 select exists(
   select 1 from public.tenant_subscriptions s join public.plans p on p.id=s.plan_id
   where s.tenant_id=p_tenant_id and s.status in ('active','trialing') and p.is_active
 ) into v_subscription;
 select exists(
   select 1 from public.pipelines p join public.pipeline_stages ps
      on ps.tenant_id=p.tenant_id and ps.pipeline_id=p.id
   where p.tenant_id=p_tenant_id and p.is_default
 ) into v_pipeline;
 select (nullif(btrim(s.brand_name),'') is not null),
        (s.country_code ~ '^[A-Z]{2}$' and s.currency ~ '^[A-Z]{3}$'
          and s.timezone is not null and s.locale is not null)
 into v_brand,v_region from public.tenant_settings s where s.tenant_id=p_tenant_id;
 select count(*) into v_enabled
 from public.platform_modules pm
 left join public.tenant_module_overrides o
   on o.tenant_id=p_tenant_id and o.module_key=pm.module_key
 left join public.tenant_subscriptions ts
   on ts.tenant_id=p_tenant_id and ts.status in ('active','trialing','past_due')
 left join public.plan_module_entitlements pe
   on pe.plan_id=ts.plan_id and pe.module_key=pm.module_key
 where pm.is_active and coalesce(o.enabled,pe.enabled,pm.default_enabled);
 select count(*) into v_customer_members from public.memberships m
 where m.tenant_id=p_tenant_id and m.status='active'
  and not exists(select 1 from public.platform_users u
      where u.user_id=m.user_id and u.status='active');
 select count(*) into v_pending_invites from public.tenant_invites i
 where i.tenant_id=p_tenant_id and i.status='pending' and i.expires_at>now();
 select count(*) into v_channels_connected from public.channels c
 where c.tenant_id=p_tenant_id and c.status='connected';
 select count(*) into v_erp from public.erp_connections e
 where e.tenant_id=p_tenant_id and e.status='connected';
 select a.onboarding_status into v_account_state
 from public.agency_client_accounts a where a.tenant_id=p_tenant_id
 order by a.created_at desc limit 1;

 v_checks:=jsonb_build_array(
  jsonb_build_object('key','owner','label','Propietario y membresía activa',
    'status',case when v_owner then 'passed' else 'action_required' end,
    'detail','Se comprueba la membresía del propietario en Supabase'),
  jsonb_build_object('key','plan','label','Plan contratado y suscripción vigente',
    'status',case when v_subscription then 'passed' else 'action_required' end,
    'detail','No equivale a confirmar el cobro real'),
  jsonb_build_object('key','pipeline','label','Pipeline con etapas configuradas',
    'status',case when v_pipeline then 'passed' else 'action_required' end,
    'detail','Verifica configuración, no el recorrido de venta completo'),
  jsonb_build_object('key','modules','label','Módulos habilitados',
    'status',case when v_enabled>0 then 'passed' else 'action_required' end,
    'detail',format('%s módulos habilitados según plan y ajustes',v_enabled)),
  jsonb_build_object('key','branding','label','Nombre de marca personalizado',
    'status',case when coalesce(v_brand,false) then 'passed' else 'action_required' end,
    'detail','No verifica logos, contraste ni apariencia en móviles'),
  jsonb_build_object('key','region','label','País, moneda, idioma y zona horaria',
    'status',case when coalesce(v_region,false) then 'passed' else 'action_required' end,
    'detail','Guardar la región en la sección País y moneda'),
  jsonb_build_object('key','customer_user','label','Usuario del cliente activo',
    'status',case when v_customer_members>0 then 'passed' else 'action_required' end,
    'detail',format('%s miembros activos distintos del equipo de plataforma; %s invitaciones pendientes',v_customer_members,v_pending_invites)),
  jsonb_build_object('key','login_e2e','label','Login e invitación probados con cuenta real',
    'status','not_verified','detail','Requiere una prueba real en el navegador y correo del cliente'),
  jsonb_build_object('key','tenant_isolation','label','Aislamiento de datos A/B en sesiones reales',
    'status','not_verified','detail','Las pruebas SQL y las pruebas con respuestas simuladas no sustituyen E2E real'),
  jsonb_build_object('key','auth_recovery','label','Recuperación de contraseña por correo',
    'status','not_verified','detail','Requiere probar envío, URL autorizada y cambio de contraseña'),
  jsonb_build_object('key','provider_e2e','label','Integraciones y mensajería reales',
    'status','not_verified','detail',format('%s canales figuran conectados y %s ERP conectados; no prueba intercambio de datos',v_channels_connected,v_erp)),
  jsonb_build_object('key','billing_e2e','label','Pago real, factura y renovación',
    'status','not_verified','detail','Un plan activo en la base de datos no garantiza que haya cobros'),
  jsonb_build_object('key','mobile_e2e','label','Prueba operativa Android y escritorio',
    'status','not_verified','detail','Requiere la sesión real del usuario en varios tamaños de pantalla')
 );
 return jsonb_build_object(
   'tenant_id',p_tenant_id,'account_onboarding_status',coalesce(v_account_state,'unconfigured'),
   'verified_configuration', (select count(*) from jsonb_array_elements(v_checks) c where c->>'status'='passed'),
   'required_actions',(select count(*) from jsonb_array_elements(v_checks) c where c->>'status'='action_required'),
   'manual_checks',(select count(*) from jsonb_array_elements(v_checks) c where c->>'status'='not_verified'),
   'ready_for_commercial_activation',false,'checks',v_checks
 );
end $function$

revoke all on function public.platform_client_readiness(uuid) from public,anon;
grant execute on function public.platform_client_readiness(uuid) to authenticated;

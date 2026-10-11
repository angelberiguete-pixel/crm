create or replace function public.activate_automation_flow(p_rule_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_tenant uuid;
  v_version integer;
  v_snapshot jsonb;
  v_unsupported text;
  v_test_ok boolean;
begin
  select r.tenant_id into v_tenant
  from public.automation_rules r
  where r.id=p_rule_id;

  if v_tenant is null then raise exception 'Automation not found'; end if;
  if not (private.is_tenant_admin(v_tenant) or private.crm_is_platform_admin()) then
    raise exception 'Tenant admin required';
  end if;

  select version_number,snapshot
  into v_version,v_snapshot
  from public.automation_flow_versions
  where tenant_id=v_tenant and rule_id=p_rule_id and state='published'
  order by version_number desc
  limit 1;

  if v_version is null then
    raise exception 'Publish a validated testing version before activation';
  end if;

  select string_agg(coalesce(node->>'action_type',node->>'node_type'),', ' order by coalesce(node->>'action_type',node->>'node_type'))
  into v_unsupported
  from jsonb_array_elements(coalesce(v_snapshot->'nodes','[]'::jsonb)) node
  where coalesce((node->>'is_enabled')::boolean,true)
    and (
      node->>'node_type' in ('delay','approval','ai')
      or (
        node->>'node_type'='action'
        and coalesce(node->>'action_type','') not in (
          'create_task','assign_owner','update_contact','update_opportunity',
          'move_stage','create_notification'
        )
      )
    );

  if v_unsupported is not null then
    raise exception 'Flow contains executors not yet enabled for live mode: %', v_unsupported;
  end if;

  select exists(
    select 1
    from public.automation_runs ar
    where ar.tenant_id=v_tenant
      and ar.rule_id=p_rule_id
      and ar.status='succeeded'
      and ar.context->>'mode'='test'
      and coalesce((ar.context->>'flow_version')::integer,0)=v_version
  ) into v_test_ok;

  if not v_test_ok then
    raise exception 'A successful test run is required for this published version';
  end if;

  update public.automation_rules
  set status='active',updated_at=now()
  where tenant_id=v_tenant and id=p_rule_id;

  insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
  values(
    v_tenant,auth.uid(),'automation.activated','automation_rule',p_rule_id,
    jsonb_build_object('flow_version',v_version,'activation_gate','successful_test_and_supported_executors')
  );

  return jsonb_build_object('rule_id',p_rule_id,'status','active','flow_version',v_version);
end;
$$;

revoke all on function public.activate_automation_flow(uuid) from public,anon;
grant execute on function public.activate_automation_flow(uuid) to authenticated;

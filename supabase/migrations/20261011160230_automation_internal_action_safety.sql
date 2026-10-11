-- Internal effects and their receipt commit together. A retry returns the receipt.
create table if not exists private.automation_node_effects (
  tenant_id uuid not null,
  run_id uuid not null,
  node_id uuid not null,
  action_type text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (run_id,node_id),
  foreign key (tenant_id,run_id) references public.automation_runs(tenant_id,id) on delete cascade
);
revoke all on private.automation_node_effects from public,anon,authenticated,service_role;

create or replace function public.execute_automation_internal_action(
  p_run_id uuid,p_node_id uuid,p_action_type text,p_config jsonb,p_context jsonb
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_run public.automation_runs%rowtype;
  v_event public.automation_events%rowtype;
  v_snapshot_node jsonb;
  v_result jsonb;
  v_id uuid;
  v_contact uuid := nullif(p_context->>'contact_id','')::uuid;
  v_company uuid := nullif(p_context->>'company_id','')::uuid;
  v_opportunity uuid := nullif(p_context->>'opportunity_id','')::uuid;
  v_user uuid;
  v_stage public.pipeline_stages%rowtype;
  v_field text;
  v_title text := left(coalesce(nullif(p_config->>'title',''),'Automatización'),240);
  v_depth integer;
  v_root uuid;
begin
  if auth.role() is distinct from 'service_role' and session_user not in ('postgres','supabase_admin') then
    raise exception 'Service role required' using errcode='42501';
  end if;
  -- Serialize all effects of the same run, including concurrent retries.
  select * into v_run from public.automation_runs where id=p_run_id for update;
  if not found then raise exception 'automation_run_not_found'; end if;
  if v_run.context->>'mode' is distinct from 'live' then raise exception 'test_mode_business_write_blocked'; end if;
  if not private.crm_tenant_is_operational(v_run.tenant_id) then raise exception 'tenant_not_operational'; end if;
  if v_run.status <> 'running' then raise exception 'automation_run_not_running'; end if;

  select result into v_result from private.automation_node_effects where run_id=p_run_id and node_id=p_node_id;
  if found then return v_result || jsonb_build_object('replayed',true); end if;

  select node into v_snapshot_node
  from public.automation_flow_versions v, jsonb_array_elements(v.snapshot->'nodes') node
  where v.tenant_id=v_run.tenant_id and v.rule_id=v_run.rule_id
    and v.version_number=(v_run.context->>'flow_version')::integer
    and node->>'id'=p_node_id::text;
  if v_snapshot_node is null or v_snapshot_node->>'node_type' <> 'action'
    or v_snapshot_node->>'action_type' is distinct from p_action_type
    or coalesce((v_snapshot_node->>'is_enabled')::boolean,true) is false then
    raise exception 'automation_action_snapshot_mismatch';
  end if;
  select * into v_event from public.automation_events
  where id=(v_run.context->>'event_id')::uuid and tenant_id=v_run.tenant_id;
  if not found then raise exception 'automation_event_not_found'; end if;
  v_depth := coalesce((v_event.payload#>>'{_automation,depth}')::integer,0);
  if v_depth >= 10 then raise exception 'automation_event_depth_limit'; end if;
  v_root := coalesce(nullif(v_event.payload#>>'{_automation,root_event_id}','')::uuid,v_event.id);
  if not exists(select 1 from public.automation_events where id=v_root and tenant_id=v_run.tenant_id and created_at>now()-interval '1 hour') then
    raise exception 'automation_chain_duration_limit';
  end if;
  perform set_config('look.automation_cause',jsonb_build_object('tenant_id',v_run.tenant_id,'root_event_id',v_root,'depth',v_depth+1)::text,true);

  -- The worker uses service_role, so tenant relations must also be checked here.
  if v_contact is not null and not exists(select 1 from public.contacts where id=v_contact and tenant_id=v_run.tenant_id) then raise exception 'contact_not_in_tenant'; end if;
  if v_company is not null and not exists(select 1 from public.companies where id=v_company and tenant_id=v_run.tenant_id) then raise exception 'company_not_in_tenant'; end if;
  if v_opportunity is not null and not exists(select 1 from public.opportunities where id=v_opportunity and tenant_id=v_run.tenant_id) then raise exception 'opportunity_not_in_tenant'; end if;

  if p_action_type='create_task' then
    v_user:=coalesce(nullif(p_config->>'user_id',''),nullif(p_context->>'owner_user_id',''))::uuid;
    if v_user is not null and not exists(select 1 from public.memberships where tenant_id=v_run.tenant_id and user_id=v_user and status='active') then raise exception 'assignee_not_in_tenant'; end if;
    insert into public.tasks(tenant_id,title,status,priority,due_at,assigned_user_id,contact_id,company_id,opportunity_id,source,metadata)
    values(v_run.tenant_id,v_title,'todo',coalesce(nullif(p_config->>'priority',''),'normal'),
      case when coalesce((p_config->>'due_minutes')::numeric,0)>0 then now()+least((p_config->>'due_minutes')::numeric,525600)*interval '1 minute' else null end,
      v_user,v_contact,v_company,v_opportunity,'automation',jsonb_build_object('automation_run_id',p_run_id,'automation_node_id',p_node_id,'event_id',v_event.id))
    returning id into v_id;
    v_result:=jsonb_build_object('task_id',v_id);
  elsif p_action_type='create_notification' then
    insert into public.activities(tenant_id,contact_id,opportunity_id,type,title,description)
    values(v_run.tenant_id,v_contact,v_opportunity,'other',v_title,'Creada por LOOK SOCIAL MEDIA CRM') returning id into v_id;
    v_result:=jsonb_build_object('activity_id',v_id);
  elsif p_action_type='assign_owner' then
    v_user:=coalesce(nullif(p_config->>'user_id',''),nullif(p_config->>'value',''))::uuid;
    if v_user is null or not exists(select 1 from public.memberships where tenant_id=v_run.tenant_id and user_id=v_user and status='active') then raise exception 'owner_not_in_tenant'; end if;
    if v_opportunity is not null then update public.opportunities set owner_user_id=v_user where id=v_opportunity and tenant_id=v_run.tenant_id;
    elsif v_contact is not null then update public.contacts set owner_user_id=v_user where id=v_contact and tenant_id=v_run.tenant_id;
    else raise exception 'assign_owner_entity_missing'; end if;
    v_result:=jsonb_build_object('owner_user_id',v_user);
  elsif p_action_type='update_contact' then
    v_field:=p_config->>'field';
    if v_contact is null or v_field not in ('status','job_title','phone','whatsapp_phone') or v_field is null then raise exception 'update_contact_config_invalid'; end if;
    execute format('update public.contacts set %I=$1 where tenant_id=$2 and id=$3',v_field) using p_config->>'value',v_run.tenant_id,v_contact;
    v_result:=jsonb_build_object('field',v_field,'value',p_config->'value');
  elsif p_action_type='update_opportunity' then
    v_field:=p_config->>'field';
    if v_opportunity is null or v_field not in ('lead_score','next_action','next_action_at') or v_field is null then raise exception 'update_opportunity_config_invalid'; end if;
    if v_field='lead_score' then update public.opportunities set lead_score=(p_config->>'value')::integer where id=v_opportunity and tenant_id=v_run.tenant_id;
    elsif v_field='next_action_at' then update public.opportunities set next_action_at=(p_config->>'value')::timestamptz where id=v_opportunity and tenant_id=v_run.tenant_id;
    else update public.opportunities set next_action=p_config->>'value' where id=v_opportunity and tenant_id=v_run.tenant_id; end if;
    v_result:=jsonb_build_object('field',v_field,'value',p_config->'value');
  elsif p_action_type='move_stage' then
    if v_opportunity is null then raise exception 'move_stage_entity_missing'; end if;
    select * into v_stage from public.pipeline_stages where tenant_id=v_run.tenant_id and id=coalesce(nullif(p_config->>'stage_id',''),nullif(p_config->>'value',''))::uuid;
    if not found or v_stage.pipeline_id is distinct from (select pipeline_id from public.opportunities where id=v_opportunity and tenant_id=v_run.tenant_id) then raise exception 'stage_not_in_opportunity_pipeline'; end if;
    update public.opportunities set stage_id=v_stage.id,probability=v_stage.win_probability,status=case v_stage.stage_type when 'won' then 'won' when 'lost' then 'lost' else 'open' end
    where id=v_opportunity and tenant_id=v_run.tenant_id;
    v_result:=jsonb_build_object('stage_id',v_stage.id,'status',case v_stage.stage_type when 'won' then 'won' when 'lost' then 'lost' else 'open' end);
  else raise exception 'unsupported_internal_action'; end if;

  insert into private.automation_node_effects(tenant_id,run_id,node_id,action_type,result) values(v_run.tenant_id,p_run_id,p_node_id,p_action_type,v_result);
  perform set_config('look.automation_cause','',true);
  return v_result;
end;
$$;
revoke all on function public.execute_automation_internal_action(uuid,uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.execute_automation_internal_action(uuid,uuid,text,jsonb,jsonb) to service_role;

create or replace function public.retry_automation_event(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_event public.automation_events%rowtype;
begin
  select * into v_event from public.automation_events where id=p_event_id for update;
  if not found then raise exception 'Automation event not found'; end if;
  if not private.is_tenant_admin(v_event.tenant_id) then raise exception 'Tenant admin required' using errcode='42501'; end if;
  if not private.crm_tenant_is_operational(v_event.tenant_id) then raise exception 'tenant_not_operational'; end if;
  if v_event.status <> 'failed' then raise exception 'Only failed events can be retried'; end if;
  if v_event.attempts >= 3 then raise exception 'Se alcanzó el límite de tres intentos. Revisa el error antes de crear otra prueba.'; end if;
  update public.automation_events set status='queued',available_at=now(),processed_at=null,locked_at=null where id=p_event_id;
  insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
  values(v_event.tenant_id,auth.uid(),'automation.retry_requested','automation_event',p_event_id,jsonb_build_object('previous_error',v_event.last_error,'attempts',v_event.attempts));
  return jsonb_build_object('event_id',p_event_id,'status','queued');
end;
$$;
revoke all on function public.retry_automation_event(uuid) from public,anon;
grant execute on function public.retry_automation_event(uuid) to authenticated;

-- The activation gate also applies to direct table writes, not only the UI RPC.
create or replace function private.guard_automation_live_activation()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_version integer; v_snapshot jsonb;
begin
  if new.status <> 'active' then return new; end if;
  if tg_op='UPDATE' and old.status='active' then return new; end if;
  select version_number,snapshot into v_version,v_snapshot from public.automation_flow_versions
  where tenant_id=new.tenant_id and rule_id=new.id and state='published' order by version_number desc limit 1;
  if v_version is null then raise exception 'Publish a testing version before activation'; end if;
  if jsonb_array_length(v_snapshot->'nodes')>100 then raise exception 'automation_step_limit'; end if;
  if exists(select 1 from jsonb_array_elements(v_snapshot->'nodes') n where coalesce((n->>'is_enabled')::boolean,true)
    and (n->>'node_type' not in ('trigger','condition','action') or (n->>'node_type'='action' and coalesce(n->>'action_type','') not in ('create_task','assign_owner','update_contact','update_opportunity','move_stage','create_notification')))) then
    raise exception 'Flow contains executors not enabled for live mode';
  end if;
  if not exists(select 1 from public.automation_runs where tenant_id=new.tenant_id and rule_id=new.id and status='succeeded'
    and context->>'mode'='test' and context->>'execution_contract'='safe-v2' and (context->>'flow_version')::integer=v_version) then
    raise exception 'A successful safe test is required for this published version';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_automation_live_activation() from public,anon,authenticated;
drop trigger if exists automation_live_activation_guard on public.automation_rules;
create trigger automation_live_activation_guard before insert or update of status on public.automation_rules
for each row execute function private.guard_automation_live_activation();

-- A crashed worker must not strand events forever. Effects remain idempotent.
create or replace function public.claim_automation_events(p_limit integer default 20)
returns setof public.automation_events language plpgsql security definer set search_path='' as $$
begin
  update public.automation_events set status=case when attempts<3 then 'queued' else 'failed' end,
    last_error='worker_lease_expired',locked_at=null,available_at=now(),
    processed_at=case when attempts>=3 then now() else null end
  where status='running' and locked_at<now()-interval '5 minutes';
  return query with picked as (
    select e.id from public.automation_events e where e.status='queued' and e.available_at<=now()
    order by e.created_at for update skip locked limit greatest(1,least(coalesce(p_limit,5),5))
  ) update public.automation_events e set status='running',attempts=e.attempts+1,locked_at=now(),last_error=null
    from picked where e.id=picked.id returning e.*;
end;
$$;

-- Trigger-generated events inherit causal depth, preventing stage-change ping-pong.
create or replace function private.enqueue_automation_event(
  p_tenant_id uuid,p_event_type text,p_entity_type text,p_entity_id uuid,p_payload jsonb,
  p_idempotency_key text default null,p_mode text default 'live',p_target_rule_id uuid default null
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_cause jsonb; v_payload jsonb := coalesce(p_payload,'{}'::jsonb);
begin
  v_cause:=nullif(current_setting('look.automation_cause',true),'')::jsonb;
  if v_cause is not null and v_cause->>'tenant_id'=p_tenant_id::text then
    v_payload:=v_payload || jsonb_build_object('_automation',v_cause-'tenant_id');
  end if;
  insert into public.automation_events(tenant_id,event_type,entity_type,entity_id,payload,idempotency_key,mode,target_rule_id)
  values(p_tenant_id,p_event_type,p_entity_type,p_entity_id,v_payload,p_idempotency_key,p_mode,p_target_rule_id)
  on conflict (tenant_id,idempotency_key) where idempotency_key is not null do nothing returning id into v_id;
  if v_id is null and p_idempotency_key is not null then
    select id into v_id from public.automation_events where tenant_id=p_tenant_id and idempotency_key=p_idempotency_key;
  end if;
  return v_id;
end;
$$;

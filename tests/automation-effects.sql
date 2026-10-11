-- Real database tests. All QA data, events and effects are rolled back.
begin;
create temporary table qa_auto_ids(k text primary key,id uuid not null);
insert into qa_auto_ids select k,gen_random_uuid() from unnest(array['owner_a','owner_b','tenant_a','tenant_b','contact_a','contact_b','rule','trigger','task','activity','contact_update','move','assign','pipeline','other_pipeline','stage_one','stage_two','wrong_stage','opportunity','event','run','test_run']) k;
create temporary table qa_auto_results(check_name text,passed boolean);
grant select on qa_auto_ids to authenticated,service_role;
grant select,insert on qa_auto_results to authenticated,service_role;
insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
select id,'qa-auto-'||id::text||'@example.invalid','{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb from qa_auto_ids where k in ('owner_a','owner_b');
insert into public.tenants(id,name,slug,owner_user_id)
select t.id,'QA Automation '||t.k,'qa-auto-'||t.id::text,u.id from qa_auto_ids t join qa_auto_ids u on u.k=case t.k when 'tenant_a' then 'owner_a' else 'owner_b' end where t.k in ('tenant_a','tenant_b');
insert into public.tenant_subscriptions(tenant_id,plan_id,status)
select id,(select id from public.plans where code='enterprise'),'active' from qa_auto_ids where k in ('tenant_a','tenant_b');
insert into public.memberships(tenant_id,user_id,role,status)
select t.id,u.id,'owner','active' from qa_auto_ids u join qa_auto_ids t on t.k=case u.k when 'owner_a' then 'tenant_a' else 'tenant_b' end where u.k in ('owner_a','owner_b');
insert into public.contacts(id,tenant_id,display_name)
select c.id,t.id,'QA Automation contact' from qa_auto_ids c join qa_auto_ids t on t.k=case c.k when 'contact_a' then 'tenant_a' else 'tenant_b' end where c.k in ('contact_a','contact_b');
insert into public.pipelines(id,tenant_id,name)
select id,(select id from qa_auto_ids where k='tenant_a'),'QA pipeline '||k from qa_auto_ids where k in ('pipeline','other_pipeline');
insert into public.pipeline_stages(id,tenant_id,pipeline_id,name,position,win_probability,stage_type)
select id,(select id from qa_auto_ids where k='tenant_a'),(select id from qa_auto_ids where k=case s.k when 'wrong_stage' then 'other_pipeline' else 'pipeline' end),s.k,case s.k when 'stage_two' then 2 else 1 end,25,'open'
from qa_auto_ids s where k in ('stage_one','stage_two','wrong_stage');
insert into public.opportunities(id,tenant_id,pipeline_id,stage_id,contact_id,title)
select (select id from qa_auto_ids where k='opportunity'),(select id from qa_auto_ids where k='tenant_a'),(select id from qa_auto_ids where k='pipeline'),(select id from qa_auto_ids where k='stage_one'),(select id from qa_auto_ids where k='contact_a'),'QA Automation opportunity';
insert into public.automation_rules(id,tenant_id,name,trigger_type,trigger_event,status)
select (select id from qa_auto_ids where k='rule'),(select id from qa_auto_ids where k='tenant_a'),'QA Automation effects','event','lead_created','testing';
insert into public.automation_flow_nodes(id,tenant_id,rule_id,node_key,node_type,action_type,label)
select id,(select id from qa_auto_ids where k='tenant_a'),(select id from qa_auto_ids where k='rule'),k,case k when 'trigger' then 'trigger' else 'action' end,
case k when 'task' then 'create_task' when 'activity' then 'create_notification' when 'contact_update' then 'update_contact' when 'move' then 'move_stage' when 'assign' then 'assign_owner' else null end,k
from qa_auto_ids where k in ('trigger','task','activity','contact_update','move','assign');
insert into public.automation_flow_versions(tenant_id,rule_id,version_number,state,snapshot)
select (select id from qa_auto_ids where k='tenant_a'),(select id from qa_auto_ids where k='rule'),1,'published',jsonb_build_object('nodes',jsonb_agg(to_jsonb(n)),'edges','[]'::jsonb)
from public.automation_flow_nodes n where rule_id=(select id from qa_auto_ids where k='rule');
insert into public.automation_events(id,tenant_id,event_type,payload,status,attempts)
select (select id from qa_auto_ids where k='event'),(select id from qa_auto_ids where k='tenant_a'),'lead_created',jsonb_build_object('contact_id',(select id from qa_auto_ids where k='contact_a')),'running',1;
insert into public.automation_runs(id,tenant_id,rule_id,status,context)
select (select id from qa_auto_ids where k='run'),(select id from qa_auto_ids where k='tenant_a'),(select id from qa_auto_ids where k='rule'),'running',jsonb_build_object('mode','live','execution_contract','safe-v2','flow_version',1,'event_id',(select id from qa_auto_ids where k='event'));

do $$ declare r uuid:=(select id from qa_auto_ids where k='run'); t uuid:=(select id from qa_auto_ids where k='tenant_a'); ctx jsonb:=jsonb_build_object('contact_id',(select id from qa_auto_ids where k='contact_a')); a jsonb; b jsonb; denied boolean;
begin
  denied:=false; begin update public.automation_rules set status='active' where id=(select id from qa_auto_ids where k='rule'); exception when others then denied:=sqlerrm like '%successful safe test%'; end;
  insert into qa_auto_results values('Direct activation without safe test rejected',denied);
  a:=public.execute_automation_internal_action(r,(select id from qa_auto_ids where k='task'),'create_task','{"title":"QA one task"}',ctx);
  b:=public.execute_automation_internal_action(r,(select id from qa_auto_ids where k='task'),'create_task','{"title":"QA changed duplicate"}',ctx);
  insert into qa_auto_results values('Task receipt prevents duplicate insert',a->>'task_id'=b->>'task_id' and b->>'replayed'='true' and (select count(*) from public.tasks where tenant_id=t)=1);
  a:=public.execute_automation_internal_action(r,(select id from qa_auto_ids where k='activity'),'create_notification','{"title":"QA one activity"}',ctx);
  b:=public.execute_automation_internal_action(r,(select id from qa_auto_ids where k='activity'),'create_notification','{"title":"QA duplicate"}',ctx);
  insert into qa_auto_results values('Activity receipt prevents duplicate insert',a->>'activity_id'=b->>'activity_id' and (select count(*) from public.activities where tenant_id=t)=1);
  denied:=false; begin perform public.execute_automation_internal_action(r,(select id from qa_auto_ids where k='contact_update'),'update_contact','{"field":"status","value":"qualified"}',jsonb_build_object('contact_id',(select id from qa_auto_ids where k='contact_b'))); exception when others then denied:=sqlerrm='contact_not_in_tenant'; end;
  insert into qa_auto_results values('Service executor rejects cross-tenant entity',denied);
  a:=public.execute_automation_internal_action(r,(select id from qa_auto_ids where k='contact_update'),'update_contact','{"field":"job_title","value":"QA updated"}',ctx);
  insert into qa_auto_results values('Whitelisted contact update succeeds',(select job_title='QA updated' from public.contacts where id=(select id from qa_auto_ids where k='contact_a')));
  denied:=false; begin perform public.execute_automation_internal_action(r,(select id from qa_auto_ids where k='assign'),'assign_owner',jsonb_build_object('user_id',(select id from qa_auto_ids where k='owner_b')),ctx); exception when others then denied:=sqlerrm='owner_not_in_tenant'; end;
  insert into qa_auto_results values('Assignee from another tenant rejected',denied);
  a:=public.execute_automation_internal_action(r,(select id from qa_auto_ids where k='assign'),'assign_owner',jsonb_build_object('user_id',(select id from qa_auto_ids where k='owner_a')),ctx);
  insert into qa_auto_results values('Own active assignee succeeds',a->>'owner_user_id'=(select id::text from qa_auto_ids where k='owner_a'));
  denied:=false; begin perform public.execute_automation_internal_action(r,(select id from qa_auto_ids where k='move'),'move_stage',jsonb_build_object('stage_id',(select id from qa_auto_ids where k='wrong_stage')),jsonb_build_object('opportunity_id',(select id from qa_auto_ids where k='opportunity'))); exception when others then denied:=sqlerrm='stage_not_in_opportunity_pipeline'; end;
  insert into qa_auto_results values('Stage from another pipeline rejected',denied);
  a:=public.execute_automation_internal_action(r,(select id from qa_auto_ids where k='move'),'move_stage',jsonb_build_object('stage_id',(select id from qa_auto_ids where k='stage_two')),jsonb_build_object('opportunity_id',(select id from qa_auto_ids where k='opportunity')));
  insert into qa_auto_results values('Generated stage event inherits root and depth',exists(select 1 from public.automation_events where tenant_id=t and event_type='stage_changed' and payload#>>'{_automation,depth}'='1' and payload#>>'{_automation,root_event_id}'=(select id::text from qa_auto_ids where k='event')));
  update public.automation_runs set context=context||'{"mode":"test"}' where id=r;
  denied:=false; begin perform public.execute_automation_internal_action(r,(select id from qa_auto_ids where k='task'),'create_task','{}',ctx); exception when others then denied:=sqlerrm='test_mode_business_write_blocked'; end;
  insert into qa_auto_results values('RPC rejects business writes in test mode',denied);
  update public.automation_runs set context=context||'{"mode":"live"}' where id=r;
  update public.tenants set status='suspended' where id=t;
  denied:=false; begin perform public.execute_automation_internal_action(r,(select id from qa_auto_ids where k='task'),'create_task','{}',ctx); exception when others then denied:=sqlerrm='tenant_not_operational'; end;
  insert into qa_auto_results values('RPC blocks suspended tenant',denied);
  update public.tenants set status='active' where id=t;
end $$;

do $$ begin perform set_config('request.jwt.claims',jsonb_build_object('sub',(select id from qa_auto_ids where k='owner_a'),'role','authenticated')::text,true); end $$;
set local role authenticated;
do $$ declare denied boolean:=false; begin
  begin perform public.execute_automation_internal_action((select id from qa_auto_ids where k='run'),(select id from qa_auto_ids where k='task'),'create_task','{}','{}'); exception when insufficient_privilege then denied:=true; end;
  insert into qa_auto_results values('Authenticated owner cannot call service executor',denied);
end $$;
reset role;
insert into public.automation_runs(id,tenant_id,rule_id,status,context)
select (select id from qa_auto_ids where k='test_run'),(select id from qa_auto_ids where k='tenant_a'),(select id from qa_auto_ids where k='rule'),'succeeded','{"mode":"test","execution_contract":"safe-v2","flow_version":1}'::jsonb;
update public.automation_rules set status='active' where id=(select id from qa_auto_ids where k='rule');
insert into qa_auto_results select 'Activation accepts safe test for same version',status='active' from public.automation_rules where id=(select id from qa_auto_ids where k='rule');
do $$ begin if exists(select 1 from qa_auto_results where not passed) then raise exception 'Automation SQL regression failed'; end if; end $$;
select jsonb_build_object('total',count(*),'passed',count(*) filter(where passed),'failed',coalesce(jsonb_agg(check_name) filter(where not passed),'[]'::jsonb)) as automation_effect_results from qa_auto_results;
rollback;

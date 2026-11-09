-- Supervised ARM interventions: human-verified workflow and observed business feedback.
-- No outbound messages, no automatic opportunity changes and no fabricated win rates.
begin;

create table if not exists public.crm_arm_interventions (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id) on delete cascade,
 opportunity_id uuid not null,
 recommendation_key text not null check (recommendation_key in
  ('review_stage_status','assign_owner','verify_customer','recover_overdue',
   'schedule_followup','record_activity','renew_contact','review_pipeline')),
 recommendation_reason text not null,
 suggested_agent text not null check(suggested_agent in ('vendedor','supervisor')),
 status text not null default 'proposed' check(status in
  ('proposed','approved','rejected','stale','executed','measured')),
 snapshot_pipeline_id uuid not null,
 snapshot_stage_id uuid not null,
 snapshot_stage_position integer not null,
 snapshot_opportunity_status text not null,
 proposed_by uuid not null,
 reviewed_by uuid,
 executed_by uuid,
 measured_by uuid,
 task_id uuid references public.tasks(id) on delete set null,
 observed_result text check(observed_result in
  ('won','advanced','lost','no_progress_after_7d')),
 proposed_at timestamptz not null default now(),
 reviewed_at timestamptz,
 executed_at timestamptz,
 measured_at timestamptz,
 check ((status <> 'measured') or (observed_result is not null and measured_at is not null))
);
create index if not exists crm_arm_interventions_tenant_recent
 on public.crm_arm_interventions(tenant_id,proposed_at desc,id);
create unique index if not exists crm_arm_interventions_one_active
 on public.crm_arm_interventions(tenant_id,opportunity_id,recommendation_key)
 where status in ('proposed','approved','executed');

create table if not exists public.crm_arm_intervention_events (
 id bigint generated always as identity primary key,
 tenant_id uuid not null references public.tenants(id) on delete cascade,
 intervention_id uuid not null references public.crm_arm_interventions(id) on delete cascade,
 event_key text not null check (event_key in
  ('proposed','approved','rejected','stale','task_created','task_completed','result_measured')),
 actor_user_id uuid,
 occurred_at timestamptz not null default now(),
 task_id uuid,
 observed_result text
);
create index if not exists crm_arm_intervention_events_recent
 on public.crm_arm_intervention_events(tenant_id,intervention_id,occurred_at desc);

alter table public.crm_arm_interventions enable row level security;
alter table public.crm_arm_intervention_events enable row level security;
revoke all on public.crm_arm_interventions from public,anon,authenticated;
revoke all on public.crm_arm_intervention_events from public,anon,authenticated;
grant select on public.crm_arm_interventions to authenticated;
grant select on public.crm_arm_intervention_events to authenticated;

create policy crm_arm_interventions_tenant_read on public.crm_arm_interventions
 for select to authenticated using(
  (select private.has_tenant_access(tenant_id))
  and (select private.crm_active_tenant_matches(tenant_id))
 );
create policy crm_arm_intervention_events_tenant_read on public.crm_arm_intervention_events
 for select to authenticated using(
  (select private.has_tenant_access(tenant_id))
  and (select private.crm_active_tenant_matches(tenant_id))
 );

-- All writers are narrow, authenticated RPCs. They never trust caller-supplied
-- reasons, priorities, labels, financial figures or recipient identities.
create or replace function public.crm_arm_propose_intervention(
 p_tenant_id uuid,p_opportunity_id uuid,p_recommendation_key text
) returns uuid
language plpgsql security definer set search_path=''
as $fn$
declare
 v_actor uuid := (select auth.uid());
 v_opp public.opportunities%rowtype;
 v_advice record;
 v_pos integer;
 v_id uuid;
begin
 if v_actor is null or not private.has_tenant_role(p_tenant_id,array['owner','admin','manager','agent']::text[])
  or not private.crm_active_tenant_matches(p_tenant_id) then
   raise exception 'not_authorized' using errcode='42501';
 end if;
 select * into v_opp from public.opportunities
  where tenant_id=p_tenant_id and id=p_opportunity_id and status='open'
  for update;
 if not found then raise exception 'opportunity_not_open'; end if;
 select * into v_advice from public.crm_arm_next_actions
  where tenant_id=p_tenant_id and opportunity_id=p_opportunity_id
   and recommendation_key=p_recommendation_key and evidence_source='crm_rules'
   and requires_human_approval=true;
 if not found then raise exception 'recommendation_changed'; end if;
 select position into v_pos from public.pipeline_stages
  where tenant_id=p_tenant_id and pipeline_id=v_opp.pipeline_id and id=v_opp.stage_id;
 if v_pos is null then raise exception 'stage_not_found'; end if;
 insert into public.crm_arm_interventions(
  tenant_id,opportunity_id,recommendation_key,recommendation_reason,suggested_agent,
  snapshot_pipeline_id,snapshot_stage_id,snapshot_stage_position,
  snapshot_opportunity_status,proposed_by
 ) values(
  p_tenant_id,p_opportunity_id,p_recommendation_key,v_advice.recommendation_reason,
  v_advice.suggested_agent,v_opp.pipeline_id,v_opp.stage_id,v_pos,v_opp.status,v_actor
 )
 on conflict (tenant_id,opportunity_id,recommendation_key)
  where status in ('proposed','approved','executed')
 do nothing returning id into v_id;
 if v_id is null then
  select id into v_id from public.crm_arm_interventions
  where tenant_id=p_tenant_id and opportunity_id=p_opportunity_id
   and recommendation_key=p_recommendation_key
   and status in ('proposed','approved','executed') order by proposed_at desc limit 1;
 else
  insert into public.crm_arm_intervention_events(tenant_id,intervention_id,event_key,actor_user_id)
   values(p_tenant_id,v_id,'proposed',v_actor);
 end if;
 return v_id;
end;
$fn$;

create or replace function public.crm_arm_review_intervention(
 p_tenant_id uuid,p_intervention_id uuid,p_approve boolean
) returns text
language plpgsql security definer set search_path=''
as $fn$
declare
 v_actor uuid:=(select auth.uid());
 v_row public.crm_arm_interventions%rowtype;
 v_status text;
begin
 if v_actor is null or not private.has_tenant_role(p_tenant_id,array['owner','admin']::text[])
   or not private.crm_active_tenant_matches(p_tenant_id) then
  raise exception 'approval_requires_owner_or_admin' using errcode='42501';
 end if;
 select * into v_row from public.crm_arm_interventions where tenant_id=p_tenant_id
  and id=p_intervention_id for update;
 if not found then raise exception 'intervention_not_found'; end if;
 if v_row.status<>'proposed' then raise exception 'intervention_not_pending'; end if;
 v_status:=case when p_approve then 'approved' else 'rejected' end;
 update public.crm_arm_interventions set status=v_status,reviewed_by=v_actor,reviewed_at=now()
  where id=v_row.id;
 insert into public.crm_arm_intervention_events(tenant_id,intervention_id,event_key,actor_user_id)
  values(p_tenant_id,v_row.id,v_status,v_actor);
 return v_status;
end;
$fn$;

create or replace function public.crm_arm_execute_intervention(
 p_tenant_id uuid,p_intervention_id uuid
) returns uuid
language plpgsql security definer set search_path=''
as $fn$
declare
 v_actor uuid:=(select auth.uid());
 v_row public.crm_arm_interventions%rowtype;
 v_opp public.opportunities%rowtype;
 v_advice record;
 v_assignee uuid;
 v_task_id uuid;
 v_title text;
begin
 if v_actor is null or not private.has_tenant_role(p_tenant_id,array['owner','admin','manager','agent']::text[])
  or not private.crm_active_tenant_matches(p_tenant_id) then
  raise exception 'not_authorized' using errcode='42501';
 end if;
 select * into v_row from public.crm_arm_interventions where tenant_id=p_tenant_id
  and id=p_intervention_id for update;
 if not found then raise exception 'intervention_not_found'; end if;
 if v_row.status='executed' then return v_row.task_id; end if;
 if v_row.status<>'approved' then raise exception 'action_not_approved'; end if;
 select * into v_opp from public.opportunities
  where id=v_row.opportunity_id and tenant_id=p_tenant_id for update;
 select * into v_advice from public.crm_arm_next_actions
  where tenant_id=p_tenant_id and opportunity_id=v_row.opportunity_id;
 if v_opp.id is null or v_opp.status<>'open'
   or v_opp.pipeline_id<>v_row.snapshot_pipeline_id
   or v_opp.stage_id<>v_row.snapshot_stage_id
   or v_advice.recommendation_key is distinct from v_row.recommendation_key then
  update public.crm_arm_interventions set status='stale' where id=v_row.id;
  insert into public.crm_arm_intervention_events(tenant_id,intervention_id,event_key,actor_user_id)
   values(p_tenant_id,v_row.id,'stale',v_actor);
  return null;
 end if;
 select m.user_id into v_assignee from public.memberships m
  where m.tenant_id=p_tenant_id and m.status='active'
   and m.user_id=v_opp.owner_user_id limit 1;
 if v_assignee is null then
  select m.user_id into v_assignee from public.memberships m
   where m.tenant_id=p_tenant_id and m.status='active'
    and m.user_id=v_actor limit 1;
 end if;
 v_title:=case v_row.recommendation_key
  when 'assign_owner' then 'Asignar responsable comercial'
  when 'verify_customer' then 'Verificar cliente vinculado'
  when 'recover_overdue' then 'Recuperar seguimiento vencido'
  when 'schedule_followup' then 'Programar próximo seguimiento'
  when 'record_activity' then 'Registrar actividad comercial'
  when 'renew_contact' then 'Revisar contacto inactivo'
  when 'review_stage_status' then 'Revisar coherencia de etapa comercial'
  else 'Revisar evolución comercial' end;
 insert into public.tasks(
  tenant_id,title,description,status,priority,due_at,assigned_user_id,
  opportunity_id,company_id,contact_id,source,metadata,created_by
 ) values(
  p_tenant_id,v_title, 'Intervención ARM supervisada: '||left(v_opp.title,160),
  'todo',case when v_row.recommendation_key in ('recover_overdue','review_stage_status') then 'high' else 'normal' end,
  now()+interval '1 day',v_assignee,v_opp.id,v_opp.company_id,v_opp.contact_id,'manual',
  jsonb_build_object('kind','crm_arm_intervention','intervention_id',v_row.id),v_actor
 ) returning id into v_task_id;
 update public.crm_arm_interventions set status='executed',executed_at=now(),
  executed_by=v_actor,task_id=v_task_id where id=v_row.id;
 insert into public.crm_arm_intervention_events(tenant_id,intervention_id,event_key,actor_user_id,task_id)
  values(p_tenant_id,v_row.id,'task_created',v_actor,v_task_id);
 return v_task_id;
end;
$fn$;

create or replace function public.crm_arm_complete_intervention_task(
 p_tenant_id uuid,p_intervention_id uuid
) returns boolean
language plpgsql security definer set search_path=''
as $fn$
declare
 v_actor uuid:=(select auth.uid());
 v_row public.crm_arm_interventions%rowtype;
 v_task public.tasks%rowtype;
begin
 if v_actor is null or not private.has_tenant_role(p_tenant_id,array['owner','admin','manager','agent']::text[])
  or not private.crm_active_tenant_matches(p_tenant_id) then
  raise exception 'not_authorized' using errcode='42501';
 end if;
 select * into v_row from public.crm_arm_interventions where tenant_id=p_tenant_id
  and id=p_intervention_id for update;
 if not found or v_row.status<>'executed' or v_row.task_id is null then
  raise exception 'intervention_not_executed';
 end if;
 select * into v_task from public.tasks where tenant_id=p_tenant_id and id=v_row.task_id for update;
 if not found then raise exception 'task_not_found'; end if;
 if v_task.status='done' then return true; end if;
 if v_task.assigned_user_id is not null and v_task.assigned_user_id<>v_actor
  and not private.has_tenant_role(p_tenant_id,array['owner','admin']::text[]) then
  raise exception 'task_assignee_or_admin_required' using errcode='42501';
 end if;
 if v_task.status='cancelled' then raise exception 'task_cancelled'; end if;
 update public.tasks set status='done',completed_at=now() where id=v_task.id;
 insert into public.crm_arm_intervention_events(tenant_id,intervention_id,event_key,actor_user_id,task_id)
  values(p_tenant_id,v_row.id,'task_completed',v_actor,v_task.id);
 return true;
end;
$fn$;

create or replace function public.crm_arm_measure_intervention(
 p_tenant_id uuid,p_intervention_id uuid
) returns text
language plpgsql security definer set search_path=''
as $fn$
declare
 v_actor uuid:=(select auth.uid());
 v_row public.crm_arm_interventions%rowtype;
 v_task public.tasks%rowtype;
 v_opp public.opportunities%rowtype;
 v_now_position integer;
 v_result text;
begin
 if v_actor is null or not private.has_tenant_role(p_tenant_id,array['owner','admin','manager','agent']::text[])
  or not private.crm_active_tenant_matches(p_tenant_id) then
  raise exception 'not_authorized' using errcode='42501';
 end if;
 select * into v_row from public.crm_arm_interventions
  where id=p_intervention_id and tenant_id=p_tenant_id for update;
 if not found or v_row.status not in ('executed','measured') then
  raise exception 'intervention_not_executed';
 end if;
 if v_row.status='measured' then return v_row.observed_result; end if;
 select * into v_task from public.tasks where tenant_id=p_tenant_id and id=v_row.task_id;
 if not found or v_task.status<>'done' or v_task.completed_at is null then
  raise exception 'task_must_be_completed_first';
 end if;
 select * into v_opp from public.opportunities where tenant_id=p_tenant_id and id=v_row.opportunity_id;
 if not found then raise exception 'opportunity_not_found'; end if;
 select position into v_now_position from public.pipeline_stages
  where tenant_id=p_tenant_id and pipeline_id=v_opp.pipeline_id and id=v_opp.stage_id;
 v_result:=case
  when v_opp.status='won' then 'won'
  when v_opp.status='lost' then 'lost'
  when v_opp.status='open' and v_opp.pipeline_id=v_row.snapshot_pipeline_id
   and v_now_position>v_row.snapshot_stage_position then 'advanced'
  when now()>=v_task.completed_at+interval '7 days' then 'no_progress_after_7d'
  else null end;
 if v_result is null then raise exception 'result_window_not_finished'; end if;
 update public.crm_arm_interventions set status='measured',observed_result=v_result,
  measured_by=v_actor,measured_at=now() where id=v_row.id;
 insert into public.crm_arm_intervention_events(
  tenant_id,intervention_id,event_key,actor_user_id,task_id,observed_result
 ) values(p_tenant_id,v_row.id,'result_measured',v_actor,v_row.task_id,v_result);
 return v_result;
end;
$fn$;

-- All measures are OBSERVATIONAL, never described as counterfactual impact.
create or replace view public.crm_arm_intervention_learning
with (security_invoker=true) as
select tenant_id,recommendation_key,
 count(*)::integer as measured_count,
 count(*) filter (where observed_result in ('won','advanced'))::integer as progress_count,
 count(*) filter (where observed_result='won')::integer as won_count,
 count(*) filter (where observed_result='lost')::integer as lost_count,
 count(*) filter (where observed_result='no_progress_after_7d')::integer as no_progress_count
from public.crm_arm_interventions
where status='measured' and private.crm_active_tenant_matches(tenant_id)
group by tenant_id,recommendation_key;
revoke all on public.crm_arm_intervention_learning from public,anon,authenticated;
grant select on public.crm_arm_intervention_learning to authenticated;

-- Public RPCs have minimum privileges, explicit auth checks and fixed behavior.
revoke all on function public.crm_arm_propose_intervention(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.crm_arm_review_intervention(uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function public.crm_arm_execute_intervention(uuid,uuid) from public,anon,authenticated;
revoke all on function public.crm_arm_complete_intervention_task(uuid,uuid) from public,anon,authenticated;
revoke all on function public.crm_arm_measure_intervention(uuid,uuid) from public,anon,authenticated;
grant execute on function public.crm_arm_propose_intervention(uuid,uuid,text) to authenticated;
grant execute on function public.crm_arm_review_intervention(uuid,uuid,boolean) to authenticated;
grant execute on function public.crm_arm_execute_intervention(uuid,uuid) to authenticated;
grant execute on function public.crm_arm_complete_intervention_task(uuid,uuid) to authenticated;
grant execute on function public.crm_arm_measure_intervention(uuid,uuid) to authenticated;

comment on view public.crm_arm_intervention_learning is
 'Observational association by intervention type and tenant; not causal proof or a trained model.';
commit;

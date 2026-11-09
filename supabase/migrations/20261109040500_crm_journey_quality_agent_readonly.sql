-- Durable, tenant-isolated commercial journey and read-only ARM advice.
-- Legacy data receives one explicitly marked baseline; past transitions are NOT invented.
begin;

create table if not exists public.crm_opportunity_journey (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id) on delete cascade,
 opportunity_id uuid not null,
 event_type text not null check (event_type in
  ('legacy_baseline','created','stage_changed','pipeline_changed','outcome_recorded','reopened','status_changed')),
 from_pipeline_id uuid,
 to_pipeline_id uuid,
 from_stage_id uuid,
 to_stage_id uuid,
 from_stage_name text,
 to_stage_name text,
 from_status text,
 to_status text not null check (to_status in ('open','won','lost')),
 actor_user_id uuid,
 occurred_at timestamptz not null default now(),
 is_historical_baseline boolean not null default false,
 check ((event_type='legacy_baseline')=is_historical_baseline)
);
create index if not exists crm_opportunity_journey_tenant_time
 on public.crm_opportunity_journey(tenant_id,occurred_at desc,id);
create index if not exists crm_opportunity_journey_deal_time
 on public.crm_opportunity_journey(tenant_id,opportunity_id,occurred_at desc);
create unique index if not exists crm_opportunity_legacy_baseline_once
 on public.crm_opportunity_journey(tenant_id,opportunity_id)
 where event_type='legacy_baseline';

alter table public.crm_opportunity_journey enable row level security;
revoke all on public.crm_opportunity_journey from public,anon,authenticated;
grant select on public.crm_opportunity_journey to authenticated;
drop policy if exists crm_opportunity_journey_read on public.crm_opportunity_journey;
create policy crm_opportunity_journey_read on public.crm_opportunity_journey
 for select to authenticated using (
  (select private.has_tenant_access(tenant_id))
  and (select private.crm_active_tenant_matches(tenant_id))
 );

create or replace function private.record_crm_opportunity_journey()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare
 v_old_name text;
 v_new_name text;
 v_event text;
begin
 if tg_op='UPDATE' and
  old.stage_id is not distinct from new.stage_id and
  old.pipeline_id is not distinct from new.pipeline_id and
  old.status is not distinct from new.status then
  return new;
 end if;
 if tg_op='UPDATE' and old.tenant_id is distinct from new.tenant_id then
  raise exception 'Opportunity tenant cannot change';
 end if;
 select s.name into v_new_name from public.pipeline_stages s
  where s.tenant_id=new.tenant_id and s.pipeline_id=new.pipeline_id and s.id=new.stage_id;
 if tg_op='INSERT' then
  v_event:='created';
 else
  select s.name into v_old_name from public.pipeline_stages s
   where s.tenant_id=old.tenant_id and s.pipeline_id=old.pipeline_id and s.id=old.stage_id;
  v_event:=case
   when old.status='open' and new.status in ('won','lost') then 'outcome_recorded'
   when old.status in ('won','lost') and new.status='open' then 'reopened'
   when old.pipeline_id is distinct from new.pipeline_id then 'pipeline_changed'
   when old.stage_id is distinct from new.stage_id then 'stage_changed'
   else 'status_changed'
  end;
 end if;
 insert into public.crm_opportunity_journey(
  tenant_id,opportunity_id,event_type,
  from_pipeline_id,to_pipeline_id,
  from_stage_id,to_stage_id,from_stage_name,to_stage_name,
  from_status,to_status,actor_user_id,occurred_at,is_historical_baseline
 ) values (
  new.tenant_id,new.id,v_event,
  case when tg_op='UPDATE' then old.pipeline_id else null end,new.pipeline_id,
  case when tg_op='UPDATE' then old.stage_id else null end,new.stage_id,
  v_old_name,v_new_name,
  case when tg_op='UPDATE' then old.status else null end,new.status,
  auth.uid(),now(),false
 );
 return new;
end;
$function$;
revoke all on function private.record_crm_opportunity_journey() from public,anon,authenticated;
drop trigger if exists crm_opportunity_journey_insert on public.opportunities;
create trigger crm_opportunity_journey_insert
 after insert on public.opportunities
 for each row execute function private.record_crm_opportunity_journey();
drop trigger if exists crm_opportunity_journey_update on public.opportunities;
create trigger crm_opportunity_journey_update
 after update of stage_id,pipeline_id,status on public.opportunities
 for each row execute function private.record_crm_opportunity_journey();

-- A CRM record cannot be reassigned between tenants without destroying history provenance.
create or replace function private.crm_prevent_opportunity_tenant_reassignment()
returns trigger language plpgsql security definer set search_path=''
as $function$
begin
 if new.tenant_id is distinct from old.tenant_id then
  raise exception 'Opportunity cannot be reassigned to another tenant';
 end if;
 return new;
end;
$function$;
revoke all on function private.crm_prevent_opportunity_tenant_reassignment() from public,anon,authenticated;
drop trigger if exists crm_opportunity_prevent_tenant_reassignment on public.opportunities;
create trigger crm_opportunity_prevent_tenant_reassignment
 before update of tenant_id on public.opportunities
 for each row execute function private.crm_prevent_opportunity_tenant_reassignment();

-- Baseline is a current observation at migration time, never a fabricated history.
insert into public.crm_opportunity_journey(
 tenant_id,opportunity_id,event_type,to_pipeline_id,to_stage_id,
 to_stage_name,to_status,occurred_at,is_historical_baseline
)
select o.tenant_id,o.id,'legacy_baseline',o.pipeline_id,o.stage_id,
 s.name,o.status,now(),true
from public.opportunities o
left join public.pipeline_stages s
 on s.tenant_id=o.tenant_id and s.pipeline_id=o.pipeline_id and s.id=o.stage_id
on conflict do nothing;

-- Agent-facing tool data source. SECURITY INVOKER preserves base-table RLS.
-- No outbound action, no LLM API call, and no direct access to customer messages.
create or replace view public.crm_arm_next_actions
with (security_invoker=true) as
select
 o.tenant_id,
 o.id as opportunity_id,
 o.title as opportunity_title,
 o.status as opportunity_status,
 s.name as stage_name,
 case
  when s.stage_type<>o.status then 'review_stage_status'
  when o.owner_user_id is null then 'assign_owner'
  when o.company_id is null and o.contact_id is null then 'verify_customer'
  when o.status='open' and o.next_action_at<now() then 'recover_overdue'
  when o.status='open' and o.next_action_at is null then 'schedule_followup'
  when o.status='open' and o.last_activity_at is null then 'record_activity'
  when o.status='open' and o.last_activity_at<now()-interval '14 days' then 'renew_contact'
  else 'review_pipeline'
 end as recommendation_key,
 case
  when s.stage_type<>o.status or (o.status='open' and o.next_action_at<now()) then 'alta'
  when o.owner_user_id is null or (o.company_id is null and o.contact_id is null)
   or (o.status='open' and o.next_action_at is null)
   or (o.status='open' and o.last_activity_at is null)
   or (o.status='open' and o.last_activity_at<now()-interval '14 days') then 'media'
  else 'baja'
 end as priority,
 case when s.stage_type<>o.status or o.owner_user_id is null then 'supervisor'
  else 'vendedor' end as suggested_agent,
 case
  when s.stage_type<>o.status then 'Revisar etapa y estado comercial: no coinciden.'
  when o.owner_user_id is null then 'Asignar un vendedor responsable.'
  when o.company_id is null and o.contact_id is null then 'Vincular un cliente verificado.'
  when o.status='open' and o.next_action_at<now() then 'Recuperar el seguimiento vencido.'
  when o.status='open' and o.next_action_at is null then 'Programar una próxima acción.'
  when o.status='open' and o.last_activity_at is null then 'Registrar actividad comercial verificable.'
  when o.status='open' and o.last_activity_at<now()-interval '14 days' then 'Revisar contacto inactivo.'
  else 'Revisar progreso y próximos pasos.'
 end as recommendation_reason,
 coalesce((
  select count(*)::integer
  from public.crm_opportunity_journey j
  where j.tenant_id=o.tenant_id and j.opportunity_id=o.id
    and j.event_type in ('stage_changed','pipeline_changed','outcome_recorded','reopened')
 ),0) as verified_transitions,
 'crm_rules'::text as evidence_source,
 true as requires_human_approval
from public.opportunities o
join public.pipeline_stages s
 on s.tenant_id=o.tenant_id and s.pipeline_id=o.pipeline_id and s.id=o.stage_id
where o.status='open'
 and private.crm_active_tenant_matches(o.tenant_id);

revoke all on public.crm_arm_next_actions from public,anon,authenticated;
grant select on public.crm_arm_next_actions to authenticated;

comment on table public.crm_opportunity_journey is
 'Append-only events from database triggers. legacy_baseline is observed now, not an inferred historical transition. Tenant read via RLS.';
comment on view public.crm_arm_next_actions is
 'Read-only, tenant-scoped deterministic recommendations for CRM/ARM agents and human review; never executes customer-facing actions.';
commit;

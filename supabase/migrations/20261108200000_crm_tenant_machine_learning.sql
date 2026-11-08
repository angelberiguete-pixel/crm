-- CRM/ARM-wide ML foundation: two independently trainable capabilities, strictly isolated per tenant.
-- Zero backfill, zero automatic outbound actions, zero PII. Labels captured only on real status transitions.
begin;

create table if not exists public.crm_ml_training_examples (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  capability text not null check (capability in ('sales_win','quote_acceptance')),
  entity_id uuid not null,
  features jsonb not null check (jsonb_typeof(features)='object'),
  positive boolean not null,
  recorded_at timestamptz not null default now(),
  primary key (tenant_id,capability,entity_id)
);
create index if not exists crm_ml_examples_by_tenant_time
  on public.crm_ml_training_examples (tenant_id,capability,recorded_at desc);
alter table public.crm_ml_training_examples enable row level security;
revoke all on public.crm_ml_training_examples from public,anon,authenticated;
grant select on public.crm_ml_training_examples to authenticated;
create policy crm_ml_examples_tenant_read on public.crm_ml_training_examples
 for select to authenticated
 using (
   (select private.has_tenant_access(tenant_id))
   and (select private.crm_active_tenant_matches(tenant_id))
 );

create or replace function private.capture_crm_ml_sales()
returns trigger language plpgsql security definer set search_path=''
as $fn$
declare
 v_stage text;
 v_position integer;
 v_min integer;
 v_max integer;
 v_quotes integer;
 v_tasks integer;
 v_overdue integer;
 v_created_days numeric;
 v_activity_days numeric;
begin
 if old.status <> 'open' or new.status not in ('won','lost') then return new; end if;
 select stage_type into v_stage from public.pipeline_stages
  where tenant_id=new.tenant_id and pipeline_id=new.pipeline_id and id=new.stage_id;
 if v_stage is distinct from new.status then return new; end if;

 select position into v_position from public.pipeline_stages
  where tenant_id=old.tenant_id and pipeline_id=old.pipeline_id and id=old.stage_id;
 select min(position),max(position) into v_min,v_max from public.pipeline_stages
  where tenant_id=old.tenant_id and pipeline_id=old.pipeline_id and stage_type='open';
 select count(*) into v_quotes from public.quotations
  where tenant_id=old.tenant_id and opportunity_id=old.id;
 select count(*),count(*) filter (
  where status not in ('completed','done','cancelled','canceled')
  and due_at is not null and due_at<now()
 ) into v_tasks,v_overdue from public.tasks
 where tenant_id=old.tenant_id and opportunity_id=old.id;
 v_created_days:=greatest(0,extract(epoch from (now()-old.created_at))/86400.0);
 v_activity_days:=greatest(0,extract(epoch from (now()-coalesce(old.last_activity_at,old.created_at)))/86400.0);
 insert into public.crm_ml_training_examples (tenant_id,capability,entity_id,features,positive)
 values (old.tenant_id,'sales_win',old.id,
  jsonb_build_object(
   'stage',least(1.0,greatest(0.0,coalesce((v_position-v_min)::numeric/nullif(v_max-v_min,0),0))),
   'age',least(1.0,v_created_days/90.0),
   'quotes',least(1.0,v_quotes::numeric/3.0),
   'tasks',least(1.0,v_tasks::numeric/5.0),
   'overdue',least(1.0,v_overdue::numeric/3.0),
   'assigned',case when old.owner_user_id is null then 0 else 1 end,
   'freshness',1.0-least(1.0,v_activity_days/30.0)
  ),(new.status='won'))
 on conflict (tenant_id,capability,entity_id) do nothing;
 return new;
end;
$fn$;
revoke all on function private.capture_crm_ml_sales() from public,anon,authenticated;
drop trigger if exists crm_ml_capture_sales_outcome on public.opportunities;
create trigger crm_ml_capture_sales_outcome
 before update of status on public.opportunities
 for each row execute function private.capture_crm_ml_sales();

create or replace function private.capture_crm_ml_quote()
returns trigger language plpgsql security definer set search_path=''
as $fn$
declare
 v_items integer;
 v_age_days numeric;
 v_remaining numeric;
begin
 if old.status in ('accepted','rejected') or new.status not in ('accepted','rejected')
  then return new;
 end if;
 select count(*) into v_items from public.quotation_items
  where tenant_id=old.tenant_id and quotation_id=old.id;
 v_age_days:=greatest(0,extract(epoch from (now()-old.created_at))/86400.0);
 v_remaining:=case when old.valid_until is null then 0 else
  greatest(0,extract(epoch from ((old.valid_until::timestamptz)-now()))/86400.0) end;
 insert into public.crm_ml_training_examples(tenant_id,capability,entity_id,features,positive)
 values (old.tenant_id,'quote_acceptance',old.id,
  jsonb_build_object(
   'age',least(1.0,v_age_days/60.0),
   'items',least(1.0,v_items::numeric/5.0),
   'linked',case when old.opportunity_id is null then 0 else 1 end,
   'expiry',least(1.0,v_remaining/30.0)
  ),new.status='accepted')
 on conflict (tenant_id,capability,entity_id) do nothing;
 return new;
end;
$fn$;
revoke all on function private.capture_crm_ml_quote() from public,anon,authenticated;
drop trigger if exists crm_ml_capture_quote_outcome on public.quotations;
create trigger crm_ml_capture_quote_outcome
 before update of status on public.quotations
 for each row execute function private.capture_crm_ml_quote();
commit;

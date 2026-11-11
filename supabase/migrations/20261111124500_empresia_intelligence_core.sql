-- Empresia Intelligence v1: observe -> classify -> authorize -> internal task -> measured outcome.
-- This migration does NOT send messages, generate invoices, capture money or call an LLM.
-- All customer records remain in their original tenant-scoped CRM/ERP tables.
begin;

-- Fail closed: no tenant emits brain decisions until explicitly approved for pilot.
-- No direct client grants. Family Power is not enrolled.
create table if not exists private.empresia_brain_tenant_pilots (
 tenant_id uuid primary key references public.tenants(id) on delete cascade,
 enabled boolean not null default false,
 activated_at timestamptz
);
revoke all on private.empresia_brain_tenant_pilots from public,anon,authenticated;

create table if not exists public.empresia_brain_events (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id) on delete cascade,
 event_type text not null check(event_type in
   ('message.inbound','contact.created','opportunity.created','opportunity.changed',
    'quotation.created','quotation.changed','order.created','order.changed',
    'delivery.created','delivery.changed','payment.created','payment.changed')),
 source_table text not null check(source_table in
   ('messages','contacts','opportunities','quotations','orders','deliveries','customer_payments')),
 source_id uuid not null,
 event_key text not null,
 evidence jsonb not null default '{}'::jsonb,
 occurred_at timestamptz not null default now(),
 unique(tenant_id,event_key),
 unique(tenant_id,id)
);
create index if not exists empresia_brain_events_tenant_recent
 on public.empresia_brain_events(tenant_id,occurred_at desc,id);

create table if not exists public.empresia_brain_decisions (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id) on delete cascade,
 event_id uuid not null,
 action_key text not null check(action_key in
   ('review_inbound','qualify_contact','review_opportunity','review_quotation',
    'coordinate_order','followup_delivery','verify_payment')),
 risk_level text not null check(risk_level in ('low','controlled','supervised','restricted')),
 status text not null default 'proposed' check(status in
   ('proposed','approved','rejected','executed','observed')),
 reason_code text not null,
 evidence jsonb not null default '{}'::jsonb,
 task_id uuid references public.tasks(id) on delete set null,
 reviewed_by uuid,
 reviewed_at timestamptz,
 executed_by uuid,
 executed_at timestamptz,
 created_at timestamptz not null default now(),
 unique(tenant_id,event_id),
 unique(tenant_id,id),
 constraint empresia_brain_decisions_event_fk
  foreign key (tenant_id,event_id) references public.empresia_brain_events(tenant_id,id)
  on delete cascade
);
create index if not exists empresia_brain_decisions_pending
 on public.empresia_brain_decisions(tenant_id,status,created_at desc);

create table if not exists public.empresia_brain_outcomes (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null,
 decision_id uuid not null,
 task_id uuid not null references public.tasks(id) on delete cascade,
 outcome_key text not null check(outcome_key in ('task_completed')),
 observed_at timestamptz not null default now(),
 unique(tenant_id,decision_id,outcome_key),
 constraint empresia_brain_outcome_decision_fk
  foreign key(tenant_id,decision_id) references public.empresia_brain_decisions(tenant_id,id)
  on delete cascade
);

-- Tenant isolation, including active tenant context, is enforced by RLS.
-- There is NO direct INSERT, UPDATE or DELETE permission for authenticated clients.
alter table public.empresia_brain_events enable row level security;
alter table public.empresia_brain_decisions enable row level security;
alter table public.empresia_brain_outcomes enable row level security;
revoke all on public.empresia_brain_events from public,anon,authenticated;
revoke all on public.empresia_brain_decisions from public,anon,authenticated;
revoke all on public.empresia_brain_outcomes from public,anon,authenticated;
grant select on public.empresia_brain_events to authenticated;
grant select on public.empresia_brain_decisions to authenticated;
grant select on public.empresia_brain_outcomes to authenticated;

create policy empresia_brain_events_admin_read on public.empresia_brain_events
 for select to authenticated using (
  (select private.has_tenant_role(tenant_id,array['owner','admin','manager']::text[]))
  and (select private.crm_active_tenant_matches(tenant_id))
 );
create policy empresia_brain_decisions_admin_read on public.empresia_brain_decisions
 for select to authenticated using (
  (select private.has_tenant_role(tenant_id,array['owner','admin','manager']::text[]))
  and (select private.crm_active_tenant_matches(tenant_id))
 );
create policy empresia_brain_outcomes_admin_read on public.empresia_brain_outcomes
 for select to authenticated using (
  (select private.has_tenant_role(tenant_id,array['owner','admin','manager']::text[]))
  and (select private.crm_active_tenant_matches(tenant_id))
 );

-- A fast, deterministic, bounded decision stage. No model-generated action or
-- untrusted event payload is ever permitted to control an SQL operation.
create or replace function private.empresia_brain_plan_event()
returns trigger
language plpgsql security definer set search_path=''
as $brain$
declare
 v_action text;
 v_risk text;
 v_reason text;
 v_body text;
 v_contact_id uuid;
 v_product_id uuid;
 v_product_verified boolean:=false;
 v_context jsonb:='{}'::jsonb;
begin
 v_action:=case
  when new.event_type='message.inbound' then 'review_inbound'
  when new.event_type='contact.created' then 'qualify_contact'
  when new.event_type like 'opportunity.%' then 'review_opportunity'
  when new.event_type like 'quotation.%' then 'review_quotation'
  when new.event_type like 'order.%' then 'coordinate_order'
  when new.event_type like 'delivery.%' then 'followup_delivery'
  when new.event_type like 'payment.%' then 'verify_payment'
  else null end;
 if v_action is null then return new; end if;
 v_risk:=case
  when v_action='verify_payment' then 'restricted'
  when v_action='review_quotation' then 'supervised'
  when v_action='coordinate_order' then 'supervised'
  when v_action='review_inbound' then 'controlled'
  when v_action='followup_delivery' then 'controlled'
  else 'low' end;
 v_reason:=case
  when v_action='review_inbound' then 'inbound_message_needs_verified_context'
  when v_action='qualify_contact' then 'new_contact_requires_qualification'
  when v_action='review_opportunity' then 'commercial_change_needs_next_step'
  when v_action='review_quotation' then 'quotation_needs_authorized_review'
  when v_action='coordinate_order' then 'order_requires_operational_coordination'
  when v_action='followup_delivery' then 'delivery_requires_status_check'
  else 'payment_requires_provider_confirmation' end;
 -- The three memory sources are consulted, never copied wholesale:
 -- conversation history remains in messages, verified catalog in products,
 -- and observed results in empresia_brain_outcomes.
 if v_action='review_inbound' then
  select m.body,c.contact_id into v_body,v_contact_id
   from public.messages m join public.conversations c
    on c.id=m.conversation_id and c.tenant_id=m.tenant_id
   where m.tenant_id=new.tenant_id and m.id=new.source_id
     and m.direction='inbound';
  if coalesce(v_body,'') ~* '(inversor|inverter)'
   and coalesce(v_body,'') ~* '3[.,]6[[:space:]]*(kw|kva)?' then
    select p.id into v_product_id from public.products p
     where p.tenant_id=new.tenant_id and p.status='active'
       and (p.name ~* '3[.,]6' or p.sku ~* '3[.,]6')
     order by p.updated_at desc limit 1;
    if v_product_id is not null then
      select (p.sale_price>0 and p.metadata->>'price_verified'='true')
        into v_product_verified
        from public.products p where p.id=v_product_id and p.tenant_id=new.tenant_id;
    end if;
    v_reason:=case when v_product_verified then 'verified_product_candidate_human_draft'
      else 'inverter_36kw_price_not_verified' end;
    v_context:=pg_catalog.jsonb_build_object(
      'intent','inverter_36kw_inquiry','contact_id',v_contact_id,
      'candidate_product_id',v_product_id,
      'price_verified',v_product_verified,
      'outbound_sent',false,'quotation_issued',false);
  else
    v_context:=pg_catalog.jsonb_build_object(
      'intent','general_inquiry','contact_id',v_contact_id,'outbound_sent',false);
  end if;
 end if;
 insert into public.empresia_brain_decisions(
  tenant_id,event_id,action_key,risk_level,reason_code,evidence
 ) values(
  new.tenant_id,new.id,v_action,v_risk,v_reason,
  pg_catalog.jsonb_build_object('event_id',new.id,'source_table',new.source_table,
    'source_id',new.source_id,'event_type',new.event_type,'source_state',new.evidence,'context',v_context)
 );
 return new;
end;
$brain$;
revoke all on function private.empresia_brain_plan_event() from public,anon,authenticated;
create trigger empresia_brain_plan_on_event
 after insert on public.empresia_brain_events
 for each row execute function private.empresia_brain_plan_event();

-- Observe only trusted, committed business mutations. No message bodies,
-- addresses, phone numbers, bank references or customer secrets are copied.
create or replace function private.empresia_brain_capture_event()
returns trigger
language plpgsql security definer set search_path=''
as $brain$
declare
 v_event text;
 v_source_id uuid;
 v_tenant_id uuid;
 v_evidence jsonb:='{}'::jsonb;
 v_key text;
begin
 if not exists (select 1 from private.empresia_brain_tenant_pilots p
  where p.tenant_id=new.tenant_id and p.enabled=true) then return new; end if;
 v_source_id:=new.id;
 v_tenant_id:=new.tenant_id;
 if tg_table_name='messages' then
  if tg_op<>'INSERT' or new.direction<>'inbound' then return new; end if;
  v_event:='message.inbound';
  v_evidence:=pg_catalog.jsonb_build_object('conversation_id',new.conversation_id,'channel','inbox');
 elsif tg_table_name='contacts' then
  if tg_op<>'INSERT' then return new; end if;
  v_event:='contact.created';
 elsif tg_table_name='opportunities' then
  if tg_op='UPDATE' then
    if new.stage_id is not distinct from old.stage_id
      and new.status is not distinct from old.status then return new; end if;
    v_event:='opportunity.changed';
  else v_event:='opportunity.created'; end if;
  v_evidence:=pg_catalog.jsonb_build_object('opportunity_id',new.id,'status',new.status);
 elsif tg_table_name='quotations' then
  if tg_op='UPDATE' then
    if new.status is not distinct from old.status then return new; end if;
    v_event:='quotation.changed';
  else v_event:='quotation.created'; end if;
  v_evidence:=pg_catalog.jsonb_build_object('status',new.status,'quotation_id',new.id);
 elsif tg_table_name='orders' then
  if tg_op='UPDATE' then
    if new.status is not distinct from old.status then return new; end if;
    v_event:='order.changed';
  else v_event:='order.created'; end if;
  v_evidence:=pg_catalog.jsonb_build_object('status',new.status,'order_id',new.id);
 elsif tg_table_name='deliveries' then
  if tg_op='UPDATE' then
    if new.status is not distinct from old.status then return new; end if;
    v_event:='delivery.changed';
  else v_event:='delivery.created'; end if;
  v_evidence:=pg_catalog.jsonb_build_object('status',new.status,'delivered',new.delivered_at is not null);
 elsif tg_table_name='customer_payments' then
  if tg_op='UPDATE' then
    if new.status is not distinct from old.status then return new; end if;
    v_event:='payment.changed';
  else v_event:='payment.created'; end if;
  v_evidence:=pg_catalog.jsonb_build_object('status',new.status);
 else return new; end if;
 -- A change captured twice in the same transaction is still one decision;
 -- distinct transactions and intentional state transitions remain visible.
 v_key:=tg_table_name||':'||v_source_id::text||':'||v_event||':'
  ||pg_catalog.txid_current()::text||':'||(case when tg_op='UPDATE' then coalesce(v_evidence->>'status','changed') else 'insert' end);
 insert into public.empresia_brain_events(
  tenant_id,event_type,source_table,source_id,event_key,evidence
 ) values(v_tenant_id,v_event,tg_table_name,v_source_id,v_key,v_evidence)
 on conflict(tenant_id,event_key) do nothing;
 return new;
end;
$brain$;
revoke all on function private.empresia_brain_capture_event() from public,anon,authenticated;

create trigger empresia_brain_message_inbound
 after insert on public.messages
 for each row execute function private.empresia_brain_capture_event();
create trigger empresia_brain_contact_created
 after insert on public.contacts
 for each row execute function private.empresia_brain_capture_event();
create trigger empresia_brain_opportunity_changed
 after insert or update on public.opportunities
 for each row execute function private.empresia_brain_capture_event();
create trigger empresia_brain_quotation_changed
 after insert or update on public.quotations
 for each row execute function private.empresia_brain_capture_event();
create trigger empresia_brain_order_changed
 after insert or update on public.orders
 for each row execute function private.empresia_brain_capture_event();
create trigger empresia_brain_delivery_changed
 after insert or update on public.deliveries
 for each row execute function private.empresia_brain_capture_event();
create trigger empresia_brain_payment_changed
 after insert or update on public.customer_payments
 for each row execute function private.empresia_brain_capture_event();

-- Human authorization is enforced inside PostgreSQL, not a UI button or agent
-- prompt. A review NEVER sends a message or commits an invoice.
create or replace function public.empresia_brain_review(
 p_tenant_id uuid,p_decision_id uuid,p_approve boolean
) returns text
language plpgsql security definer set search_path=''
as $brain$
declare
 v_actor uuid:=(select auth.uid());
 v_decision public.empresia_brain_decisions%rowtype;
 v_status text;
begin
 if v_actor is null
   or not private.has_tenant_role(p_tenant_id,array['owner','admin']::text[])
   or not private.crm_active_tenant_matches(p_tenant_id) then
  raise exception 'owner_or_admin_required' using errcode='42501';
 end if;
 select * into v_decision from public.empresia_brain_decisions
  where tenant_id=p_tenant_id and id=p_decision_id for update;
 if not found then raise exception 'decision_not_found'; end if;
 if v_decision.status<>'proposed' then raise exception 'decision_already_reviewed'; end if;
 v_status:=case when p_approve then 'approved' else 'rejected' end;
 update public.empresia_brain_decisions
  set status=v_status,reviewed_by=v_actor,reviewed_at=now()
  where id=v_decision.id and tenant_id=p_tenant_id;
 return v_status;
end;
$brain$;
revoke all on function public.empresia_brain_review(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.empresia_brain_review(uuid,uuid,boolean) to authenticated;

-- Only an internal CRM task is executable in v1. No arbitrary tool names,
-- SQL strings, outbound replies, pricing, payment updates or e-CF are accepted.
create or replace function public.empresia_brain_execute_task(
 p_tenant_id uuid,p_decision_id uuid
) returns uuid
language plpgsql security definer set search_path=''
as $brain$
declare
 v_actor uuid:=(select auth.uid());
 v_decision public.empresia_brain_decisions%rowtype;
 v_event public.empresia_brain_events%rowtype;
 v_task_id uuid;
 v_contact_id uuid;
 v_opportunity_id uuid;
 v_company_id uuid;
 v_title text;
begin
 if v_actor is null
   or not private.has_tenant_role(p_tenant_id,array['owner','admin']::text[])
   or not private.crm_active_tenant_matches(p_tenant_id) then
  raise exception 'owner_or_admin_required' using errcode='42501';
 end if;
 select * into v_decision from public.empresia_brain_decisions
  where tenant_id=p_tenant_id and id=p_decision_id for update;
 if not found then raise exception 'decision_not_found'; end if;
 if v_decision.status in ('executed','observed') and v_decision.task_id is not null
  then return v_decision.task_id; end if;
 if v_decision.status<>'approved' or v_decision.reviewed_by is null then
  raise exception 'explicit_approval_required' using errcode='42501';
 end if;
 select * into v_event from public.empresia_brain_events
  where tenant_id=p_tenant_id and id=v_decision.event_id;
 if not found then raise exception 'event_not_found'; end if;

 -- The source must still exist in this same tenant; no cross-tenant references.
 if v_event.source_table='messages' then
  select c.contact_id,c.opportunity_id into v_contact_id,v_opportunity_id
   from public.messages m join public.conversations c
     on c.tenant_id=m.tenant_id and c.id=m.conversation_id
   where m.id=v_event.source_id and m.tenant_id=p_tenant_id
     and m.direction='inbound';
  if not found then raise exception 'source_changed'; end if;
 elsif v_event.source_table='contacts' then
  select id,company_id into v_contact_id,v_company_id
   from public.contacts where tenant_id=p_tenant_id and id=v_event.source_id;
  if not found then raise exception 'source_changed'; end if;
 elsif v_event.source_table='opportunities' then
  select id,contact_id,company_id into v_opportunity_id,v_contact_id,v_company_id
   from public.opportunities where tenant_id=p_tenant_id and id=v_event.source_id;
  if not found then raise exception 'source_changed'; end if;
 elsif v_event.source_table='quotations' then
  select opportunity_id,contact_id,company_id into v_opportunity_id,v_contact_id,v_company_id
   from public.quotations where tenant_id=p_tenant_id and id=v_event.source_id;
  if not found then raise exception 'source_changed'; end if;
 elsif v_event.source_table='orders' then
  select opportunity_id,contact_id,company_id into v_opportunity_id,v_contact_id,v_company_id
   from public.orders where tenant_id=p_tenant_id and id=v_event.source_id;
  if not found then raise exception 'source_changed'; end if;
 elsif v_event.source_table='deliveries' then
  select o.opportunity_id,o.contact_id,o.company_id into v_opportunity_id,v_contact_id,v_company_id
   from public.deliveries d join public.orders o
     on o.tenant_id=d.tenant_id and o.id=d.order_id
   where d.tenant_id=p_tenant_id and d.id=v_event.source_id;
  if not found then raise exception 'source_changed'; end if;
 elsif v_event.source_table='customer_payments' then
  select o.opportunity_id,o.contact_id,o.company_id into v_opportunity_id,v_contact_id,v_company_id
   from public.customer_payments p left join public.orders o
     on o.id=p.order_id and o.tenant_id=p.tenant_id
   where p.tenant_id=p_tenant_id and p.id=v_event.source_id;
  if not found then raise exception 'source_changed'; end if;
 else raise exception 'source_not_supported'; end if;
 v_title:=case v_decision.action_key
  when 'review_inbound' then 'Revisar consulta entrante'
  when 'qualify_contact' then 'Calificar cliente registrado'
  when 'review_opportunity' then 'Revisar avance de oportunidad'
  when 'review_quotation' then 'Verificar cotización'
  when 'coordinate_order' then 'Coordinar pedido'
  when 'followup_delivery' then 'Revisar entrega y satisfacción'
  when 'verify_payment' then 'Comprobar cobro con proveedor'
  else null end;
 if v_title is null then raise exception 'action_not_supported'; end if;
 insert into public.tasks(
  tenant_id,title,description,status,priority,due_at,
  assigned_user_id,contact_id,company_id,opportunity_id,
  source,metadata,created_by
 ) values(
  p_tenant_id,v_title,
  'Empresia Intelligence: tarea interna aprobada; no implica mensaje, pago ni factura.',
  'todo',case when v_decision.risk_level in ('restricted','supervised') then 'high' else 'normal' end,
  now()+interval '1 day',v_actor,v_contact_id,v_company_id,v_opportunity_id,
  'ai',pg_catalog.jsonb_build_object('brain_decision_id',v_decision.id,'event_id',v_event.id),
  v_actor
 ) returning id into v_task_id;
 update public.empresia_brain_decisions
   set status='executed',executed_by=v_actor,executed_at=now(),task_id=v_task_id
   where tenant_id=p_tenant_id and id=v_decision.id;
 return v_task_id;
end;
$brain$;
revoke all on function public.empresia_brain_execute_task(uuid,uuid) from public,anon,authenticated;
grant execute on function public.empresia_brain_execute_task(uuid,uuid) to authenticated;

-- Observed feedback: completing a task is measured as task completion ONLY.
-- A completed task never becomes a fabricated sale, receipt or satisfaction score.
create or replace function private.empresia_brain_measure_task()
returns trigger
language plpgsql security definer set search_path=''
as $brain$
declare v_decision public.empresia_brain_decisions%rowtype;
begin
 if new.status<>'done' or (old.status='done') or new.completed_at is null then return new; end if;
 select * into v_decision from public.empresia_brain_decisions
  where tenant_id=new.tenant_id and task_id=new.id and status='executed'
  for update;
 if not found then return new; end if;
 insert into public.empresia_brain_outcomes(
  tenant_id,decision_id,task_id,outcome_key
 ) values(new.tenant_id,v_decision.id,new.id,'task_completed')
 on conflict(tenant_id,decision_id,outcome_key) do nothing;
 update public.empresia_brain_decisions set status='observed'
  where tenant_id=new.tenant_id and id=v_decision.id and status='executed';
 return new;
end;
$brain$;
revoke all on function private.empresia_brain_measure_task() from public,anon,authenticated;
create trigger empresia_brain_task_observed
 after update of status on public.tasks
 for each row execute function private.empresia_brain_measure_task();

create or replace view public.empresia_brain_learning
 with (security_invoker=true)
as
select d.tenant_id,d.action_key,
 count(*)::integer as proposed_count,
 count(*) filter(where d.reviewed_at is not null and d.status<>'rejected')::integer as approved_count,
 count(*) filter(where d.status in ('executed','observed'))::integer as executed_count,
 count(*) filter(where d.status='observed')::integer as task_completed_count
from public.empresia_brain_decisions d
group by d.tenant_id,d.action_key;
revoke all on public.empresia_brain_learning from public,anon,authenticated;
grant select on public.empresia_brain_learning to authenticated;

comment on table public.empresia_brain_events is
 'Append-only, sanitized, tenant-scoped operational events. No raw customer messages.';
comment on table public.empresia_brain_decisions is
 'Deterministic proposals, human-approved internal actions; never authorize external effects.';
comment on table public.empresia_brain_outcomes is
 'Observed operational feedback only; task completion does not imply conversion.';
comment on view public.empresia_brain_learning is
 'Tenant-scoped learning metrics based solely on verified review/action/observation records.';

commit;

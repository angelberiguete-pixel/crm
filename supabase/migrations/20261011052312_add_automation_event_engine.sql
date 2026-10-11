create table if not exists private.automation_worker_control (
  singleton boolean primary key default true check (singleton),
  key_hash text not null,
  created_at timestamptz not null default now(),
  rotated_at timestamptz not null default now()
);

do $$
declare
  v_secret text;
begin
  if not exists (select 1 from private.automation_worker_control where singleton) then
    v_secret := encode(extensions.gen_random_bytes(32),'hex');
    perform vault.create_secret(v_secret,'look_social_automation_worker','Look Social Media CRM automation worker key',null);
    insert into private.automation_worker_control(singleton,key_hash)
    values(true,encode(extensions.digest(v_secret,'sha256'),'hex'));
  end if;
end $$;

create table if not exists public.automation_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  event_type text not null,
  entity_type text,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload)='object'),
  mode text not null default 'live' check (mode in ('live','test')),
  target_rule_id uuid,
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed','skipped')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  processed_at timestamptz,
  last_error text,
  idempotency_key text,
  created_at timestamptz not null default now(),
  unique (tenant_id,id),
  constraint automation_events_target_rule_tenant_fk
    foreign key (tenant_id,target_rule_id)
    references public.automation_rules(tenant_id,id)
    on delete cascade
);

create unique index if not exists automation_events_idempotency_uidx
on public.automation_events(tenant_id,idempotency_key)
where idempotency_key is not null;

create index if not exists automation_events_ready_idx
on public.automation_events(status,available_at,created_at)
where status='queued';

alter table public.automation_events enable row level security;

drop policy if exists automation_events_select on public.automation_events;
create policy automation_events_select on public.automation_events
for select to authenticated
using (private.has_tenant_access(tenant_id));

create table if not exists public.automation_flow_node_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  run_id uuid not null,
  node_id uuid not null,
  status text not null default 'queued' check (status in ('queued','running','waiting_approval','succeeded','failed','skipped')),
  input jsonb not null default '{}'::jsonb check (jsonb_typeof(input)='object'),
  output jsonb,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms bigint,
  created_at timestamptz not null default now(),
  unique (tenant_id,id),
  constraint automation_flow_node_runs_run_fk
    foreign key (tenant_id,run_id)
    references public.automation_runs(tenant_id,id)
    on delete cascade,
  constraint automation_flow_node_runs_node_fk
    foreign key (tenant_id,node_id)
    references public.automation_flow_nodes(tenant_id,id)
    on delete cascade
);

create index if not exists automation_flow_node_runs_run_idx
on public.automation_flow_node_runs(tenant_id,run_id,created_at);

alter table public.automation_flow_node_runs enable row level security;

drop policy if exists automation_flow_node_runs_select on public.automation_flow_node_runs;
create policy automation_flow_node_runs_select on public.automation_flow_node_runs
for select to authenticated
using (private.has_tenant_access(tenant_id));

create or replace function private.enqueue_automation_event(
  p_tenant_id uuid,
  p_event_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_payload jsonb,
  p_idempotency_key text default null,
  p_mode text default 'live',
  p_target_rule_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
begin
  insert into public.automation_events(
    tenant_id,event_type,entity_type,entity_id,payload,idempotency_key,mode,target_rule_id
  )
  values(
    p_tenant_id,p_event_type,p_entity_type,p_entity_id,coalesce(p_payload,'{}'::jsonb),
    p_idempotency_key,p_mode,p_target_rule_id
  )
  on conflict (tenant_id,idempotency_key) where idempotency_key is not null
  do nothing
  returning id into v_id;

  if v_id is null and p_idempotency_key is not null then
    select id into v_id
    from public.automation_events
    where tenant_id=p_tenant_id and idempotency_key=p_idempotency_key
    limit 1;
  end if;

  return v_id;
end;
$$;

create or replace function private.automation_contacts_event()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform private.enqueue_automation_event(
    new.tenant_id,'contact_created','contact',new.id,
    jsonb_build_object('contact_id',new.id,'company_id',new.company_id,'display_name',new.display_name,'email',new.email,'phone',new.phone,'whatsapp_phone',new.whatsapp_phone,'status',new.status,'owner_user_id',new.owner_user_id,'source',new.source),
    'contact_created:'||new.id::text
  );
  if new.status='lead' then
    perform private.enqueue_automation_event(
      new.tenant_id,'lead_created','contact',new.id,
      jsonb_build_object('contact_id',new.id,'company_id',new.company_id,'display_name',new.display_name,'email',new.email,'phone',new.phone,'whatsapp_phone',new.whatsapp_phone,'status',new.status,'owner_user_id',new.owner_user_id,'source',new.source),
      'lead_created:'||new.id::text
    );
  end if;
  return new;
end;
$$;

drop trigger if exists contacts_automation_events on public.contacts;
create trigger contacts_automation_events after insert on public.contacts
for each row execute function private.automation_contacts_event();

create or replace function private.automation_opportunity_event()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' then
    perform private.enqueue_automation_event(
      new.tenant_id,'opportunity_created','opportunity',new.id,
      jsonb_build_object('opportunity_id',new.id,'contact_id',new.contact_id,'company_id',new.company_id,'pipeline_id',new.pipeline_id,'stage_id',new.stage_id,'status',new.status,'owner_user_id',new.owner_user_id,'lead_score',new.lead_score,'value',new.value),
      'opportunity_created:'||new.id::text
    );
  elsif old.stage_id is distinct from new.stage_id then
    perform private.enqueue_automation_event(
      new.tenant_id,'stage_changed','opportunity',new.id,
      jsonb_build_object('opportunity_id',new.id,'contact_id',new.contact_id,'company_id',new.company_id,'pipeline_id',new.pipeline_id,'previous_stage_id',old.stage_id,'stage_id',new.stage_id,'status',new.status,'owner_user_id',new.owner_user_id,'lead_score',new.lead_score,'value',new.value),
      'stage_changed:'||new.id::text||':'||new.stage_id::text||':'||extract(epoch from clock_timestamp())::bigint::text
    );
  end if;
  return new;
end;
$$;

drop trigger if exists opportunities_automation_events on public.opportunities;
create trigger opportunities_automation_events after insert or update of stage_id on public.opportunities
for each row execute function private.automation_opportunity_event();

create or replace function private.automation_message_event()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_contact uuid; v_opportunity uuid;
begin
  if new.direction='inbound' then
    select c.contact_id,c.opportunity_id into v_contact,v_opportunity
    from public.conversations c
    where c.tenant_id=new.tenant_id and c.id=new.conversation_id;
    perform private.enqueue_automation_event(
      new.tenant_id,'message_received','message',new.id,
      jsonb_build_object('message_id',new.id,'conversation_id',new.conversation_id,'contact_id',v_contact,'opportunity_id',v_opportunity,'body',left(coalesce(new.body,''),4000),'message_type',new.message_type,'status',new.status),
      'message_received:'||new.id::text
    );
  end if;
  return new;
end;
$$;

drop trigger if exists messages_automation_events on public.messages;
create trigger messages_automation_events after insert on public.messages
for each row execute function private.automation_message_event();

create or replace function private.automation_quotation_event()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_event text;
begin
  if tg_op='INSERT' then
    v_event := 'quotation_created';
  elsif old.status is distinct from new.status then
    v_event := case new.status when 'sent' then 'quotation_sent' when 'accepted' then 'quotation_accepted' when 'expired' then 'quotation_expired' else null end;
  end if;
  if v_event is not null then
    perform private.enqueue_automation_event(
      new.tenant_id,v_event,'quotation',new.id,
      jsonb_build_object('quotation_id',new.id,'quote_number',new.quote_number,'contact_id',new.contact_id,'company_id',new.company_id,'opportunity_id',new.opportunity_id,'status',new.status,'total',new.total,'currency',new.currency,'valid_until',new.valid_until),
      v_event||':'||new.id::text||':'||coalesce(new.status,'')
    );
  end if;
  return new;
end;
$$;

drop trigger if exists quotations_automation_events on public.quotations;
create trigger quotations_automation_events after insert or update of status on public.quotations
for each row execute function private.automation_quotation_event();

create or replace function private.automation_order_event()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform private.enqueue_automation_event(
    new.tenant_id,'order_created','order',new.id,
    jsonb_build_object('order_id',new.id,'order_number',new.order_number,'quotation_id',new.quotation_id,'contact_id',new.contact_id,'company_id',new.company_id,'opportunity_id',new.opportunity_id,'status',new.status,'total',new.total,'amount_paid',new.amount_paid,'currency',new.currency),
    'order_created:'||new.id::text
  );
  return new;
end;
$$;

drop trigger if exists orders_automation_events on public.orders;
create trigger orders_automation_events after insert on public.orders
for each row execute function private.automation_order_event();

create or replace function private.automation_payment_event()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_contact uuid; v_company uuid; v_opportunity uuid;
begin
  select o.contact_id,o.company_id,o.opportunity_id into v_contact,v_company,v_opportunity
  from public.orders o where o.tenant_id=new.tenant_id and o.id=new.order_id;
  perform private.enqueue_automation_event(
    new.tenant_id,'payment_received','payment',new.id,
    jsonb_build_object('payment_id',new.id,'order_id',new.order_id,'contact_id',v_contact,'company_id',v_company,'opportunity_id',v_opportunity,'amount',new.amount,'currency',new.currency,'status',new.status,'payment_method',new.payment_method,'received_at',new.received_at),
    'payment_received:'||new.id::text
  );
  return new;
end;
$$;

drop trigger if exists customer_payments_automation_events on public.customer_payments;
create trigger customer_payments_automation_events after insert on public.customer_payments
for each row execute function private.automation_payment_event();

create or replace function public.queue_automation_test(p_rule_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_tenant uuid; v_event text; v_event_id uuid;
begin
  select tenant_id,trigger_event into v_tenant,v_event from public.automation_rules where id=p_rule_id;
  if v_tenant is null then raise exception 'Automation not found'; end if;
  if not (private.is_tenant_admin(v_tenant) or private.crm_is_platform_admin()) then raise exception 'Tenant admin required'; end if;
  v_event_id := private.enqueue_automation_event(
    v_tenant,coalesce(v_event,'custom_event'),'test','00000000-0000-0000-0000-000000000001'::uuid,
    jsonb_build_object('test',true,'contact_id',null,'company_id',null,'opportunity_id',null,'lead_score',75,'display_name','Lead de prueba'),
    'test:'||p_rule_id::text||':'||extract(epoch from clock_timestamp())::bigint::text,'test',p_rule_id
  );
  insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
  values(v_tenant,auth.uid(),'automation.test_queued','automation_rule',p_rule_id,jsonb_build_object('event_id',v_event_id));
  return jsonb_build_object('event_id',v_event_id,'rule_id',p_rule_id,'status','queued');
end;
$$;

revoke all on function public.queue_automation_test(uuid) from public,anon;
grant execute on function public.queue_automation_test(uuid) to authenticated;

create or replace function public.claim_automation_events(p_limit integer default 20)
returns setof public.automation_events
language plpgsql security definer set search_path='' as $$
begin
  if current_user not in ('service_role','postgres') then raise exception 'Service role required'; end if;
  return query
  with picked as (
    select e.id from public.automation_events e
    where e.status='queued' and e.available_at<=now()
    order by e.created_at
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,20),100))
  )
  update public.automation_events e
  set status='running',attempts=e.attempts+1,locked_at=now(),last_error=null
  from picked where e.id=picked.id
  returning e.*;
end;
$$;

create or replace function public.finish_automation_event(p_event_id uuid,p_status text,p_error text default null)
returns void language plpgsql security definer set search_path='' as $$
begin
  if current_user not in ('service_role','postgres') then raise exception 'Service role required'; end if;
  if p_status not in ('succeeded','failed','skipped','queued') then raise exception 'Invalid event status'; end if;
  update public.automation_events
  set status=p_status,
      processed_at=case when p_status in ('succeeded','failed','skipped') then now() else null end,
      locked_at=null,
      last_error=left(p_error,2000),
      available_at=case when p_status='queued' then now()+interval '1 minute' else available_at end
  where id=p_event_id;
end;
$$;

create or replace function public.automation_worker_authorized(p_key text)
returns boolean language sql security definer set search_path='' as $$
  select current_user in ('service_role','postgres')
    and exists(
      select 1 from private.automation_worker_control c
      where c.singleton and c.key_hash=encode(extensions.digest(coalesce(p_key,''),'sha256'),'hex')
    )
$$;

revoke all on function public.claim_automation_events(integer) from public,anon,authenticated;
revoke all on function public.finish_automation_event(uuid,text,text) from public,anon,authenticated;
revoke all on function public.automation_worker_authorized(text) from public,anon,authenticated;
grant execute on function public.claim_automation_events(integer) to service_role;
grant execute on function public.finish_automation_event(uuid,text,text) to service_role;
grant execute on function public.automation_worker_authorized(text) to service_role;

comment on table public.automation_events is 'Tenant-scoped durable event queue for visual automation execution.';
comment on table public.automation_flow_node_runs is 'Per-node execution history for the visual automation engine.';

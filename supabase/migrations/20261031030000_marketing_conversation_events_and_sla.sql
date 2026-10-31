-- Tenant-isolated, evidence-based WhatsApp funnel instrumentation.
-- No Meta payload or customer PII is exported by this migration.
-- Event ledger only begins recording NEW changes; historical data is reported
-- via source tables and is never retroactively labeled as a conversion.

create table if not exists public.marketing_meta_connections (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  dataset_id text not null check (dataset_id ~ '^[0-9]{10,20}$'),
  waba_id text not null check (waba_id ~ '^[0-9]{10,20}$'),
  connection_status text not null default 'configuration_only'
    check (connection_status in ('configuration_only','awaiting_authorization','verified','disabled')),
  export_enabled boolean not null default false check (export_enabled = false or connection_status='verified'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.marketing_meta_connections enable row level security;
revoke all on public.marketing_meta_connections from anon,authenticated;
grant select on public.marketing_meta_connections to authenticated;
drop policy if exists marketing_meta_admin_select on public.marketing_meta_connections;
create policy marketing_meta_admin_select on public.marketing_meta_connections
  for select to authenticated using (
    private.crm_is_tenant_admin(tenant_id) or private.crm_is_platform_admin()
  );

-- Access to configuration is through a validated RPC only. No secrets are stored
-- in the table and no client may enable exports through this RPC.
create or replace function public.marketing_meta_configure_ids(
  p_tenant_id uuid,p_dataset_id text,p_waba_id text)
returns jsonb language plpgsql security definer set search_path=''
as $$
begin
  if auth.uid() is null or not (
    private.crm_is_tenant_admin(p_tenant_id) or private.crm_is_platform_admin()
  ) then raise exception 'Not permitted' using errcode='42501'; end if;
  if p_dataset_id !~ '^[0-9]{10,20}$' or p_waba_id !~ '^[0-9]{10,20}$'
  then raise exception 'Invalid Meta dataset or WABA identifier' using errcode='22023'; end if;
  if not exists(select 1 from public.tenants where id=p_tenant_id)
  then raise exception 'Unknown company' using errcode='P0002'; end if;
  insert into public.marketing_meta_connections as m
    (tenant_id,dataset_id,waba_id,connection_status,export_enabled)
  values(p_tenant_id,p_dataset_id,p_waba_id,'configuration_only',false)
  on conflict (tenant_id) do update
  set dataset_id=excluded.dataset_id,waba_id=excluded.waba_id,
      connection_status='configuration_only',export_enabled=false,updated_at=now();
  return jsonb_build_object('dataset_id',p_dataset_id,'waba_id',p_waba_id,
    'status','configuration_only','export_enabled',false);
end;
$$;
revoke all on function public.marketing_meta_configure_ids(uuid,text,text) from public,anon,authenticated;
grant execute on function public.marketing_meta_configure_ids(uuid,text,text) to authenticated;

create table if not exists public.marketing_event_ledger (
 id bigint generated always as identity primary key,
 tenant_id uuid not null references public.tenants(id) on delete cascade,
 conversation_id uuid,
 contact_id uuid,
 event_name text not null check(event_name in (
   'message_received','human_reply','ai_reply','interactive_reply',
   'quotation_sent','quotation_accepted','quotation_rejected',
   'opportunity_won')),
 source_table text not null check(source_table in ('messages','quotations','opportunities')),
 source_id uuid not null,
 occurred_at timestamptz not null,
 actor_user_id uuid,
 evidence_status text not null default 'crm_record' check(evidence_status in ('crm_record','provider_verified')),
 meta_export_state text not null default 'not_eligible' check(meta_export_state in ('not_eligible','held','sent','rejected')),
 created_at timestamptz not null default now(),
 unique(tenant_id,source_table,source_id,event_name)
);
create index if not exists marketing_event_ledger_tenant_time on public.marketing_event_ledger(tenant_id,occurred_at desc);
alter table public.marketing_event_ledger enable row level security;
revoke all on public.marketing_event_ledger from public,anon,authenticated;
-- No public direct event writes: only triggers on existing authorized CRM writes.

create or replace function private.crm_marketing_on_message()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_event text;
begin
  if new.direction='inbound' then
    v_event='message_received';
  elsif new.direction='outbound' and new.sender_type='user' and new.status in ('sent','delivered','read') then
    v_event='human_reply';
  elsif new.direction='outbound' and new.sender_type='ai' and new.status in ('sent','delivered','read') then
    v_event='ai_reply';
  else return new; end if;
  insert into public.marketing_event_ledger
    (tenant_id,conversation_id,contact_id,event_name,source_table,source_id,occurred_at,actor_user_id)
  select new.tenant_id,new.conversation_id,c.contact_id,v_event,'messages',new.id,
    coalesce(new.sent_at,new.created_at),new.sender_user_id
  from public.conversations c
  where c.id=new.conversation_id and c.tenant_id=new.tenant_id
  on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists crm_marketing_messages on public.messages;
create trigger crm_marketing_messages
 after insert or update of status on public.messages
 for each row execute function private.crm_marketing_on_message();

create or replace function private.crm_marketing_on_quotation()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_event text;
begin
  if tg_op='UPDATE' and old.status=new.status then return new; end if;
  v_event:=case new.status
    when 'sent' then 'quotation_sent'
    when 'accepted' then 'quotation_accepted'
    when 'rejected' then 'quotation_rejected'
    else null end;
  if v_event is null then return new; end if;
  insert into public.marketing_event_ledger
    (tenant_id,contact_id,event_name,source_table,source_id,occurred_at,actor_user_id)
  values(new.tenant_id,new.contact_id,v_event,'quotations',new.id,now(),new.created_by)
  on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists crm_marketing_quotations on public.quotations;
create trigger crm_marketing_quotations
 after insert or update of status on public.quotations
 for each row execute function private.crm_marketing_on_quotation();

create or replace function private.crm_marketing_on_opportunity()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if new.status<>'won' or (tg_op='UPDATE' and old.status='won') then return new; end if;
  insert into public.marketing_event_ledger
    (tenant_id,contact_id,event_name,source_table,source_id,occurred_at,actor_user_id)
  values(new.tenant_id,new.contact_id,'opportunity_won','opportunities',new.id,now(),new.owner_user_id)
  on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists crm_marketing_opportunities on public.opportunities;
create trigger crm_marketing_opportunities
 after insert or update of status on public.opportunities
 for each row execute function private.crm_marketing_on_opportunity();

create or replace function public.marketing_tenant_overview(p_tenant_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_stats jsonb; v_sla jsonb; v_config jsonb; v_events jsonb;
begin
  if auth.uid() is null or not (
    private.crm_is_tenant_admin(p_tenant_id) or private.crm_is_platform_admin()
  ) then raise exception 'Not permitted' using errcode='42501'; end if;
  if not exists(select 1 from public.tenants where id=p_tenant_id)
  then raise exception 'Unknown company' using errcode='P0002'; end if;
  select jsonb_build_object(
    'inbound_messages_30d',(select count(*) from public.messages where tenant_id=p_tenant_id and direction='inbound' and created_at>=now()-interval '30 days'),
    'active_conversations_30d',(select count(distinct conversation_id) from public.messages where tenant_id=p_tenant_id and direction='inbound' and created_at>=now()-interval '30 days'),
    'human_replies_30d',(select count(*) from public.messages where tenant_id=p_tenant_id and direction='outbound' and sender_type='user' and status in ('sent','delivered','read') and created_at>=now()-interval '30 days'),
    'ai_replies_30d',(select count(*) from public.messages where tenant_id=p_tenant_id and direction='outbound' and sender_type='ai' and status in ('sent','delivered','read') and created_at>=now()-interval '30 days'),
    'quotes_sent_30d',(select count(*) from public.quotations where tenant_id=p_tenant_id and status in ('sent','accepted','rejected') and created_at>=now()-interval '30 days'),
    'quotes_accepted_30d',(select count(*) from public.quotations where tenant_id=p_tenant_id and status='accepted' and created_at>=now()-interval '30 days'),
    'won_opportunities_30d',(select count(*) from public.opportunities where tenant_id=p_tenant_id and status='won' and updated_at>=now()-interval '30 days'),
    'inquiries_without_quote_30d',(select count(distinct c.id)
       from public.conversations c
       join public.messages m on m.conversation_id=c.id and m.tenant_id=c.tenant_id
       where c.tenant_id=p_tenant_id and m.direction='inbound'
         and m.created_at>=now()-interval '30 days'
         and not exists (select 1 from public.quotations q
           where q.tenant_id=c.tenant_id and q.contact_id=c.contact_id)
         and c.contact_id is not null)
  ) into v_stats;

  -- One qualifying first response per inbound turn. Do NOT count drafts,
  -- failed messages or unsent queue entries as a customer's response time.
  with inbound as (
    select m.id,m.conversation_id,m.created_at,
      lead(m.created_at) over(partition by m.conversation_id order by m.created_at,m.id) next_inbound
    from public.messages m
    where m.tenant_id=p_tenant_id and m.direction='inbound'
      and m.created_at>=now()-interval '30 days'
  ), reply as (
    select i.id inbound_id,r.sender_type,r.sender_user_id,
       extract(epoch from coalesce(r.sent_at,r.created_at)-i.created_at)::numeric as seconds
    from inbound i
    join lateral (
       select o.sender_type,o.sender_user_id,o.sent_at,o.created_at
       from public.messages o where o.tenant_id=p_tenant_id and o.conversation_id=i.conversation_id
         and o.direction='outbound' and o.sender_type in ('user','ai')
         and o.status in ('sent','delivered','read')
         and coalesce(o.sent_at,o.created_at)>=i.created_at
         and (i.next_inbound is null or coalesce(o.sent_at,o.created_at)<i.next_inbound)
       order by coalesce(o.sent_at,o.created_at),o.id limit 1
    ) r on true
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'actor',x.sender_type,'user_id',x.sender_user_id,'samples',x.samples,
    'average_seconds',x.avg_seconds,'median_seconds',x.median_seconds,
    'p90_seconds',x.p90_seconds) order by x.sender_type), '[]'::jsonb)
  into v_sla from (
    select sender_type,sender_user_id,count(*) samples,
      round(avg(seconds),1) avg_seconds,
      round((percentile_cont(0.5) within group (order by seconds))::numeric,1) median_seconds,
      round((percentile_cont(0.9) within group (order by seconds))::numeric,1) p90_seconds
    from reply where seconds>=0 and seconds<=2592000
    group by sender_type,sender_user_id
  ) x;
  select jsonb_build_object('dataset_id',dataset_id,'waba_id',waba_id,
      'status',connection_status,'export_enabled',export_enabled)
    into v_config from public.marketing_meta_connections where tenant_id=p_tenant_id;
  select coalesce(jsonb_object_agg(event_name,n),'{}'::jsonb) into v_events from (
    select event_name,count(*) n from public.marketing_event_ledger
    where tenant_id=p_tenant_id and occurred_at>=now()-interval '30 days'
    group by event_name
  ) e;
  return jsonb_build_object('tenant_id',p_tenant_id,'period_days',30,
    'calculated_at',now(),'counts',v_stats,'response_sla',v_sla,
    'recorded_events',v_events,'meta_configuration',v_config,
    'meta_export_live',false,'commercial_invoice_verified',false);
end;
$$;
revoke all on function public.marketing_tenant_overview(uuid) from public,anon,authenticated;
grant execute on function public.marketing_tenant_overview(uuid) to authenticated;
comment on function public.marketing_tenant_overview(uuid)
is 'Tenant-authorized marketing funnel and human/AI first-response metrics; Meta sending disabled until separately authorized and verified.';

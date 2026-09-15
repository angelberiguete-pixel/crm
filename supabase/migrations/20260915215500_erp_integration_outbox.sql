-- Reliable ERP integration foundation.
-- The CRM remains source of customer-facing state; Make/Odoo consume explicit outbox events.

create table if not exists public.integration_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  integration_key text not null,
  event_type text not null,
  aggregate_type text not null,
  aggregate_id uuid,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending','processing','succeeded','failed','dead_letter')),
  attempts integer not null default 0 check (attempts >= 0),
  idempotency_key text not null,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id,integration_key,idempotency_key)
);

create index if not exists integration_outbox_pending_idx
  on public.integration_outbox(integration_key,status,available_at,created_at)
  where status in ('pending','failed');

create table if not exists public.erp_entity_links (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider text not null default 'odoo',
  crm_entity_type text not null,
  crm_entity_id uuid not null,
  erp_model text not null,
  erp_record_id text not null,
  last_synced_at timestamptz,
  last_crm_updated_at timestamptz,
  last_erp_updated_at timestamptz,
  sync_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(tenant_id,provider,crm_entity_type,crm_entity_id),
  unique(tenant_id,provider,erp_model,erp_record_id)
);

alter table public.integration_outbox enable row level security;
alter table public.erp_entity_links enable row level security;

drop policy if exists integration_outbox_read on public.integration_outbox;
create policy integration_outbox_read on public.integration_outbox
for select to authenticated
using (private.crm_is_tenant_admin(tenant_id));

drop policy if exists integration_outbox_manage on public.integration_outbox;
create policy integration_outbox_manage on public.integration_outbox
for all to authenticated
using (private.crm_is_tenant_admin(tenant_id))
with check (private.crm_is_tenant_admin(tenant_id));

drop policy if exists erp_entity_links_read on public.erp_entity_links;
create policy erp_entity_links_read on public.erp_entity_links
for select to authenticated
using (private.crm_is_tenant_member(tenant_id));

drop policy if exists erp_entity_links_manage on public.erp_entity_links;
create policy erp_entity_links_manage on public.erp_entity_links
for all to authenticated
using (private.crm_is_tenant_admin(tenant_id))
with check (private.crm_is_tenant_admin(tenant_id));

create or replace function public.enqueue_erp_sync(
  p_tenant_id uuid,
  p_event_type text,
  p_aggregate_type text,
  p_aggregate_id uuid,
  p_payload jsonb default '{}'::jsonb,
  p_provider text default 'odoo',
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
  v_key text;
begin
  if not private.crm_is_tenant_member(p_tenant_id) then
    raise exception 'Tenant access required';
  end if;

  v_key := coalesce(nullif(trim(p_idempotency_key),''),
    concat(p_event_type,':',coalesce(p_aggregate_id::text,'none'),':',extract(epoch from clock_timestamp())::bigint::text));

  insert into public.integration_outbox(
    tenant_id,integration_key,event_type,aggregate_type,aggregate_id,payload,idempotency_key
  ) values (
    p_tenant_id,
    concat('erp:',lower(p_provider)),
    p_event_type,
    p_aggregate_type,
    p_aggregate_id,
    coalesce(p_payload,'{}'::jsonb),
    v_key
  )
  on conflict(tenant_id,integration_key,idempotency_key) do update
    set payload=excluded.payload,available_at=now(),updated_at=now()
  returning id into v_id;

  return v_id;
end;
$$;
revoke all on function public.enqueue_erp_sync(uuid,text,text,uuid,jsonb,text,text) from public,anon;
grant execute on function public.enqueue_erp_sync(uuid,text,text,uuid,jsonb,text,text) to authenticated;

-- Platform admins can inspect integration health across tenants without exposing credentials.
create or replace function public.platform_admin_erp_status()
returns table(
  tenant_id uuid,
  tenant_name text,
  provider text,
  connection_status text,
  credential_status text,
  last_healthcheck_at timestamptz,
  last_sync_at timestamptz,
  pending_events bigint,
  failed_events bigint
)
language plpgsql
security definer
set search_path=''
as $$
begin
  if not private.crm_is_platform_admin() then raise exception 'Platform admin required'; end if;
  return query
  select t.id,
         t.name,
         coalesce(ec.provider,'odoo')::text,
         coalesce(ec.status,'not_configured')::text,
         coalesce(ec.credential_status,'missing')::text,
         ec.last_healthcheck_at,
         ec.last_sync_at,
         (select count(*) from public.integration_outbox io where io.tenant_id=t.id and io.integration_key='erp:odoo' and io.status='pending'),
         (select count(*) from public.integration_outbox io where io.tenant_id=t.id and io.integration_key='erp:odoo' and io.status in ('failed','dead_letter'))
  from public.tenants t
  left join public.erp_connections ec on ec.tenant_id=t.id and ec.provider='odoo'
  order by t.created_at desc;
end;
$$;
revoke all on function public.platform_admin_erp_status() from public,anon;
grant execute on function public.platform_admin_erp_status() to authenticated;

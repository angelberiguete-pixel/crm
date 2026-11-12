-- Empresia multi-engine ERP: independent, deny-by-default single-writer controls.
-- Additive only. Does not connect servers, grant write access, or enroll any tenant.
-- Existing integrations work unchanged for unenrolled tenants.
create schema if not exists private;

create table if not exists private.erp_dual_tenant_enrollments (
 tenant_id uuid primary key references public.tenants(id) on delete cascade,
 enabled boolean not null default false,
 enabled_at timestamptz,
 approved_by uuid,
 check ((enabled=false) or enabled_at is not null)
);
revoke all on private.erp_dual_tenant_enrollments from public, anon, authenticated;

-- Canonical Supabase CRM records are the ONLY write authority until an
-- independently reviewed accounting ledger is delivered. No external engine
-- can claim canonical authority simply by being connected.
create table if not exists public.erp_dual_domain_policy (
 tenant_id uuid not null references public.tenants(id) on delete cascade,
 domain text not null check(domain in
  ('contacts','products','inventory','orders','purchases','invoices','payments','accounting','installations','documents')),
 canonical_system text not null default 'empresia' check(canonical_system='empresia'),
 sync_mode text not null default 'disabled' check(sync_mode in ('disabled','observe','mirror')),
 approved_by uuid,
 approved_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(tenant_id,domain),
 check (sync_mode='disabled' or (approved_by is not null and approved_at is not null))
);

create table if not exists public.erp_dual_external_ids (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id) on delete cascade,
 connection_id uuid not null references public.erp_connections(id),
 provider text not null check(provider in ('odoo','dolibarr')),
 domain text not null check(domain in
  ('contacts','products','inventory','orders','purchases','invoices','payments','accounting','installations','documents')),
 canonical_id uuid not null,
 external_model text not null check(length(external_model) between 1 and 120),
 external_id text not null check(length(external_id) between 1 and 160),
 status text not null default 'observed' check(status in ('observed','verified','conflict','disabled')),
 last_verified_at timestamptz,
 created_at timestamptz not null default now(),
 unique(tenant_id,provider,domain,canonical_id),
 unique(tenant_id,provider,domain,external_model,external_id)
);
create index if not exists erp_dual_external_ids_connection_idx
 on public.erp_dual_external_ids(tenant_id,connection_id);

create table if not exists public.erp_dual_outbox (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id) on delete cascade,
 domain text not null check(domain in ('inventory','orders','payments')),
 canonical_id uuid not null,
 event_key text not null check(length(event_key) between 8 and 220),
 event_kind text not null check(event_kind in
  ('order.insert','order.update','stock_movement.insert','payment.insert')),
 event_state text not null default 'pending' check(event_state in ('pending','processing','observed','failed','blocked')),
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 unique(tenant_id,event_key)
);
create index if not exists erp_dual_outbox_pending_idx
 on public.erp_dual_outbox(tenant_id,event_state,created_at);

create or replace function private.erp_dual_validate_external_id()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if not exists(
  select 1 from public.erp_connections c
  where c.id=new.connection_id
    and c.tenant_id=new.tenant_id and c.provider=new.provider
 ) then raise exception 'erp_external_connection_tenant_provider_mismatch'
      using errcode='42501';
 end if;
 if not exists (
  select 1 from private.erp_dual_tenant_enrollments e
  where e.tenant_id=new.tenant_id and e.enabled
 ) then raise exception 'erp_dual_integration_disabled'
      using errcode='42501';
 end if;
 return new;
end;
$$;
drop trigger if exists erp_dual_external_id_guard on public.erp_dual_external_ids;
create trigger erp_dual_external_id_guard
 before insert or update on public.erp_dual_external_ids
 for each row execute function private.erp_dual_validate_external_id();

create or replace function private.erp_dual_outbox_source()
returns trigger language plpgsql security definer set search_path=''
as $$
declare
 v_kind text;
 v_domain text;
 v_id uuid;
 v_change_id text;
begin
 if not exists(select 1 from private.erp_dual_tenant_enrollments e
   where e.tenant_id=new.tenant_id and e.enabled=true) then return new; end if;
 if tg_table_name='orders' then
  v_domain:='orders';v_kind:='order.'||lower(tg_op);
 elsif tg_table_name='inventory_movements' then
  v_domain:='inventory';v_kind:='stock_movement.insert';
 elsif tg_table_name='customer_payments' then
  v_domain:='payments';v_kind:='payment.insert';
 else return new; end if;
 v_id:=new.id;
 -- No customer information, prices, amounts or credentials in outbox.
 v_change_id:=coalesce(to_jsonb(new)->>'updated_at',
  to_jsonb(new)->>'created_at',pg_catalog.txid_current()::text);
 insert into public.erp_dual_outbox(
   tenant_id,domain,canonical_id,event_kind,event_key,metadata
 ) values (
   new.tenant_id,v_domain,v_id,v_kind,
   tg_table_name||':'||v_id::text||':'||lower(tg_op)||':'||v_change_id,
   jsonb_build_object('source_table',tg_table_name,'source_id',v_id,'event',v_kind)
 )
 on conflict(tenant_id,event_key) do nothing;
 return new;
end;
$$;
drop trigger if exists erp_dual_orders_event on public.orders;
create trigger erp_dual_orders_event after insert or update on public.orders
 for each row execute function private.erp_dual_outbox_source();
drop trigger if exists erp_dual_stock_event on public.inventory_movements;
create trigger erp_dual_stock_event after insert on public.inventory_movements
 for each row execute function private.erp_dual_outbox_source();
drop trigger if exists erp_dual_payments_event on public.customer_payments;
create trigger erp_dual_payments_event after insert on public.customer_payments
 for each row execute function private.erp_dual_outbox_source();

-- Existing Odoo worker supports pull/push/full_sync. A staged enrolled tenant
-- cannot accidentally write or import canonical transactional records using
-- the older bidirectional queue. Explicitly separate later approved adapters.
create or replace function private.erp_dual_protect_existing_jobs()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if (exists(select 1 from private.erp_dual_tenant_enrollments p
   where p.tenant_id=new.tenant_id and p.enabled=true)
   or exists(select 1 from public.tenants t
     where t.id=new.tenant_id and t.slug='eurevector'))
   and new.job_type in ('push','pull','full_sync')
   and (new.entity_type is null or new.entity_type in
     ('product','quotation','order','invoice','payment','inventory','stock_move','accounting','purchase'))
 then raise exception 'erp_canonical_domain_locked_for_dual_engine'
      using errcode='42501';
 end if;
 return new;
end;
$$;
drop trigger if exists erp_dual_sync_job_guard on public.erp_sync_jobs;
create trigger erp_dual_sync_job_guard before insert or update
 on public.erp_sync_jobs for each row
 execute function private.erp_dual_protect_existing_jobs();

-- Never give the browser a direct write path or any API credentials.
alter table public.erp_dual_domain_policy enable row level security;
alter table public.erp_dual_external_ids enable row level security;
alter table public.erp_dual_outbox enable row level security;
revoke all on public.erp_dual_domain_policy,public.erp_dual_external_ids,
 public.erp_dual_outbox from public,anon,authenticated;
grant select on public.erp_dual_domain_policy,public.erp_dual_external_ids,
 public.erp_dual_outbox to authenticated;

create policy erp_dual_domains_owner_read on public.erp_dual_domain_policy
 for select to authenticated
 using (private.crm_active_tenant_matches(tenant_id) and
   private.has_tenant_role(tenant_id,array['owner','admin']::text[]));
create policy erp_dual_ids_owner_read on public.erp_dual_external_ids
 for select to authenticated
 using (private.crm_active_tenant_matches(tenant_id) and
   private.has_tenant_role(tenant_id,array['owner','admin']::text[]));
create policy erp_dual_outbox_owner_read on public.erp_dual_outbox
 for select to authenticated
 using (private.crm_active_tenant_matches(tenant_id) and
   private.has_tenant_role(tenant_id,array['owner','admin']::text[]));

revoke all on function private.erp_dual_validate_external_id() from public,anon,authenticated;
revoke all on function private.erp_dual_outbox_source() from public,anon,authenticated;
revoke all on function private.erp_dual_protect_existing_jobs() from public,anon,authenticated;

create or replace view public.erp_dual_connection_status
 with (security_invoker=true) as
 select tenant_id,provider,status,sync_direction,last_healthcheck_at,
   case when last_healthcheck_at is null then false
    when last_healthcheck_at < now()-interval '24 hours' then false
    when status='connected' then true else false end as recently_verified
 from public.erp_connections where provider in ('odoo','dolibarr');
revoke all on public.erp_dual_connection_status from public,anon;
grant select on public.erp_dual_connection_status to authenticated;

comment on table public.erp_dual_domain_policy is
 'Staging-only single-writer authority for Odoo/Dolibarr; disabled by default.';
comment on table public.erp_dual_external_ids is
 'Deduplicated canonical-to-provider identity mapping, scoped to tenant.';
comment on table public.erp_dual_outbox is
 'Metadata-only canonical change log; does not execute external ERP writes.';

-- Protect Empresia even BEFORE tenant enrollment: legacy onboarding previously
-- marked Odoo as source_of_truth for inventory, sale orders and invoices.
-- Enrolled tenants are protected too. Existing unenrolled customer integrations
-- remain unchanged.
create or replace function private.erp_dual_guard_connection_authority()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_legacy jsonb;
begin
 if new.provider not in ('odoo','dolibarr') then return new; end if;
 if not (
  exists(select 1 from public.tenants t where t.id=new.tenant_id and t.slug='eurevector')
  or exists(select 1 from private.erp_dual_tenant_enrollments p
    where p.tenant_id=new.tenant_id and p.enabled=true)
 ) then return new; end if;
 if new.sync_direction='bidirectional' then
   raise exception 'erp_dual_bidirectional_sync_forbidden' using errcode='42501';
 end if;
 v_legacy:=coalesce(new.sync_settings->'source_of_truth','{}'::jsonb);
 if jsonb_typeof(v_legacy)='object' and exists(
   select 1 from jsonb_each_text(v_legacy) a
   where a.key in ('products','inventory','quotations','quotation_pdf',
    'sales_orders','invoices','payments','accounting','orders')
     and a.value<>'empresia'
 ) then
   raise exception 'erp_external_canonical_owner_forbidden' using errcode='42501';
 end if;
 return new;
end;
$$;
drop trigger if exists erp_dual_connection_authority_guard on public.erp_connections;
create trigger erp_dual_connection_authority_guard
 before insert or update on public.erp_connections for each row
 execute function private.erp_dual_guard_connection_authority();
revoke all on function private.erp_dual_guard_connection_authority()
 from public,anon,authenticated;

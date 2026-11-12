-- Disposable PostgreSQL 17 only. This fixture must never run against production.
create schema if not exists auth;
create schema if not exists private;
create role anon;
create role authenticated;

create or replace function auth.uid() returns uuid language sql stable
as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create or replace function private.crm_active_tenant_matches(id uuid)
returns boolean language sql stable as $$
 select id::text=nullif(current_setting('request.active_tenant',true),'') $$;
create or replace function private.has_tenant_role(id uuid,roles text[])
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.memberships
  where tenant_id=id and user_id=auth.uid() and role=any(roles)) $$;
create table public.tenants(id uuid primary key,slug text unique not null);
create table public.memberships(tenant_id uuid,user_id uuid,role text);
create table public.erp_connections(
 id uuid primary key,tenant_id uuid not null references public.tenants(id),
 provider text not null,status text not null default 'disconnected',
 sync_direction text default 'read_only',last_healthcheck_at timestamptz);
create table public.erp_sync_jobs(
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id),
 connection_id uuid references public.erp_connections(id),
 job_type text not null,entity_type text);
create table public.orders(
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.inventory_movements(
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id),
 created_at timestamptz not null default now());
create table public.customer_payments(
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id),
 created_at timestamptz not null default now());

grant usage on schema public,private,auth to authenticated,anon;
grant execute on function auth.uid() to authenticated;
grant execute on function private.has_tenant_role(uuid,text[]) to authenticated;
grant execute on function private.crm_active_tenant_matches(uuid) to authenticated;
alter table public.erp_connections enable row level security;
create policy erp_connections_tenant_reader on public.erp_connections
 for select to authenticated using
 (private.crm_active_tenant_matches(tenant_id)
  and private.has_tenant_role(tenant_id,array['owner','admin']::text[]));
grant select on public.erp_connections to authenticated;

insert into public.tenants(id,slug) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','eurevector'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','family-power');
insert into public.memberships(tenant_id,user_id,role) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','owner'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','owner');
insert into public.erp_connections(id,tenant_id,provider,status,syNC_direction,last_healthcheck_at) values
 ('aaaaaaaa-0000-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','odoo','connected','read_only',now()),
 ('aaaaaaaa-0000-4000-8000-000000000002','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','dolibarr','connected','read_only',now()),
 ('bbbbbbbb-0000-4000-8000-000000000001','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','odoo','connected','read_only',now());

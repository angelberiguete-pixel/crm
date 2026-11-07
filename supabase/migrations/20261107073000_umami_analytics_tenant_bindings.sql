-- Umami website bindings are approved by the platform operator, never self-registered
-- by a tenant. A single Umami website may not be mapped to multiple tenants.
insert into public.platform_modules (module_key,name,category,description,default_enabled,is_active)
values (
  'umami_analytics','Analítica web (Umami)','analytics',
  'Visitas y campañas de sitios web autorizados por empresa',false,true
)
on conflict (module_key) do update
set name=excluded.name, category=excluded.category,
    description=excluded.description, updated_at=now();

create table if not exists public.marketing_umami_websites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  umami_website_id uuid not null unique,
  site_name text not null check (length(btrim(site_name)) between 2 and 120),
  hostname text not null check (length(btrim(hostname)) between 3 and 253),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index if not exists marketing_umami_websites_tenant_idx
  on public.marketing_umami_websites(tenant_id);

alter table public.marketing_umami_websites enable row level security;
revoke all on public.marketing_umami_websites from anon, authenticated;
grant select, insert, update, delete on public.marketing_umami_websites to authenticated;

drop policy if exists marketing_umami_read on public.marketing_umami_websites;
create policy marketing_umami_read
  on public.marketing_umami_websites for select to authenticated
  using (
    private.crm_is_tenant_admin(tenant_id)
    or private.crm_is_platform_admin()
  );

drop policy if exists marketing_umami_platform_insert on public.marketing_umami_websites;
create policy marketing_umami_platform_insert
  on public.marketing_umami_websites for insert to authenticated
  with check (private.crm_is_platform_admin());

drop policy if exists marketing_umami_platform_update on public.marketing_umami_websites;
create policy marketing_umami_platform_update
  on public.marketing_umami_websites for update to authenticated
  using (private.crm_is_platform_admin())
  with check (private.crm_is_platform_admin());

drop policy if exists marketing_umami_platform_delete on public.marketing_umami_websites;
create policy marketing_umami_platform_delete
  on public.marketing_umami_websites for delete to authenticated
  using (private.crm_is_platform_admin());

comment on table public.marketing_umami_websites is
 'Platform-approved Umami website IDs; no API credentials, tracking payloads or cross-tenant access.';

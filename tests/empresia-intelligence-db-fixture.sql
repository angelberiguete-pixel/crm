-- Minimal PostgreSQL 17 test schema; no production connection, real credentials or customer data.
create schema if not exists auth;
create schema if not exists private;
create role authenticated;
create role anon;

create or replace function auth.uid()
returns uuid language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;

create table public.tenants (id uuid primary key, slug text not null unique);
create table public.memberships (tenant_id uuid not null references public.tenants(id),user_id uuid not null,role text not null,status text not null default 'active');

create or replace function private.has_tenant_role(p_tenant_id uuid,p_roles text[])
returns boolean language sql stable security definer set search_path=''
as $$
 select exists(select 1 from public.memberships m where m.tenant_id=p_tenant_id
  and m.user_id=auth.uid() and m.status='active' and m.role=any(p_roles))
$$;
create or replace function private.crm_active_tenant_matches(p_tenant_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
 select p_tenant_id::text=nullif(current_setting('request.active_tenant',true),'')
$$;
grant usage on schema public,auth,private to authenticated,anon;
grant execute on function auth.uid() to authenticated,anon;
grant execute on function private.has_tenant_role(uuid,text[]) to authenticated;
grant execute on function private.crm_active_tenant_matches(uuid) to authenticated;

create table public.contacts(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),
 company_id uuid,display_name text
);
create table public.opportunities(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),
 status text default 'open',stage_id uuid,contact_id uuid,company_id uuid
);
create table public.conversations(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),
 contact_id uuid,opportunity_id uuid
);
create table public.messages(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),
 conversation_id uuid not null references public.conversations(id),direction text,body text
);
create table public.quotations(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),
 status text default 'draft',contact_id uuid,company_id uuid,opportunity_id uuid
);
create table public.orders(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),
 status text default 'confirmed',contact_id uuid,company_id uuid,opportunity_id uuid
);
create table public.deliveries(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),
 status text default 'pending',delivered_at timestamptz,order_id uuid references public.orders(id)
);
create table public.customer_payments(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),
 status text default 'recorded',order_id uuid references public.orders(id)
);
create table public.tasks(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),
 title text,description text,status text,priority text,due_at timestamptz,completed_at timestamptz,
 assigned_user_id uuid,contact_id uuid,company_id uuid,opportunity_id uuid,
 source text,metadata jsonb,created_by uuid
);
create table public.products(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),
 name text,sku text,status text,sale_price numeric,currency text,metadata jsonb,
 updated_at timestamptz default now()
);
grant select,update on public.tasks to authenticated;

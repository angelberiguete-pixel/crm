-- STAGING ONLY: review and apply in isolated Supabase development environment.
-- No production changes have been made by committing this file.
create extension if not exists pgcrypto;

create table if not exists public.fiscal_profiles (
 tenant_id uuid primary key references public.tenants(id) on delete restrict,
 legal_name text not null,
 rnc text not null,
 fiscal_address text,
 provider_id text,
 readiness_status text not null default 'unconfigured'
   check (readiness_status in ('unconfigured','testing','ready')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.fiscal_invoices (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id) on delete restrict,
 quote_id uuid,
 document_type text not null check (document_type in ('E31','E32','E33','E34','E41','E43','E44','E45','E46','E47')),
 status text not null default 'draft'
   check (status in ('draft','pending_approval','approved','submitting','submitted','accepted','rejected','requires_review','cancelled_draft')),
 buyer_name text,
 buyer_rnc text,
 currency text not null default 'DOP' check (currency='DOP'),
 subtotal numeric(18,2) not null default 0 check (subtotal>=0),
 tax_total numeric(18,2) not null default 0 check (tax_total>=0),
 total numeric(18,2) not null default 0 check (total>=0),
 ecf_number text,
 provider_reference text,
 idempotency_key uuid not null default gen_random_uuid(),
 created_by uuid not null default auth.uid(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (tenant_id,idempotency_key),
 unique (tenant_id,id),
 unique (tenant_id,ecf_number)
);
create index if not exists fiscal_invoices_tenant_created_idx on public.fiscal_invoices(tenant_id,created_at desc);
create table if not exists public.fiscal_invoice_lines (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null,
 invoice_id uuid not null,
 description text not null,
 quantity numeric(18,4) not null check(quantity>0),
 unit_price numeric(18,4) not null check(unit_price>=0),
 discount numeric(18,2) not null default 0 check(discount>=0),
 itbis_rate numeric(7,4) not null default 0 check(itbis_rate>=0 and itbis_rate<=1),
 foreign key (tenant_id,invoice_id) references public.fiscal_invoices(tenant_id,id) on delete restrict
);
create table if not exists public.fiscal_events (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null,
 invoice_id uuid not null,
 event_type text not null,
 provider_reference text,
 payload jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 foreign key (tenant_id,invoice_id) references public.fiscal_invoices(tenant_id,id) on delete restrict
);
create index if not exists fiscal_events_invoice_idx on public.fiscal_events(tenant_id,invoice_id,created_at desc);

alter table public.fiscal_profiles enable row level security;
alter table public.fiscal_invoices enable row level security;
alter table public.fiscal_invoice_lines enable row level security;
alter table public.fiscal_events enable row level security;

-- Membership checks are based on authenticated users and active memberships.
create policy fiscal_profiles_read on public.fiscal_profiles for select to authenticated
 using (exists(select 1 from public.memberships m where m.tenant_id=fiscal_profiles.tenant_id and m.user_id=(select auth.uid()) and m.status='active'));
create policy fiscal_invoices_read on public.fiscal_invoices for select to authenticated
 using (exists(select 1 from public.memberships m where m.tenant_id=fiscal_invoices.tenant_id and m.user_id=(select auth.uid()) and m.status='active'));
create policy fiscal_invoices_insert_draft on public.fiscal_invoices for insert to authenticated
 with check (status='draft' and created_by=(select auth.uid()) and exists(
 select 1 from public.memberships m where m.tenant_id=fiscal_invoices.tenant_id and m.user_id=(select auth.uid()) and m.status='active' and m.role in ('owner','admin')));
create policy fiscal_lines_read on public.fiscal_invoice_lines for select to authenticated
 using (exists(select 1 from public.memberships m where m.tenant_id=fiscal_invoice_lines.tenant_id and m.user_id=(select auth.uid()) and m.status='active'));
create policy fiscal_events_read on public.fiscal_events for select to authenticated
 using (exists(select 1 from public.memberships m where m.tenant_id=fiscal_events.tenant_id and m.user_id=(select auth.uid()) and m.status='active'));
-- No client-side UPDATE/DELETE on invoices; no INSERT/UPDATE/DELETE on events.
-- No public fiscal profile writes until a server-validated configuration workflow is built.
-- Before rollout: verify membership RLS, role values, and security tests using two separate tenant users.

-- Atomic creation of one-line E32 draft. Never issues a fiscal document.
create policy fiscal_lines_insert_draft on public.fiscal_invoice_lines for insert to authenticated
 with check (exists(
 select 1 from public.fiscal_invoices i join public.memberships m on m.tenant_id=i.tenant_id
 where i.id=fiscal_invoice_lines.invoice_id and i.tenant_id=fiscal_invoice_lines.tenant_id
 and i.status='draft' and i.created_by=(select auth.uid())
 and m.user_id=(select auth.uid()) and m.status='active' and m.role in ('owner','admin')));

create or replace function public.fiscal_create_demo_draft(
 p_tenant_id uuid, p_buyer_name text, p_description text, p_unit_price numeric
) returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare v_id uuid; v_base numeric(18,2); v_tax numeric(18,2);
begin
 if auth.uid() is null or not exists (
  select 1 from public.memberships m where m.tenant_id=p_tenant_id
  and m.user_id=auth.uid() and m.status='active' and m.role in ('owner','admin')
 ) then raise exception 'Not authorized'; end if;
 if length(trim(coalesce(p_description,''))) < 2 or length(p_description)>250
    or p_unit_price is null or p_unit_price <= 0 or p_unit_price > 999999999
 then raise exception 'Invalid draft'; end if;
 v_base:=round(p_unit_price,2);v_tax:=round(v_base*0.18,2);
 insert into public.fiscal_invoices(tenant_id,document_type,status,buyer_name,currency,subtotal,tax_total,total,created_by)
 values(p_tenant_id,'E32','draft',nullif(trim(p_buyer_name),''),'DOP',v_base,v_tax,v_base+v_tax,auth.uid())
 returning id into v_id;
 insert into public.fiscal_invoice_lines(tenant_id,invoice_id,description,quantity,unit_price,discount,itbis_rate)
 values(p_tenant_id,v_id,trim(p_description),1,p_unit_price,0,0.18);
 return v_id;
end;
$$;
revoke all on function public.fiscal_create_demo_draft(uuid,text,text,numeric) from public, anon;
grant execute on function public.fiscal_create_demo_draft(uuid,text,text,numeric) to authenticated;

-- Register as disabled by default. Activation requires deliberate admin action after migration and QA.
insert into public.platform_modules(module_key,name,category,description,default_enabled,is_active)
values('fiscal_ecf','Facturación electrónica','erp','Borradores fiscales RD; sin emisión real',false,true)
on conflict (module_key) do nothing;

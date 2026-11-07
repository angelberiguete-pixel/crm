-- Ángel Commerce: run on a dedicated Supabase project, NEVER on another tenant's project.
create extension if not exists pgcrypto;
create table if not exists public.commerce_roles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 role text not null check (role in ('admin'))
);
create table if not exists public.commerce_products (
 id uuid primary key default gen_random_uuid(),
 slug text unique not null,
 name text not null,
 description text not null default '',
 category text not null check(category in ('servicio','digital','curso','fisico','membresia')),
 price_cents integer not null check(price_cents>=100 and price_cents<=200000000),
 currency text not null default 'USD' check(currency in ('USD','EUR')),
 published boolean not null default false,
 asset_path text,
 stock_qty integer not null default 0 check(stock_qty>=0),
 delivery_note text,
 cover_url text,
 created_by uuid references auth.users(id),
 created_at timestamptz not null default now()
);
create table if not exists public.commerce_orders (
 id uuid primary key default gen_random_uuid(),
 buyer_id uuid references auth.users(id),
 buyer_name text,
 buyer_email text,
 guest_token_hash text,
 product_id uuid not null references public.commerce_products(id),
 status text not null default 'pending' check(status in ('pending','paid','refunded','cancelled')),
 amount_cents integer not null check(amount_cents>0),
 currency text not null check(currency in ('USD','EUR')),
 paypal_order_id text unique,
 capture_id text unique,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.commerce_entitlements (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null unique references public.commerce_orders(id),
 buyer_id uuid references auth.users(id),
 product_id uuid not null references public.commerce_products(id),
 status text not null default 'active' check(status in ('active','revoked')),
 created_at timestamptz not null default now()
);
create table if not exists public.commerce_webhook_events (
 id text primary key,
 event_type text not null,
 processed boolean not null default false,
 created_at timestamptz not null default now()
);
create table if not exists public.commerce_service_briefs (
 order_id uuid primary key references public.commerce_orders(id),
 buyer_id uuid not null references auth.users(id),
 details jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create table if not exists public.commerce_lessons (
 id uuid primary key default gen_random_uuid(),
 product_id uuid not null references public.commerce_products(id),
 title text not null,
 position integer not null default 0,
 asset_path text not null,
 created_at timestamptz not null default now()
);
create table if not exists public.commerce_shipments (
 order_id uuid primary key references public.commerce_orders(id),
 buyer_id uuid not null references auth.users(id),
 status text not null default 'pending',
 tracking_code text,
 updated_at timestamptz not null default now()
);
alter table public.commerce_roles enable row level security;
alter table public.commerce_products enable row level security;
alter table public.commerce_orders enable row level security;
alter table public.commerce_entitlements enable row level security;
alter table public.commerce_webhook_events enable row level security;
alter table public.commerce_service_briefs enable row level security;
alter table public.commerce_lessons enable row level security;
alter table public.commerce_shipments enable row level security;
drop policy if exists commerce_products_public on public.commerce_products;
create policy commerce_products_public on public.commerce_products for select to anon,authenticated using(published=true);
drop policy if exists commerce_roles_self on public.commerce_roles;
create policy commerce_roles_self on public.commerce_roles for select to authenticated using(user_id=(select auth.uid()));
drop policy if exists commerce_orders_self on public.commerce_orders;
create policy commerce_orders_self on public.commerce_orders for select to authenticated using(buyer_id=(select auth.uid()));
drop policy if exists commerce_entitlements_self on public.commerce_entitlements;
create policy commerce_entitlements_self on public.commerce_entitlements for select to authenticated using(buyer_id=(select auth.uid()));
drop policy if exists commerce_service_briefs_self on public.commerce_service_briefs;
create policy commerce_service_briefs_self on public.commerce_service_briefs for select to authenticated using(buyer_id=(select auth.uid()));
drop policy if exists commerce_shipments_self on public.commerce_shipments;
create policy commerce_shipments_self on public.commerce_shipments for select to authenticated using(buyer_id=(select auth.uid()));
-- Lessons are private; only the server returns signed URLs after entitlement checks.
revoke all on public.commerce_webhook_events from anon,authenticated;
revoke all on public.commerce_lessons from anon,authenticated;
grant select on public.commerce_products to anon,authenticated;
grant select on public.commerce_orders,public.commerce_entitlements,public.commerce_roles,public.commerce_service_briefs,public.commerce_shipments to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('commerce-private','commerce-private',false,52428800,array['application/pdf','video/mp4'])
 on conflict(id) do nothing;
-- No client storage policies: privileged server creates signed links after verifying paid entitlement.
-- Assign the first admin only AFTER signup, by a trusted DB administrator:
-- insert into public.commerce_roles(user_id,role) values ('USER_UUID_FROM_AUTH_USERS','admin');

-- Upgrade path for projects created before guest checkout.
alter table public.commerce_orders alter column buyer_id drop not null;
alter table public.commerce_orders add column if not exists buyer_name text;
alter table public.commerce_orders add column if not exists buyer_email text;
alter table public.commerce_orders add column if not exists guest_token_hash text;
alter table public.commerce_entitlements alter column buyer_id drop not null;
create index if not exists commerce_orders_email_idx on public.commerce_orders (buyer_email);
-- Guests are identified only through a server-managed HttpOnly token.
-- No anon policies allow reading or changing orders or entitlements.

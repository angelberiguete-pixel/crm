-- Empresia merchant checkout, separate from each customer's payment gateway.
-- No offers are published and no PayPal charges are created by this migration.
-- Buyer identity comes from Supabase Auth, never from the request body.
create table if not exists public.empresia_offers (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check(slug ~ '^[a-z0-9][a-z0-9-]{2,70}$'),
  title text not null check(length(title) between 3 and 120),
  description text not null default '' check(length(description)<=1500),
  kind text not null check(kind in ('one_time','monthly')),
  usd_price_cents bigint not null check(usd_price_cents between 100 and 100000000),
  fulfillment text not null default 'assisted' check(fulfillment in ('assisted','entitlement')),
  paypal_product_id text,
  paypal_plan_id text unique,
  status text not null default 'draft' check(status in ('draft','published','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint empresia_monthly_plan_before_publish check(
    status<>'published' or kind='one_time' or paypal_plan_id is not null
  )
);
alter table public.empresia_offers enable row level security;
revoke all on public.empresia_offers from public, anon, authenticated;
grant select on public.empresia_offers to anon,authenticated;
grant insert,update on public.empresia_offers to authenticated;
drop policy if exists empresia_offers_read on public.empresia_offers;
create policy empresia_offers_read on public.empresia_offers for select
 to anon,authenticated using (
   status='published' or (select auth.uid()) is not null and private.crm_is_platform_owner()
 );
drop policy if exists empresia_offers_create on public.empresia_offers;
create policy empresia_offers_create on public.empresia_offers for insert
 to authenticated with check(private.crm_is_platform_owner());
drop policy if exists empresia_offers_update on public.empresia_offers;
create policy empresia_offers_update on public.empresia_offers for update
 to authenticated using(private.crm_is_platform_owner())
 with check(private.crm_is_platform_owner());

create table if not exists public.empresia_checkout_orders (
  id uuid primary key default gen_random_uuid(),
  seller_tenant_id uuid not null references public.tenants(id),
  offer_id uuid not null references public.empresia_offers(id),
  buyer_id uuid not null references auth.users(id),
  buyer_email text not null check(length(buyer_email)<=320),
  kind text not null check(kind in ('one_time','monthly')),
  currency text not null default 'USD' check(currency='USD'),
  amount_cents bigint not null check(amount_cents>0),
  status text not null default 'created' check(status in (
    'created','awaiting_approval','paid','active','suspended','cancelled','failed'
  )),
  paypal_order_id text unique,
  paypal_capture_id text unique,
  paypal_subscription_id text unique,
  approval_url text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists empresia_checkout_orders_buyer_idx
 on public.empresia_checkout_orders(buyer_id,created_at desc);
create index if not exists empresia_checkout_orders_seller_idx
 on public.empresia_checkout_orders(seller_tenant_id,created_at desc);
alter table public.empresia_checkout_orders enable row level security;
revoke all on public.empresia_checkout_orders from public,anon,authenticated;
grant select on public.empresia_checkout_orders to authenticated;
drop policy if exists empresia_checkout_orders_read on public.empresia_checkout_orders;
create policy empresia_checkout_orders_read on public.empresia_checkout_orders
 for select to authenticated using (
  buyer_id=(select auth.uid()) or private.crm_is_platform_owner()
 );

create table if not exists public.empresia_entitlements(
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null unique references public.empresia_checkout_orders(id) on delete cascade,
 offer_id uuid not null references public.empresia_offers(id),
 buyer_id uuid not null references auth.users(id),
 status text not null check(status in ('active','provisioning','suspended','revoked')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists empresia_entitlements_buyer_idx
 on public.empresia_entitlements(buyer_id,status);
alter table public.empresia_entitlements enable row level security;
revoke all on public.empresia_entitlements from public,anon,authenticated;
grant select on public.empresia_entitlements to authenticated;
drop policy if exists empresia_entitlements_read on public.empresia_entitlements;
create policy empresia_entitlements_read on public.empresia_entitlements
 for select to authenticated using(
 buyer_id=(select auth.uid()) or private.crm_is_platform_owner()
 );

-- Billing records for recurring payments are unique by verified sale ID.
create table if not exists public.empresia_subscription_sales(
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.empresia_checkout_orders(id) on delete cascade,
 paypal_sale_id text not null unique,
 amount_cents bigint not null check(amount_cents>0),
 currency text not null default 'USD' check(currency='USD'),
 paid_at timestamptz not null default now()
);
alter table public.empresia_subscription_sales enable row level security;
revoke all on public.empresia_subscription_sales from public,anon,authenticated;
grant select on public.empresia_subscription_sales to authenticated;
drop policy if exists empresia_subscription_sales_read on public.empresia_subscription_sales;
create policy empresia_subscription_sales_read on public.empresia_subscription_sales
 for select to authenticated using(
  exists(select 1 from public.empresia_checkout_orders o where o.id=order_id
   and (o.buyer_id=(select auth.uid()) or private.crm_is_platform_owner()))
 );

-- Service-role-only receipt reconciler. External PayPal API is verified upstream.
create or replace function public.empresia_confirm_checkout_capture(
 p_order_id uuid,p_paypal_order_id text,p_capture_id text,p_cents bigint
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_order public.empresia_checkout_orders%rowtype;
        v_offer public.empresia_offers%rowtype;
        v_invoice uuid;
begin
 if p_order_id is null or p_paypal_order_id is null
    or length(p_capture_id)<6 or p_cents<=0 then
    raise exception 'Invalid verified payment evidence';
 end if;
 select * into v_order from public.empresia_checkout_orders
  where id=p_order_id for update;
 if not found then return jsonb_build_object('status','not_tracked'); end if;
 if v_order.kind<>'one_time'
   or v_order.paypal_order_id is distinct from p_paypal_order_id
   or v_order.amount_cents<>p_cents then
   raise exception 'PayPal captured data does not match the recorded order';
 end if;
 if v_order.status='paid' then
   return jsonb_build_object('status','already_paid','order_id',v_order.id);
 end if;
 if v_order.status not in ('awaiting_approval','created') then
   return jsonb_build_object('status','manual_review');
 end if;
 select * into v_offer from public.empresia_offers where id=v_order.offer_id;
 insert into public.billing_invoices(
   tenant_id,provider,provider_invoice_id,invoice_number,currency,
   subtotal_cents,tax_cents,total_cents,amount_paid_cents,amount_due_cents,
   status,paid_at,metadata
 ) values(
   v_order.seller_tenant_id,'paypal_order','ORDER-'||p_paypal_order_id,
   'EMP-'||left(v_order.id::text,8),'USD',
   v_order.amount_cents,0,v_order.amount_cents,v_order.amount_cents,0,
   'paid',now(),jsonb_build_object('billing_stage','empresia_sale',
      'checkout_order_id',v_order.id,'offer_id',v_order.offer_id,
      'paypal_capture_id',p_capture_id)
 ) on conflict(provider,provider_invoice_id) do nothing returning id into v_invoice;
 if v_invoice is null then
   raise exception 'PayPal order was already assigned to a different sale';
 end if;
 insert into public.billing_payments(
   tenant_id,invoice_id,provider,provider_payment_id,currency,amount_cents,
   status,paid_at,metadata
 ) values(
   v_order.seller_tenant_id,v_invoice,'paypal',p_capture_id,'USD',
   v_order.amount_cents,'succeeded',now(),
   jsonb_build_object('empresia_order_id',v_order.id)
 );
 update public.empresia_checkout_orders set status='paid',
   paypal_capture_id=p_capture_id,verified_at=now(),updated_at=now(),
   approval_url=null where id=v_order.id;
 insert into public.empresia_entitlements(order_id,offer_id,buyer_id,status)
 values (v_order.id,v_order.offer_id,v_order.buyer_id,
   case when v_offer.fulfillment='entitlement' then 'active' else 'provisioning' end)
 on conflict(order_id) do nothing;
 return jsonb_build_object('status','paid','order_id',v_order.id);
end $$;
revoke all on function public.empresia_confirm_checkout_capture(uuid,text,text,bigint)
 from public,anon,authenticated;
grant execute on function public.empresia_confirm_checkout_capture(uuid,text,text,bigint)
 to service_role;

-- Verified monthly state and entitlement; only PayPal ACTIVE counts.
create or replace function public.empresia_confirm_subscription_state(
 p_subscription_id text,p_paypal_state text
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_order public.empresia_checkout_orders%rowtype;
        v_offer public.empresia_offers%rowtype;
        v_state text;
begin
 if p_subscription_id is null or p_paypal_state not in (
   'ACTIVE','CANCELLED','SUSPENDED','EXPIRED','APPROVAL_PENDING'
 ) then raise exception 'Invalid subscription evidence'; end if;
 select * into v_order from public.empresia_checkout_orders
   where paypal_subscription_id=p_subscription_id and kind='monthly' for update;
 if not found then return jsonb_build_object('status','not_tracked'); end if;
 if v_order.status='cancelled' and p_paypal_state in ('ACTIVE','APPROVAL_PENDING') then
   return jsonb_build_object('status','manual_review');
 end if;
 select * into v_offer from public.empresia_offers where id=v_order.offer_id;
 if p_paypal_state='ACTIVE' then v_state:='active';
 elsif p_paypal_state='APPROVAL_PENDING' then v_state:='awaiting_approval';
 elsif p_paypal_state='SUSPENDED' then v_state:='suspended';
 else v_state:='cancelled'; end if;
 update public.empresia_checkout_orders set status=v_state,
   verified_at=case when p_paypal_state='ACTIVE' then now() else verified_at end,
   approval_url=case when v_state='awaiting_approval' then approval_url else null end,
   updated_at=now() where id=v_order.id;
 if p_paypal_state='ACTIVE' then
   insert into public.empresia_entitlements(order_id,offer_id,buyer_id,status)
   values(v_order.id,v_order.offer_id,v_order.buyer_id,
     case when v_offer.fulfillment='entitlement' then 'active' else 'provisioning' end)
   on conflict(order_id) do update set status=
     case when v_offer.fulfillment='entitlement' then 'active' else 'provisioning' end,
     updated_at=now();
 elsif v_state in ('cancelled','suspended') then
   update public.empresia_entitlements set
     status=case when v_state='cancelled' then 'revoked' else 'suspended' end,
     updated_at=now() where order_id=v_order.id;
 end if;
 return jsonb_build_object('status',v_state,'order_id',v_order.id);
end $$;
revoke all on function public.empresia_confirm_subscription_state(text,text)
 from public,anon,authenticated;
grant execute on function public.empresia_confirm_subscription_state(text,text) to service_role;

create or replace function public.empresia_confirm_subscription_sale(
 p_subscription_id text,p_sale_id text,p_cents bigint
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_order public.empresia_checkout_orders%rowtype;
        v_invoice uuid;v_sale uuid;
begin
 if length(coalesce(p_sale_id,''))<6 or p_cents<=0 then
   raise exception 'Invalid recurring sale data'; end if;
 select * into v_order from public.empresia_checkout_orders
  where paypal_subscription_id=p_subscription_id and kind='monthly' for update;
 if not found then return jsonb_build_object('status','not_tracked'); end if;
 if v_order.status<>'active' or v_order.amount_cents<>p_cents then
   return jsonb_build_object('status','manual_review'); end if;
 insert into public.empresia_subscription_sales(order_id,paypal_sale_id,amount_cents)
 values(v_order.id,p_sale_id,p_cents)
 on conflict(paypal_sale_id) do nothing returning id into v_sale;
 if v_sale is null then return jsonb_build_object('status','already_recorded'); end if;
 insert into public.billing_invoices(
  tenant_id,provider,provider_invoice_id,invoice_number,currency,
  subtotal_cents,tax_cents,total_cents,amount_paid_cents,amount_due_cents,
  status,paid_at,metadata
 ) values(
  v_order.seller_tenant_id,'paypal_sale','SALE-'||p_sale_id,
  'EMP-SUB-'||left(v_order.id::text,8),'USD',
  p_cents,0,p_cents,p_cents,0,'paid',now(),
  jsonb_build_object('billing_stage','empresia_monthly',
     'checkout_order_id',v_order.id,'offer_id',v_order.offer_id)
 ) returning id into v_invoice;
 insert into public.billing_payments(
  tenant_id,invoice_id,provider,provider_payment_id,currency,
  amount_cents,status,paid_at
 ) values(v_order.seller_tenant_id,v_invoice,'paypal',p_sale_id,
  'USD',p_cents,'succeeded',now());
 return jsonb_build_object('status','paid','order_id',v_order.id);
end $$;
revoke all on function public.empresia_confirm_subscription_sale(text,text,bigint)
 from public,anon,authenticated;
grant execute on function public.empresia_confirm_subscription_sale(text,text,bigint)
 to service_role;

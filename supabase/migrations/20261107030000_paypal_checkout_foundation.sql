-- PayPal sandbox-first CRM checkout ledger.
-- Do not apply to production until the application and RLS tests pass.
-- Monetary amounts are always captured in integer minor units.

create table public.crm_paypal_checkouts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  requested_by uuid not null references auth.users(id),
  currency text not null check (currency in ('USD','EUR','GBP','CAD','AUD')),
  amount_minor bigint not null check (amount_minor > 0 and amount_minor <= 10000000),
  status text not null default 'draft' check (status in ('draft','created','pending','completed','denied','reversed')),
  paypal_order_id text unique,
  paypal_capture_id text unique,
  approval_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  unique(order_id)
);
create index crm_paypal_checkouts_tenant_idx on public.crm_paypal_checkouts(tenant_id,created_at desc);
alter table public.crm_paypal_checkouts enable row level security;
revoke all on public.crm_paypal_checkouts from public,anon,authenticated;
grant select on public.crm_paypal_checkouts to authenticated;
create policy crm_paypal_checkout_admin_select on public.crm_paypal_checkouts
for select to authenticated using (private.crm_is_tenant_admin(tenant_id));

-- Service-only event and ERP outbox ledgers. No Data API access for clients.
create table public.crm_paypal_webhook_events (
  event_id text primary key,
  checkout_id uuid not null references public.crm_paypal_checkouts(id),
  event_type text not null,
  capture_id text,
  received_at timestamptz not null default now()
);
create table public.crm_paypal_erp_outbox (
  id uuid primary key default gen_random_uuid(),
  checkout_id uuid not null unique references public.crm_paypal_checkouts(id),
  tenant_id uuid not null references public.tenants(id),
  provider text not null default 'dolibarr',
  event_type text not null default 'paypal.payment.completed',
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  status text not null default 'pending' check (status in ('pending','processing','synced','failed')),
  attempts int not null default 0 check (attempts >= 0),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index crm_paypal_erp_outbox_pending_idx on public.crm_paypal_erp_outbox(status,created_at) where status in ('pending','failed');
alter table public.crm_paypal_webhook_events enable row level security;
alter table public.crm_paypal_erp_outbox enable row level security;
revoke all on public.crm_paypal_webhook_events from public,anon,authenticated;
revoke all on public.crm_paypal_erp_outbox from public,anon,authenticated;
grant all on public.crm_paypal_checkouts,public.crm_paypal_webhook_events,public.crm_paypal_erp_outbox to service_role;

-- Only an active tenant admin can create a checkout. The amount is
-- recomputed server-side from the confirmed order, never supplied by the browser.
create or replace function public.crm_paypal_prepare_order(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare
 v_order public.orders%rowtype;
 v_checkout public.crm_paypal_checkouts%rowtype;
 v_amount numeric;
 v_minor bigint;
begin
 if auth.uid() is null then
   raise exception 'Authentication required' using errcode='42501';
 end if;
 select * into v_order from public.orders where id=p_order_id for update;
 if v_order.id is null then
   raise exception 'Order not found' using errcode='22023';
 end if;
 if not private.crm_is_tenant_admin(v_order.tenant_id) or
    not exists(select 1 from public.tenants where id=v_order.tenant_id and status='active') then
   raise exception 'Tenant admin required' using errcode='42501';
 end if;
 if v_order.status not in ('confirmed','in_production','quality_control','ready_for_delivery','out_for_delivery','delivered') then
   raise exception 'Order not eligible for checkout' using errcode='22023';
 end if;
 if v_order.currency not in ('USD','EUR','GBP','CAD','AUD') then
   raise exception 'PayPal unsupported currency. Convert explicitly before checkout.' using errcode='22023';
 end if;
 v_amount := v_order.total - v_order.amount_paid;
 if v_amount <= 0 or v_amount > 100000 or v_amount <> round(v_amount,2) then
   raise exception 'Invalid outstanding amount' using errcode='22023';
 end if;
 v_minor := (v_amount * 100)::bigint;
 select * into v_checkout from public.crm_paypal_checkouts where order_id=p_order_id for update;
 if v_checkout.id is not null then
   if v_checkout.currency <> v_order.currency or v_checkout.amount_minor <> v_minor then
     raise exception 'Existing checkout differs from order; reconcile manually' using errcode='22023';
   end if;
   if v_checkout.status in ('denied','reversed','completed') then
     raise exception 'Checkout finalized; reconcile or create a new order' using errcode='22023';
   end if;
 else
   insert into public.crm_paypal_checkouts(tenant_id,order_id,requested_by,currency,amount_minor)
   values(v_order.tenant_id,v_order.id,auth.uid(),v_order.currency,v_minor)
   returning * into v_checkout;
 end if;
 return jsonb_build_object(
   'id',v_checkout.id,
   'tenant_id',v_checkout.tenant_id,
   'order_id',v_checkout.order_id,
   'currency',v_checkout.currency,
   'amount_minor',v_checkout.amount_minor,
   'status',v_checkout.status,
   'paypal_order_id',v_checkout.paypal_order_id,
   'approval_url',v_checkout.approval_url
 );
end $fn$;
revoke all on function public.crm_paypal_prepare_order(uuid) from public,anon,authenticated;
grant execute on function public.crm_paypal_prepare_order(uuid) to authenticated;

-- Called only by the service-role webhook handler AFTER PayPal signature
-- verification, merchant ID validation and capture/order ID matching.
-- All mutations, including customer payment and ERP event, commit atomically.
create or replace function public.crm_paypal_apply_capture(
 p_event_id text,p_event_type text,p_order_id text,p_capture_id text,
 p_amount_minor bigint,p_currency text
) returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare
 v_checkout public.crm_paypal_checkouts%rowtype;
 v_changed boolean := false;
begin
 if nullif(btrim(p_event_id),'') is null or nullif(btrim(p_order_id),'') is null
    or nullif(btrim(p_capture_id),'') is null then
   raise exception 'Missing verified PayPal identifiers' using errcode='22023';
 end if;
 if p_event_type not in ('PAYMENT.CAPTURE.COMPLETED','PAYMENT.CAPTURE.PENDING','PAYMENT.CAPTURE.DENIED') then
   raise exception 'Unsupported payment event' using errcode='22023';
 end if;
 select * into v_checkout from public.crm_paypal_checkouts
 where paypal_order_id=p_order_id for update;
 if v_checkout.id is null then raise exception 'Unrecognized PayPal order' using errcode='22023'; end if;
 if v_checkout.amount_minor <> p_amount_minor or v_checkout.currency <> p_currency then
   raise exception 'PayPal amount/currency mismatch' using errcode='22023';
 end if;
 if v_checkout.paypal_capture_id is not null and v_checkout.paypal_capture_id<>p_capture_id then
   raise exception 'Capture mismatch' using errcode='22023';
 end if;
 insert into public.crm_paypal_webhook_events(event_id,checkout_id,event_type,capture_id)
 values(p_event_id,v_checkout.id,p_event_type,p_capture_id)
 on conflict(event_id) do nothing;
 if not found then
   return jsonb_build_object('duplicate',true,'checkout_id',v_checkout.id);
 end if;

 if p_event_type='PAYMENT.CAPTURE.COMPLETED' and v_checkout.status <> 'completed' then
   update public.orders
     set amount_paid=amount_paid + (p_amount_minor::numeric/100),updated_at=now()
   where id=v_checkout.order_id and tenant_id=v_checkout.tenant_id
     and currency=v_checkout.currency
     and total-amount_paid >= (p_amount_minor::numeric/100);
   if not found then
     raise exception 'Order balance changed; manual reconciliation required' using errcode='22023';
   end if;
   insert into public.customer_payments
     (tenant_id,order_id,amount,currency,payment_method,status,reference,received_at,recorded_by)
   values
     (v_checkout.tenant_id,v_checkout.order_id,p_amount_minor::numeric/100,p_currency,'paypal','confirmed',
      concat('paypal:',p_capture_id),now(),null);
   update public.crm_paypal_checkouts
     set status='completed',paypal_capture_id=p_capture_id,paid_at=now(),updated_at=now()
   where id=v_checkout.id;
   insert into public.crm_paypal_erp_outbox(checkout_id,tenant_id,payload)
   values(v_checkout.id,v_checkout.tenant_id,jsonb_build_object(
     'crm_order_id',v_checkout.order_id,'paypal_order_id',p_order_id,
     'paypal_capture_id',p_capture_id,'amount_minor',p_amount_minor,
     'currency',p_currency,'checkout_id',v_checkout.id))
   on conflict(checkout_id) do nothing;
   v_changed := true;
 elsif v_checkout.status <> 'completed' then
   update public.crm_paypal_checkouts
   set status=case when p_event_type='PAYMENT.CAPTURE.PENDING' then 'pending' else 'denied' end,
       paypal_capture_id=p_capture_id,updated_at=now()
   where id=v_checkout.id;
   v_changed := true;
 end if;
 return jsonb_build_object('duplicate',false,'updated',v_changed,'checkout_id',v_checkout.id);
end $fn$;
revoke all on function public.crm_paypal_apply_capture(text,text,text,text,bigint,text)
  from public,anon,authenticated;
grant execute on function public.crm_paypal_apply_capture(text,text,text,text,bigint,text)
  to service_role;

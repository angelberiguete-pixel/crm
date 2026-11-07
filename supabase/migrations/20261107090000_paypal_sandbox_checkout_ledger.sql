-- PAYPAL SANDBOX CHECKOUT: NOT APPLIED TO PRODUCTION.
-- Deliberately server-only ledger. Do not enable live PayPal or create this
-- schema in production without approving the data migration and E2E QA.
create table if not exists public.paypal_checkout_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  invoice_id uuid not null unique,
  paypal_order_id text not null unique,
  merchant_id text not null,
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null check (currency = 'USD'),
  approval_url text not null,
  status text not null default 'created'
    check (status in ('created','capture_requested','paid','failed','canceled','refunded','disputed')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint paypal_checkout_orders_same_tenant_invoice
    foreign key (tenant_id,invoice_id)
    references public.billing_invoices(tenant_id,id) on delete cascade
);
create index if not exists paypal_checkout_orders_tenant_status_idx
  on public.paypal_checkout_orders(tenant_id,status,created_at desc);

-- The authenticated/anon clients must never read write or guess another
-- tenant's checkout/order linkage. Server endpoints use the service role
-- only AFTER validating the current user's JWT and invoice RLS separately.
alter table public.paypal_checkout_orders enable row level security;
revoke all on public.paypal_checkout_orders from public, anon, authenticated;
grant select,insert,update on public.paypal_checkout_orders to service_role;

-- Atomic, idempotent completion: only a server with service_role JWT can
-- invoke after PayPal's signature postback verified SUCCESS.
create or replace function public.apply_verified_paypal_capture(
  p_order_id text,
  p_capture_id text,
  p_event_id text,
  p_merchant_id text,
  p_amount_cents bigint,
  p_currency text
)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_checkout public.paypal_checkout_orders%rowtype;
  v_invoice public.billing_invoices%rowtype;
  v_event_id uuid;
  v_payment_id uuid;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role'
  then raise exception 'PayPal server authentication required' using errcode='42501';
  end if;
  if p_order_id is null or length(p_order_id) > 48
    or p_capture_id is null or length(p_capture_id) > 128
    or p_event_id is null or length(p_event_id) > 128
    or p_merchant_id is null or length(p_merchant_id) > 128
    or p_amount_cents <= 0 or p_currency <> 'USD'
  then return 'invalid_capture'; end if;

  select * into v_checkout from public.paypal_checkout_orders
  where paypal_order_id = p_order_id for update;
  if not found then return 'unknown_order'; end if;

  select * into v_invoice from public.billing_invoices
  where id = v_checkout.invoice_id and tenant_id = v_checkout.tenant_id
  for update;
  if not found then return 'unknown_invoice'; end if;
  if v_checkout.merchant_id <> p_merchant_id
    or v_checkout.currency <> p_currency
    or v_checkout.amount_cents <> p_amount_cents
    or v_invoice.currency <> p_currency
    or v_invoice.amount_due_cents <> p_amount_cents
  then return 'capture_mismatch'; end if;
  if v_checkout.status = 'paid' or v_invoice.status = 'paid' then
    return 'already_paid';
  end if;
  if v_checkout.status not in ('created','capture_requested')
    or v_invoice.status <> 'open' then
    return 'not_payable';
  end if;

  insert into public.billing_events (
    tenant_id,provider,provider_event_id,event_type,processing_status,payload,processed_at
  ) values (
    v_checkout.tenant_id,'paypal',p_event_id,'PAYMENT.CAPTURE.COMPLETED',
    'processed',jsonb_build_object('order_id',p_order_id,'capture_id',p_capture_id),now()
  )
  on conflict (provider,provider_event_id) do nothing
  returning id into v_event_id;
  if v_event_id is null then return 'duplicate_event'; end if;

  insert into public.billing_payments (
    tenant_id,invoice_id,provider,provider_payment_id,amount_cents,
    currency,status,paid_at,metadata
  ) values (
    v_checkout.tenant_id,v_checkout.invoice_id,'paypal',p_capture_id,p_amount_cents,
    p_currency,'succeeded',now(),jsonb_build_object('paypal_order_id',p_order_id)
  )
  on conflict (provider,provider_payment_id) do nothing
  returning id into v_payment_id;
  if v_payment_id is null then
    -- Roll back the new event on a conflict (prevents inconsistencies).
    raise exception 'duplicate_capture_id' using errcode='23505';
  end if;

  update public.billing_invoices
  set status='paid',amount_due_cents=0,amount_paid_cents=total_cents,
      paid_at=now(),updated_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb) ||
        jsonb_build_object('paid_via','paypal','paypal_capture_id',p_capture_id)
  where id=v_checkout.invoice_id and tenant_id=v_checkout.tenant_id;

  update public.paypal_checkout_orders
  set status='paid',paid_at=now(),updated_at=now()
  where id=v_checkout.id;

  return 'recorded';
end;
$$;
revoke all on function public.apply_verified_paypal_capture(text,text,text,text,bigint,text)
  from public,anon,authenticated;
grant execute on function public.apply_verified_paypal_capture(text,text,text,text,bigint,text)
  to service_role;
comment on function public.apply_verified_paypal_capture(text,text,text,text,bigint,text)
  is 'Only after external PayPal signature verification and merchant/order/amount matching. Do not expose to tenant users.';

-- Shared CRM/ARM billing infrastructure: tenant-safe finance snapshots,
-- PayPal plan catalog and signed subscription event ledger. No charges are created.

create table if not exists public.billing_gateway_plans (
  id uuid primary key default gen_random_uuid(),
  plan_key text not null unique check (plan_key ~ '^[a-z0-9][a-z0-9_-]{2,100}$'),
  description text not null,
  provider text not null default 'paypal' check (provider='paypal'),
  currency text not null default 'USD' check (currency='USD'),
  amount_cents bigint not null check (amount_cents > 0),
  interval_unit text not null default 'MONTH' check (interval_unit='MONTH'),
  interval_count integer not null default 1 check (interval_count >= 1 and interval_count <= 12),
  provider_product_id text,
  provider_plan_id text unique,
  status text not null default 'pending' check (status in ('pending','provisioning','ready','disabled','error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.billing_gateway_plans enable row level security;
revoke all on public.billing_gateway_plans from public,anon,authenticated;
grant select on public.billing_gateway_plans to authenticated;
drop policy if exists billing_gateway_plans_platform_read on public.billing_gateway_plans;
create policy billing_gateway_plans_platform_read on public.billing_gateway_plans
  for select to authenticated using (private.crm_is_platform_owner());
insert into public.billing_gateway_plans(plan_key,description,amount_cents)
values('family-power-arm-usd80-month','Family Power ARM - soporte y licencia mensual',8000)
on conflict(plan_key) do nothing;

alter table public.tenant_subscriptions
  add column if not exists provider_plan_id text,
  add column if not exists provider_approval_url text,
  add column if not exists provider_approval_state text not null default 'not_requested';
alter table public.tenant_subscriptions
  drop constraint if exists tenant_subscriptions_provider_approval_state_check;
alter table public.tenant_subscriptions
  add constraint tenant_subscriptions_provider_approval_state_check
  check(provider_approval_state in ('not_requested','awaiting_buyer','approved','rejected','cancelled'));

create table if not exists public.billing_provider_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  subscription_id uuid references public.tenant_subscriptions(id) on delete set null,
  provider text not null default 'paypal' check(provider='paypal'),
  provider_event_id text not null unique,
  provider_subscription_id text,
  event_type text not null,
  amount_cents bigint check(amount_cents >= 0),
  currency text,
  occurred_at timestamptz,
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint billing_provider_events_type_len check(length(event_type) <= 120),
  constraint billing_provider_events_id_len check(length(provider_event_id) <= 190)
);
create index if not exists billing_provider_events_tenant_idx
  on public.billing_provider_events(tenant_id,created_at desc);
alter table public.billing_provider_events enable row level security;
revoke all on public.billing_provider_events from public,anon,authenticated;
grant select on public.billing_provider_events to authenticated;
drop policy if exists billing_provider_events_read on public.billing_provider_events;
create policy billing_provider_events_read on public.billing_provider_events
  for select to authenticated using (
    private.crm_is_platform_owner()
    or (private.is_tenant_admin(tenant_id) and private.crm_active_tenant_matches(tenant_id))
  );

-- A server-only function for already-verified PayPal subscription notifications.
-- This does NOT credit payment or create a recurring mandate. It logs events idempotently.
create or replace function public.crm_record_verified_billing_event(
  p_event_id text,
  p_event_type text,
  p_provider_subscription_id text,
  p_amount_cents bigint default null,
  p_currency text default null,
  p_occurred_at timestamptz default null
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_sub public.tenant_subscriptions%rowtype; v_event_id uuid;
begin
  if p_event_id is null or length(p_event_id)<5 or length(p_event_id)>190
     or p_event_type not in (
       'BILLING.SUBSCRIPTION.ACTIVATED','BILLING.SUBSCRIPTION.CANCELLED',
       'BILLING.SUBSCRIPTION.SUSPENDED','BILLING.SUBSCRIPTION.EXPIRED',
       'BILLING.SUBSCRIPTION.PAYMENT.FAILED','PAYMENT.SALE.COMPLETED')
     or p_provider_subscription_id is null or length(p_provider_subscription_id)<8 then
    raise exception 'Invalid billing event';
  end if;
  select * into v_sub from public.tenant_subscriptions
  where provider='paypal' and provider_subscription_id=p_provider_subscription_id
  for update;
  if not found then
    return jsonb_build_object('status','unknown_subscription');
  end if;
  insert into public.billing_provider_events(
     tenant_id,subscription_id,provider_event_id,provider_subscription_id,
     event_type,amount_cents,currency,occurred_at
  ) values(
     v_sub.tenant_id,v_sub.id,p_event_id,p_provider_subscription_id,
     p_event_type,p_amount_cents,p_currency,p_occurred_at
  ) on conflict(provider_event_id) do nothing returning id into v_event_id;
  if v_event_id is null then return jsonb_build_object('status','already_processed'); end if;
  -- Never activate merely on a CREATED event or a redirect.
  -- The webhook is validated upstream and PayPal subscription details must be checked there.
  if p_event_type='BILLING.SUBSCRIPTION.ACTIVATED' then
    update public.tenant_subscriptions
    set provider_approval_state='approved',provider_approval_url=null,
        status='active',updated_at=now() where id=v_sub.id;
  elsif p_event_type in ('BILLING.SUBSCRIPTION.CANCELLED','BILLING.SUBSCRIPTION.EXPIRED') then
    update public.tenant_subscriptions
    set provider_approval_state='cancelled', status='cancelled', updated_at=now()
    where id=v_sub.id;
  elsif p_event_type in ('BILLING.SUBSCRIPTION.SUSPENDED','BILLING.SUBSCRIPTION.PAYMENT.FAILED') then
    update public.tenant_subscriptions
    set status='past_due',updated_at=now() where id=v_sub.id;
  end if;
  return jsonb_build_object('status','recorded','event_id',v_event_id);
end $$;
revoke all on function public.crm_record_verified_billing_event(text,text,text,bigint,text,timestamptz) from public,anon,authenticated;
grant execute on function public.crm_record_verified_billing_event(text,text,text,bigint,text,timestamptz) to service_role;

-- Platform-owner scope (NULL) or tenant administrator scope (specific UUID).
-- Every amount is USD cents; invoice revenue is recognized here only once verified.
create or replace function public.crm_billing_financial_snapshot(p_tenant_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare
  v_received bigint:=0;v_pending bigint:=0;v_overdue bigint:=0;
  v_paid_count bigint:=0;v_open_count bigint:=0;v_overdue_count bigint:=0;
  v_active_count bigint:=0;v_manual_count bigint:=0;v_failed_count bigint:=0;
  v_series jsonb:='[]'::jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign-in required' using errcode='42501';
  end if;
  if p_tenant_id is null then
    if not private.crm_is_platform_owner() then
      raise exception 'Platform owner required' using errcode='42501';
    end if;
  elsif not (private.is_tenant_admin(p_tenant_id) and private.crm_active_tenant_matches(p_tenant_id)) then
    raise exception 'Tenant admin required' using errcode='42501';
  end if;

  select
    coalesce(sum(i.amount_paid_cents),0)::bigint,
    coalesce(sum(case when i.status='open' then i.amount_due_cents else 0 end),0)::bigint,
    coalesce(sum(case when i.status='open' and i.due_at<now() then i.amount_due_cents else 0 end),0)::bigint,
    count(*) filter(where i.status='paid')::bigint,
    count(*) filter(where i.status='open' and i.amount_due_cents>0)::bigint,
    count(*) filter(where i.status='open' and i.amount_due_cents>0 and i.due_at<now())::bigint
  into v_received,v_pending,v_overdue,v_paid_count,v_open_count,v_overdue_count
  from public.billing_invoices i
  where i.currency='USD' and (p_tenant_id is null or i.tenant_id=p_tenant_id)
    and i.status not in ('void','uncollectible');

  select count(*) filter(where provider='paypal' and provider_subscription_id is not null and status='active'),
         count(*) filter(where provider_subscription_id is null and coalesce(custom_monthly_price_cents,0)>0 and status in ('active','trialing'))
  into v_active_count,v_manual_count from public.tenant_subscriptions
  where p_tenant_id is null or tenant_id=p_tenant_id;

  select count(*) into v_failed_count from public.billing_provider_events
  where event_type='BILLING.SUBSCRIPTION.PAYMENT.FAILED'
    and (p_tenant_id is null or tenant_id=p_tenant_id);

  select coalesce(jsonb_agg(jsonb_build_object('month',s.month_key,
    'collected_cents',s.collected_cents) order by s.month_key),'[]'::jsonb)
  into v_series
  from (
    select to_char(m.month_start,'YYYY-MM') as month_key,
      coalesce(sum(i.amount_paid_cents) filter(where i.status='paid'),0)::bigint collected_cents
    from generate_series(
      date_trunc('month', now()) - interval '5 months',
      date_trunc('month', now()), interval '1 month'
    ) as m(month_start)
    left join public.billing_invoices i
      on i.paid_at>=m.month_start and i.paid_at<m.month_start+interval '1 month'
      and i.currency='USD'
      and (p_tenant_id is null or i.tenant_id=p_tenant_id)
    group by m.month_start
  ) s;

  return jsonb_build_object('currency','USD','received_cents',v_received,
    'pending_cents',v_pending,'overdue_cents',v_overdue,
    'paid_invoices',v_paid_count,'open_invoices',v_open_count,
    'overdue_invoices',v_overdue_count,
    'paypal_active_subscriptions',v_active_count,
    'manual_plans',v_manual_count,
    'verified_subscription_failures',v_failed_count,
    'monthly_collected',v_series);
end $$;
revoke all on function public.crm_billing_financial_snapshot(uuid) from public,anon;
grant execute on function public.crm_billing_financial_snapshot(uuid) to authenticated;

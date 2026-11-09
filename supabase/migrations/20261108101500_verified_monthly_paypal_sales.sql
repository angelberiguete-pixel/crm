-- Harden recurring subscription state and accept PayPal API-verified recurring sales.
-- Does not initiate charges. Ordinary authenticated users cannot execute reconciliation.
create unique index if not exists tenant_subscriptions_paypal_id_uniq
  on public.tenant_subscriptions(provider,provider_subscription_id)
  where provider_subscription_id is not null;

create or replace function public.crm_record_verified_subscription_sale(
  p_event_id text,
  p_sale_id text,
  p_provider_subscription_id text,
  p_amount_cents bigint,
  p_currency text,
  p_payment_time timestamptz default null,
  p_next_billing_time timestamptz default null
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_sub public.tenant_subscriptions%rowtype;
  v_event uuid;
  v_invoice uuid;
  v_paid_at timestamptz;
begin
  if p_event_id is null or length(p_event_id)<5 or length(p_event_id)>190
    or p_sale_id is null or length(p_sale_id)<5 or length(p_sale_id)>180
    or p_provider_subscription_id is null or p_provider_subscription_id !~ '^I-[A-Z0-9]+$'
    or p_currency<>'USD' or p_amount_cents<=0 then
    raise exception 'Invalid recurring sale data';
  end if;
  select * into v_sub from public.tenant_subscriptions
   where provider='paypal' and provider_subscription_id=p_provider_subscription_id
   for update;
  if not found then return jsonb_build_object('status','unknown_subscription'); end if;
  if v_sub.provider_approval_state<>'approved'
     or v_sub.status<>'active'
     or v_sub.custom_monthly_price_cents is null
     or v_sub.custom_monthly_price_cents<>p_amount_cents then
    return jsonb_build_object('status','manual_review');
  end if;
  insert into public.billing_provider_events(
     tenant_id,subscription_id,provider_event_id,provider_subscription_id,
     event_type,amount_cents,currency,occurred_at
  ) values(
     v_sub.tenant_id,v_sub.id,p_event_id,p_provider_subscription_id,
     'PAYMENT.SALE.COMPLETED',p_amount_cents,p_currency,p_payment_time
  ) on conflict(provider_event_id) do nothing returning id into v_event;
  if v_event is null then return jsonb_build_object('status','already_processed'); end if;
  v_paid_at:=coalesce(p_payment_time,now());
  insert into public.billing_invoices(
    tenant_id,subscription_id,provider,provider_invoice_id,invoice_number,
    currency,subtotal_cents,tax_cents,total_cents,amount_paid_cents,amount_due_cents,
    status,period_start,period_end,paid_at,metadata
  ) values(
    v_sub.tenant_id,v_sub.id,'paypal',p_sale_id,'PP-'||p_sale_id,'USD',
    p_amount_cents,0,p_amount_cents,p_amount_cents,0,'paid',
    v_paid_at,coalesce(p_next_billing_time,v_paid_at+interval '1 month'),
    v_paid_at,jsonb_build_object('billing_stage','monthly',
      'paypal_sale_id',p_sale_id,'paypal_event_id',p_event_id)
  ) on conflict(provider,provider_invoice_id) do nothing returning id into v_invoice;
  if v_invoice is null then
    return jsonb_build_object('status','already_processed');
  end if;
  update public.tenant_subscriptions
    set current_period_start=v_paid_at,
        current_period_end=coalesce(p_next_billing_time,v_paid_at+interval '1 month'),
        updated_at=now()
    where id=v_sub.id;
  return jsonb_build_object('status','paid','invoice_id',v_invoice);
end $$;
revoke all on function public.crm_record_verified_subscription_sale(text,text,text,bigint,text,timestamptz,timestamptz)
 from public,anon,authenticated;
grant execute on function public.crm_record_verified_subscription_sale(text,text,text,bigint,text,timestamptz,timestamptz)
 to service_role;

-- A failed cycle is an event; do not imply suspension until PayPal confirms its status.
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
  if not found then return jsonb_build_object('status','unknown_subscription'); end if;
  insert into public.billing_provider_events(
    tenant_id,subscription_id,provider_event_id,provider_subscription_id,
    event_type,amount_cents,currency,occurred_at
  ) values(v_sub.tenant_id,v_sub.id,p_event_id,p_provider_subscription_id,
    p_event_type,p_amount_cents,p_currency,p_occurred_at)
  on conflict(provider_event_id) do nothing returning id into v_event_id;
  if v_event_id is null then return jsonb_build_object('status','already_processed'); end if;
  if p_event_type='BILLING.SUBSCRIPTION.ACTIVATED' then
    update public.tenant_subscriptions set
      provider_approval_state='approved',provider_approval_url=null,
      status='active',updated_at=now() where id=v_sub.id;
  elsif p_event_type in ('BILLING.SUBSCRIPTION.CANCELLED','BILLING.SUBSCRIPTION.EXPIRED') then
    update public.tenant_subscriptions set
      provider_approval_state='cancelled',status='cancelled',updated_at=now()
    where id=v_sub.id;
  elsif p_event_type='BILLING.SUBSCRIPTION.SUSPENDED' then
    update public.tenant_subscriptions set status='past_due',updated_at=now()
    where id=v_sub.id;
  end if;
  return jsonb_build_object('status','recorded','event_id',v_event_id);
end $$;
revoke all on function public.crm_record_verified_billing_event(text,text,text,bigint,text,timestamptz)
 from public,anon,authenticated;
grant execute on function public.crm_record_verified_billing_event(text,text,text,bigint,text,timestamptz)
 to service_role;

-- Active means a buyer-approved recurring mandate, not merely a stored PayPal ID.
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
  select coalesce(sum(i.amount_paid_cents),0)::bigint,
    coalesce(sum(case when i.status='open' then i.amount_due_cents else 0 end),0)::bigint,
    coalesce(sum(case when i.status='open' and i.due_at<now() then i.amount_due_cents else 0 end),0)::bigint,
    count(*) filter(where i.status='paid')::bigint,
    count(*) filter(where i.status='open' and i.amount_due_cents>0)::bigint,
    count(*) filter(where i.status='open' and i.amount_due_cents>0 and i.due_at<now())::bigint
  into v_received,v_pending,v_overdue,v_paid_count,v_open_count,v_overdue_count
  from public.billing_invoices i where i.currency='USD'
    and (p_tenant_id is null or i.tenant_id=p_tenant_id)
    and i.status not in ('void','uncollectible');

  select count(*) filter(where provider='paypal' and provider_subscription_id is not null
                            and provider_approval_state='approved' and status='active'),
    count(*) filter(where provider_subscription_id is null
                     and coalesce(custom_monthly_price_cents,0)>0 and status in ('active','trialing'))
  into v_active_count,v_manual_count from public.tenant_subscriptions
    where p_tenant_id is null or tenant_id=p_tenant_id;

  select count(*) into v_failed_count from public.billing_provider_events
   where event_type='BILLING.SUBSCRIPTION.PAYMENT.FAILED'
     and (p_tenant_id is null or tenant_id=p_tenant_id);

  select coalesce(jsonb_agg(jsonb_build_object('month',s.month_key,
    'collected_cents',s.collected_cents) order by s.month_key),'[]'::jsonb)
  into v_series from (
    select to_char(m.month_start,'YYYY-MM') as month_key,
      coalesce(sum(i.amount_paid_cents) filter(where i.status='paid'),0)::bigint collected_cents
    from generate_series(date_trunc('month',now())-interval '5 months',
      date_trunc('month',now()),interval '1 month') as m(month_start)
    left join public.billing_invoices i on i.paid_at>=m.month_start
      and i.paid_at<m.month_start+interval '1 month' and i.currency='USD'
      and (p_tenant_id is null or i.tenant_id=p_tenant_id)
    group by m.month_start
  ) s;
  return jsonb_build_object('currency','USD','received_cents',v_received,
    'pending_cents',v_pending,'overdue_cents',v_overdue,
    'paid_invoices',v_paid_count,'open_invoices',v_open_count,
    'overdue_invoices',v_overdue_count,'paypal_active_subscriptions',v_active_count,
    'manual_plans',v_manual_count,'verified_subscription_failures',v_failed_count,
    'monthly_collected',v_series);
end $$;
revoke all on function public.crm_billing_financial_snapshot(uuid) from public,anon;
grant execute on function public.crm_billing_financial_snapshot(uuid) to authenticated;

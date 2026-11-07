-- Family Power billing: verified initial fee + monthly plan, registration never blocked by billing.
-- The separate PayPal invoice INV2-HSYZ-R25Y-C89A-XNJ5 was already created by the merchant.
-- This migration does not charge any customer and does not auto-activate a PayPal subscription.

create table if not exists public.billing_payment_reports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  invoice_id uuid not null,
  submitted_by uuid references auth.users(id) on delete set null,
  payment_method text not null check(payment_method in ('paypal','transfer','cash')),
  reference_text text,
  customer_note text,
  status text not null default 'submitted' check(status in ('submitted','verified','rejected')),
  verified_amount_cents bigint not null default 0 check(verified_amount_cents >= 0),
  reviewed_by uuid references auth.users(id) on delete set null,
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint billing_payment_reports_same_tenant
    foreign key (tenant_id, invoice_id) references public.billing_invoices(tenant_id,id) on delete cascade,
  constraint billing_payment_reports_reference_length check(length(coalesce(reference_text,'')) <= 180),
  constraint billing_payment_reports_customer_note_length check(length(coalesce(customer_note,'')) <= 1000)
);
create index if not exists billing_payment_reports_tenant_status_idx
 on public.billing_payment_reports(tenant_id,status,created_at desc);
alter table public.billing_payment_reports enable row level security;
revoke all on public.billing_payment_reports from public, anon, authenticated;
grant select, insert on public.billing_payment_reports to authenticated;

drop policy if exists billing_payment_reports_read on public.billing_payment_reports;
create policy billing_payment_reports_read on public.billing_payment_reports
  for select to authenticated
  using (
    private.crm_is_platform_owner()
    or (private.is_tenant_admin(tenant_id) and private.crm_active_tenant_matches(tenant_id))
  );

drop policy if exists billing_payment_reports_submit on public.billing_payment_reports;
create policy billing_payment_reports_submit on public.billing_payment_reports
  for insert to authenticated
  with check (
    (select auth.uid()) is not null
    and submitted_by=(select auth.uid())
    and status='submitted'
    and verified_amount_cents=0
    and reviewed_by is null and reviewed_at is null
    and private.is_tenant_admin(tenant_id)
    and private.crm_active_tenant_matches(tenant_id)
  );

-- Only the actual platform owner can confirm money received.
-- Customer-reported payment does NOT update financial state.
create or replace function public.platform_review_client_payment_report(
  p_report_id uuid,
  p_approve boolean,
  p_confirmed_usd_cents bigint default null,
  p_review_note text default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_report public.billing_payment_reports%rowtype;
        v_invoice public.billing_invoices%rowtype;
        v_credit bigint;
        v_remaining bigint;
begin
  if (select auth.uid()) is null or not private.crm_is_platform_owner() then
    raise exception 'Not authorized to verify payments' using errcode='42501';
  end if;
  if length(coalesce(p_review_note,'')) > 1000 then
    raise exception 'Review note too long';
  end if;
  select * into v_report from public.billing_payment_reports
    where id=p_report_id for update;
  if not found or v_report.status <> 'submitted' then
    raise exception 'Payment report not pending';
  end if;
  select * into v_invoice from public.billing_invoices
    where id=v_report.invoice_id and tenant_id=v_report.tenant_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  if p_approve then
    if v_invoice.status not in ('open') or v_invoice.amount_due_cents <= 0 then
      raise exception 'Invoice is not payable';
    end if;
    v_credit := coalesce(p_confirmed_usd_cents, v_invoice.amount_due_cents);
    if v_credit <= 0 or v_credit > v_invoice.amount_due_cents then
      raise exception 'Confirmed amount exceeds open invoice balance';
    end if;
    v_remaining := v_invoice.amount_due_cents - v_credit;
    update public.billing_invoices
       set amount_paid_cents=amount_paid_cents+v_credit,
           amount_due_cents=v_remaining,
           status=case when v_remaining=0 then 'paid' else 'open' end,
           paid_at=case when v_remaining=0 then now() else paid_at end,
           updated_at=now()
     where id=v_invoice.id;
    -- Start the agreed manual US$80/month period only AFTER the initial invoice is fully verified.
    -- This is account configuration, not a recurring PayPal billing authorization.
    if v_remaining = 0 and v_invoice.metadata->>'billing_stage' = 'initial' then
      update public.tenant_subscriptions
         set custom_monthly_price_cents=8000,
             current_period_start=now(),
             current_period_end=now()+interval '1 month',
             updated_at=now()
       where tenant_id=v_invoice.tenant_id;
    end if;
  else
    v_credit:=0;
  end if;
  update public.billing_payment_reports
     set status=case when p_approve then 'verified' else 'rejected' end,
         verified_amount_cents=v_credit,
         reviewed_at=now(), reviewed_by=(select auth.uid()), review_note=p_review_note
   where id=v_report.id;
  return jsonb_build_object('report_id',v_report.id,'invoice_id',v_invoice.id,
    'verified',p_approve,'credited_cents',v_credit,
    'remaining_cents',case when p_approve then v_remaining else v_invoice.amount_due_cents end);
end $$;
revoke all on function public.platform_review_client_payment_report(uuid,boolean,bigint,text) from public, anon;
grant execute on function public.platform_review_client_payment_report(uuid,boolean,bigint,text) to authenticated;

-- Exactly one provider invoice is recorded. Re-running never reopens an already paid invoice.
insert into public.billing_invoices (
 tenant_id,subscription_id,provider,provider_invoice_id,invoice_number,currency,
 subtotal_cents,tax_cents,total_cents,amount_paid_cents,amount_due_cents,
 status,hosted_invoice_url,metadata
)
select t.id,s.id,'paypal','INV2-HSYZ-R25Y-C89A-XNJ5','0002','USD',
       19700,0,19700,0,19700,'open',
       'https://www.paypal.com/invoice/p/#HSYZR25YC89AXNJ5',
       jsonb_build_object('billing_stage','initial','monthly_usd_cents',8000,
         'customer_label','Dr. Emerson Familia','manual_confirmation_required',true)
from public.tenants t
left join public.tenant_subscriptions s on s.tenant_id=t.id
where t.slug='family-power'
on conflict (provider,provider_invoice_id) do nothing;

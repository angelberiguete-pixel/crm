-- Family Power implementation is DOP 30,000 in installments.
-- PayPal invoice #0002 (USD 197) is ONLY installment 1, not the entire contract.
-- No invented exchange rate: credits in DOP require an explicit recorded rate.
-- This migration DOES NOT charge anybody, confirm payments, or grant access.

create table if not exists public.billing_implementation_contracts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.tenants(id) on delete cascade,
  contract_code text not null unique,
  description text not null,
  client_label text,
  currency text not null default 'DOP' check(currency='DOP'),
  total_dop_cents bigint not null check(total_dop_cents>0),
  status text not null default 'open' check(status in ('open','settled','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.billing_implementation_contracts enable row level security;
revoke all on public.billing_implementation_contracts from public,anon,authenticated;
grant select on public.billing_implementation_contracts to authenticated;
drop policy if exists billing_implementation_contracts_read on public.billing_implementation_contracts;
create policy billing_implementation_contracts_read on public.billing_implementation_contracts
for select to authenticated using (
  private.crm_is_platform_owner()
  or (private.is_tenant_admin(tenant_id) and private.crm_active_tenant_matches(tenant_id))
);

create table if not exists public.billing_implementation_credits (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.billing_implementation_contracts(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  invoice_id uuid unique references public.billing_invoices(id) on delete restrict,
  method text not null check(method in ('paypal','transfer','cash')),
  verified_reference text,
  source_currency text not null check(source_currency in ('DOP','USD')),
  source_amount_cents bigint not null check(source_amount_cents>0),
  exchange_rate_dop_per_usd numeric(12,4),
  credited_dop_cents bigint not null check(credited_dop_cents>0),
  confirmed_by uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz not null default now(),
  constraint billing_implementation_fx_valid check(
    (source_currency='DOP' and exchange_rate_dop_per_usd is null and source_amount_cents=credited_dop_cents)
    or (source_currency='USD' and exchange_rate_dop_per_usd is not null and exchange_rate_dop_per_usd>0)
  ),
  constraint billing_implementation_reference_check check(
    length(coalesce(verified_reference,''))<=180
  )
);
create unique index if not exists billing_implementation_reference_uniq
on public.billing_implementation_credits(contract_id,method,lower(verified_reference))
where verified_reference is not null;
create index if not exists billing_implementation_credits_contract_idx
on public.billing_implementation_credits(contract_id,confirmed_at);
alter table public.billing_implementation_credits enable row level security;
revoke all on public.billing_implementation_credits from public,anon,authenticated;
grant select on public.billing_implementation_credits to authenticated;
drop policy if exists billing_implementation_credits_read on public.billing_implementation_credits;
create policy billing_implementation_credits_read on public.billing_implementation_credits
for select to authenticated using (
  private.crm_is_platform_owner()
  or (private.is_tenant_admin(tenant_id) and private.crm_active_tenant_matches(tenant_id))
);

insert into public.billing_implementation_contracts (
  tenant_id,contract_code,description,client_label,total_dop_cents
)
select id,'family-power-implementation-2026',
  'Implementación de Solución Tecnológica e Inteligencia Artificial',
  'Dr. Emerson Familia',3000000
from public.tenants where slug='family-power'
on conflict(contract_code) do nothing;

-- Keep the existing USD 197 PayPal invoice. Correct only CRM classification:
-- this is installment 1 toward the DOP 30,000 implementation.
update public.billing_invoices i
set metadata=coalesce(i.metadata,'{}'::jsonb)
  - 'monthly_usd_cents'
  || jsonb_build_object(
    'billing_stage','implementation_installment',
    'installment_number',1,
    'contract_code','family-power-implementation-2026',
    'contract_currency','DOP',
    'contract_total_dop_cents',3000000
  ),
  updated_at=now()
where i.provider='paypal'
 and i.provider_invoice_id='INV2-HSYZ-R25Y-C89A-XNJ5'
 and i.tenant_id=(select id from public.tenants where slug='family-power');

-- Snapshot is scoped to the authorized business: DOP contract separate from USD invoices.
create or replace function public.crm_implementation_contract_summary(
  p_tenant_id uuid
) returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare
  v_contract public.billing_implementation_contracts%rowtype;
  v_credited bigint;
  v_first jsonb;
  v_awaiting_fx bigint;
begin
  if (select auth.uid()) is null
    or not (private.crm_is_platform_owner() or (
      private.is_tenant_admin(p_tenant_id) and private.crm_active_tenant_matches(p_tenant_id)
    )) then
    raise exception 'Not authorized to view implementation balance' using errcode='42501';
  end if;
  select * into v_contract from public.billing_implementation_contracts
   where tenant_id=p_tenant_id;
  if not found then return jsonb_build_object('status','not_configured'); end if;
  select coalesce(sum(credited_dop_cents),0)::bigint
   into v_credited from public.billing_implementation_credits
   where contract_id=v_contract.id;

  select jsonb_build_object(
    'invoice_id',i.id,'invoice_number',i.invoice_number,
    'currency',i.currency,'amount_cents',i.total_cents,
    'amount_due_cents',i.amount_due_cents,'status',i.status,
    'hosted_invoice_url',i.hosted_invoice_url,
    'credited_to_contract',exists(
      select 1 from public.billing_implementation_credits c where c.invoice_id=i.id
    )
  ) into v_first
  from public.billing_invoices i
  where i.tenant_id=v_contract.tenant_id
    and i.metadata->>'contract_code'=v_contract.contract_code
    and i.metadata->>'installment_number'='1'
  order by i.created_at desc limit 1;

  select count(*) into v_awaiting_fx from public.billing_invoices i
  where i.tenant_id=v_contract.tenant_id and i.status='paid'
    and i.metadata->>'contract_code'=v_contract.contract_code
    and not exists(select 1 from public.billing_implementation_credits c where c.invoice_id=i.id);

  return jsonb_build_object(
    'status',v_contract.status,'contract_id',v_contract.id,
    'contract_code',v_contract.contract_code,
    'client_label',v_contract.client_label,'currency','DOP',
    'total_dop_cents',v_contract.total_dop_cents,
    'credited_dop_cents',v_credited,
    'remaining_dop_cents',greatest(0,v_contract.total_dop_cents-v_credited),
    'first_installment',v_first,'paid_invoices_awaiting_allocation',v_awaiting_fx
  );
end $$;
revoke all on function public.crm_implementation_contract_summary(uuid) from public,anon;
grant execute on function public.crm_implementation_contract_summary(uuid) to authenticated;

-- Only the verified platform owner can convert a PAID invoice to an
-- implementation credit, or record physically verified DOP cash/transfer.
-- Never trust client-reported payments as proof.
create or replace function public.platform_apply_implementation_credit(
  p_contract_id uuid,
  p_invoice_id uuid default null,
  p_rate_dop_per_usd numeric default null,
  p_verified_dop_cents bigint default null,
  p_method text default 'paypal',
  p_reference text default null
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_contract public.billing_implementation_contracts%rowtype;
  v_invoice public.billing_invoices%rowtype;
  v_credited bigint;
  v_remaining bigint;
  v_amount bigint;
  v_source bigint;
  v_currency text;
  v_method text;
  v_reference text;
begin
  if (select auth.uid()) is null or not private.crm_is_platform_owner() then
    raise exception 'Only the platform owner can allocate verified implementation payments'
      using errcode='42501';
  end if;
  select * into v_contract from public.billing_implementation_contracts
    where id=p_contract_id for update;
  if not found or v_contract.status<>'open' then
    raise exception 'Implementation contract not open';
  end if;
  select coalesce(sum(credited_dop_cents),0)::bigint into v_credited
   from public.billing_implementation_credits where contract_id=v_contract.id;
  v_remaining:=v_contract.total_dop_cents-v_credited;
  if v_remaining<=0 then raise exception 'Implementation already settled'; end if;

  if p_invoice_id is not null then
    select * into v_invoice from public.billing_invoices
     where id=p_invoice_id and tenant_id=v_contract.tenant_id for update;
    if not found or v_invoice.status<>'paid' or v_invoice.amount_due_cents<>0
      or (v_invoice.metadata->>'contract_code') is distinct from v_contract.contract_code then
      raise exception 'Invoice not fully paid and verified for this contract';
    end if;
    if exists(select 1 from public.billing_implementation_credits where invoice_id=p_invoice_id) then
      raise exception 'This invoice has already been credited';
    end if;
    if v_invoice.currency not in ('USD','DOP') then raise exception 'Unsupported invoice currency'; end if;
    v_source:=v_invoice.amount_paid_cents;
    v_currency:=v_invoice.currency;
    v_method:=v_invoice.provider;
    if v_method not in ('paypal','transfer','cash') then
      raise exception 'Invoice payment method requires reconciliation';
    end if;
    v_reference:=v_invoice.provider_invoice_id;
    if v_currency='USD' then
      if p_rate_dop_per_usd is null or p_rate_dop_per_usd<=0
        or p_rate_dop_per_usd>1000 then
        raise exception 'Explicit approved DOP/USD exchange rate required';
      end if;
      v_amount:=round(v_source*p_rate_dop_per_usd)::bigint;
    else
      if p_rate_dop_per_usd is not null then raise exception 'DOP payment does not require FX'; end if;
      v_amount:=v_source;
    end if;
  else
    if p_method not in ('cash','transfer')
      or p_verified_dop_cents is null or p_verified_dop_cents<=0
      or p_rate_dop_per_usd is not null
      or length(btrim(coalesce(p_reference,'')))<4
      or length(btrim(coalesce(p_reference,'')))>180 then
      raise exception 'Verified DOP amount, unique receipt and valid method required';
    end if;
    v_source:=p_verified_dop_cents;
    v_currency:='DOP';v_amount:=v_source;
    v_method:=p_method;v_reference:=btrim(p_reference);
  end if;
  if v_amount<=0 or v_amount>v_remaining then
    raise exception 'Credit cannot exceed remaining implementation balance';
  end if;
  insert into public.billing_implementation_credits(
    contract_id,tenant_id,invoice_id,method,verified_reference,
    source_currency,source_amount_cents,exchange_rate_dop_per_usd,
    credited_dop_cents,confirmed_by
  ) values(
    v_contract.id,v_contract.tenant_id,p_invoice_id,v_method,v_reference,
    v_currency,v_source,
    case when v_currency='USD' then p_rate_dop_per_usd else null end,
    v_amount,(select auth.uid())
  );

  v_remaining:=v_remaining-v_amount;
  if v_remaining=0 then
    update public.billing_implementation_contracts
      set status='settled',updated_at=now() where id=v_contract.id;
    -- The monthly license is still NOT a PayPal subscription until the buyer approves it.
    update public.tenant_subscriptions
      set custom_monthly_price_cents=8000,updated_at=now()
      where tenant_id=v_contract.tenant_id;
  end if;
  return jsonb_build_object(
    'contract_id',v_contract.id,'credited_dop_cents',v_amount,
    'remaining_dop_cents',v_remaining,
    'status',case when v_remaining=0 then 'settled' else 'open' end
  );
end $$;
revoke all on function public.platform_apply_implementation_credit(uuid,uuid,numeric,bigint,text,text)
  from public,anon;
grant execute on function public.platform_apply_implementation_credit(uuid,uuid,numeric,bigint,text,text)
  to authenticated;

-- CRITICAL: provider invoice reconciliation must NOT begin the monthly plan
-- on the first USD197 installment. Settlement occurs ONLY at contract level.
create or replace function public.paypal_confirm_invoice_from_api(
  p_provider_invoice_id text,p_total_cents bigint
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_invoice public.billing_invoices%rowtype;
begin
  if p_provider_invoice_id is null or p_provider_invoice_id !~ '^INV2-[A-Z0-9-]+$'
    or p_total_cents is null or p_total_cents<=0 then
    raise exception 'Invalid PayPal invoice evidence';
  end if;
  select * into v_invoice from public.billing_invoices
   where provider='paypal' and provider_invoice_id=p_provider_invoice_id
     and currency='USD' for update;
  if not found then return jsonb_build_object('status','not_tracked'); end if;
  if v_invoice.total_cents<>p_total_cents then
    raise exception 'PayPal invoice amount does not match';
  end if;
  if v_invoice.status='paid' and v_invoice.amount_due_cents=0 then
    return jsonb_build_object('status','already_paid','invoice_id',v_invoice.id);
  end if;
  if v_invoice.status<>'open' or v_invoice.amount_paid_cents<>0 then
    return jsonb_build_object('status','manual_review','invoice_id',v_invoice.id);
  end if;
  update public.billing_invoices set
    status='paid',amount_due_cents=0,amount_paid_cents=total_cents,
    paid_at=now(),updated_at=now(),
    metadata=jsonb_set(coalesce(metadata,'{}'::jsonb),'{paypal_verified_at}',to_jsonb(now()),true)
  where id=v_invoice.id;
  return jsonb_build_object('status','paid','invoice_id',v_invoice.id,
    'implementation_contract_status','awaiting_fx_allocation');
end $$;
revoke all on function public.paypal_confirm_invoice_from_api(text,bigint)
 from public,anon,authenticated;
grant execute on function public.paypal_confirm_invoice_from_api(text,bigint) to service_role;

-- Owner reconciliations may close an installment invoice but never all DOP debt.
create or replace function public.platform_confirm_billing_invoice(
  p_invoice_id uuid,p_payment_method text,p_reference text,
  p_confirmed_usd_cents bigint default null
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_invoice public.billing_invoices%rowtype;v_credit bigint;v_remaining bigint;
begin
 if (select auth.uid()) is null or not private.crm_is_platform_owner() then
   raise exception 'Not authorized' using errcode='42501';
 end if;
 if p_payment_method not in ('paypal','transfer','cash')
    or length(btrim(coalesce(p_reference,'')))<4
    or length(btrim(coalesce(p_reference,'')))>180 then
   raise exception 'Valid method and unique receipt required';
 end if;
 select * into v_invoice from public.billing_invoices where id=p_invoice_id for update;
 if not found or v_invoice.status<>'open' or v_invoice.amount_due_cents<=0
    or v_invoice.currency<>'USD' then
   raise exception 'Invoice is not payable in USD';
 end if;
 if exists(select 1 from public.billing_payment_reports
   where tenant_id=v_invoice.tenant_id and status='verified'
     and payment_method=p_payment_method and lower(reference_text)=lower(btrim(p_reference))) then
   raise exception 'Receipt reference already verified';
 end if;
 v_credit:=coalesce(p_confirmed_usd_cents,v_invoice.amount_due_cents);
 if v_credit<=0 or v_credit>v_invoice.amount_due_cents then
   raise exception 'Invalid verified USD amount';
 end if;
 v_remaining:=v_invoice.amount_due_cents-v_credit;
 update public.billing_invoices set
  amount_paid_cents=amount_paid_cents+v_credit,amount_due_cents=v_remaining,
  status=case when v_remaining=0 then 'paid' else 'open' end,
  paid_at=case when v_remaining=0 then now() else paid_at end,
  updated_at=now() where id=v_invoice.id;
 insert into public.billing_payment_reports(
  tenant_id,invoice_id,submitted_by,payment_method,reference_text,status,
  verified_amount_cents,reviewed_by,reviewed_at,review_note
 ) values(v_invoice.tenant_id,v_invoice.id,null,p_payment_method,btrim(p_reference),
  'verified',v_credit,(select auth.uid()),now(),'Verified directly by platform owner');
 return jsonb_build_object('invoice_id',v_invoice.id,'credited_usd_cents',v_credit,
  'remaining_usd_cents',v_remaining,
  'status',case when v_remaining=0 then 'paid' else 'open' end);
end $$;
revoke all on function public.platform_confirm_billing_invoice(uuid,text,text,bigint) from public,anon;
grant execute on function public.platform_confirm_billing_invoice(uuid,text,text,bigint) to authenticated;

create or replace function public.platform_review_client_payment_report(
 p_report_id uuid,p_approve boolean,
 p_confirmed_usd_cents bigint default null,
 p_review_note text default null
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_report public.billing_payment_reports%rowtype;
        v_invoice public.billing_invoices%rowtype;v_credit bigint;v_remaining bigint;
begin
 if (select auth.uid()) is null or not private.crm_is_platform_owner() then
   raise exception 'Not authorized' using errcode='42501';
 end if;
 if length(coalesce(p_review_note,''))>1000 then raise exception 'Note too long'; end if;
 select * into v_report from public.billing_payment_reports where id=p_report_id for update;
 if not found or v_report.status<>'submitted' then raise exception 'Report not pending'; end if;
 select * into v_invoice from public.billing_invoices
  where id=v_report.invoice_id and tenant_id=v_report.tenant_id for update;
 if not found then raise exception 'Invoice not found'; end if;
 v_credit:=0;v_remaining:=v_invoice.amount_due_cents;
 if p_approve then
   if v_invoice.status<>'open' or v_remaining<=0 or v_invoice.currency<>'USD' then raise exception 'Invoice not payable'; end if;
   v_credit:=coalesce(p_confirmed_usd_cents,v_remaining);
   if v_credit<=0 or v_credit>v_remaining then raise exception 'Invalid amount'; end if;
   v_remaining:=v_remaining-v_credit;
   update public.billing_invoices set
    amount_paid_cents=amount_paid_cents+v_credit,amount_due_cents=v_remaining,
    status=case when v_remaining=0 then 'paid' else 'open' end,
    paid_at=case when v_remaining=0 then now() else paid_at end,
    updated_at=now() where id=v_invoice.id;
 end if;
 update public.billing_payment_reports
  set status=case when p_approve then 'verified' else 'rejected' end,
      verified_amount_cents=v_credit,reviewed_at=now(),
      reviewed_by=(select auth.uid()),review_note=p_review_note
  where id=v_report.id;
 return jsonb_build_object('report_id',v_report.id,'invoice_id',v_invoice.id,
   'verified',p_approve,'credited_cents',v_credit,'remaining_cents',v_remaining);
end $$;
revoke all on function public.platform_review_client_payment_report(uuid,boolean,bigint,text) from public,anon;
grant execute on function public.platform_review_client_payment_report(uuid,boolean,bigint,text) to authenticated;

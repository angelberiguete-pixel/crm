-- UI is USD-first. Original DOP 30,000 obligation and credits stay unchanged.
-- Exchange rate is a dated BCRD reference for display; NOT a new contracted price.
alter table public.billing_implementation_contracts
 add column if not exists display_rate_dop_per_usd numeric(12,4),
 add column if not exists display_rate_source text,
 add column if not exists display_rate_date date;

update public.billing_implementation_contracts
 set display_rate_dop_per_usd=60.7601,
     display_rate_source='BCRD, tasa de venta de referencia al 2026-11-06',
     display_rate_date='2026-11-06',
     updated_at=now()
 where contract_code='family-power-implementation-2026'
   and display_rate_dop_per_usd is null;

alter table public.billing_implementation_contracts
 drop constraint if exists billing_implementation_display_rate_positive;
alter table public.billing_implementation_contracts
 add constraint billing_implementation_display_rate_positive
 check(display_rate_dop_per_usd is null or display_rate_dop_per_usd between 1 and 1000);

-- Authorized snapshot additionally returns USD presentation amounts.
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
    -- USD display equivalents only; the signed DOP balance is not redenominated.
    'display_currency','USD',
    'display_rate_dop_per_usd',v_contract.display_rate_dop_per_usd,
    'display_rate_source',v_contract.display_rate_source,
    'display_rate_date',v_contract.display_rate_date,
    'usd_reference_total_cents',case when v_contract.display_rate_dop_per_usd>0 then round(v_contract.total_dop_cents/v_contract.display_rate_dop_per_usd)::bigint else null end,
    'usd_reference_credited_cents',case when v_contract.display_rate_dop_per_usd>0 then round(v_credited/v_contract.display_rate_dop_per_usd)::bigint else null end,
    'usd_reference_remaining_cents',case when v_contract.display_rate_dop_per_usd>0 then round(greatest(0,v_contract.total_dop_cents-v_credited)/v_contract.display_rate_dop_per_usd)::bigint else null end,
    'first_installment',v_first,'paid_invoices_awaiting_allocation',v_awaiting_fx
  );
end $$;
revoke all on function public.crm_implementation_contract_summary(uuid) from public,anon;
grant execute on function public.crm_implementation_contract_summary(uuid) to authenticated;


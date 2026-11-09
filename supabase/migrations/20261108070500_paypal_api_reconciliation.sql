-- Live PayPal Invoice v2 reconciliation: only server-side verified invoices may clear balances.
-- Intentionally no RPC permission for normal users, and no automatic subscription approval.
create or replace function public.paypal_confirm_invoice_from_api(
  p_provider_invoice_id text,
  p_total_cents bigint
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_invoice public.billing_invoices%rowtype;
begin
  if p_provider_invoice_id is null or p_provider_invoice_id !~ '^INV2-[A-Z0-9-]+$'
     or p_total_cents is null or p_total_cents <= 0 then
    raise exception 'Invalid PayPal invoice evidence';
  end if;
  select * into v_invoice from public.billing_invoices
    where provider='paypal' and provider_invoice_id=p_provider_invoice_id
      and currency='USD'
    for update;
  if not found then
    return jsonb_build_object('status','not_tracked');
  end if;
  if v_invoice.total_cents <> p_total_cents then
    raise exception 'PayPal amount does not match invoice total';
  end if;
  if v_invoice.status='paid' and v_invoice.amount_due_cents=0 then
    return jsonb_build_object('status','already_paid','invoice_id',v_invoice.id);
  end if;
  if v_invoice.status<>'open' or v_invoice.amount_paid_cents<>0 then
    return jsonb_build_object('status','manual_review','invoice_id',v_invoice.id);
  end if;
  update public.billing_invoices
  set status='paid', amount_due_cents=0, amount_paid_cents=total_cents,
      paid_at=now(), updated_at=now(),
      metadata=jsonb_set(coalesce(metadata,'{}'::jsonb),'{paypal_verified_at}',to_jsonb(now()),true)
  where id=v_invoice.id;
  if v_invoice.metadata->>'billing_stage'='initial' then
    update public.tenant_subscriptions
    set custom_monthly_price_cents=8000,
        current_period_start=coalesce(current_period_start,now()),
        current_period_end=coalesce(current_period_end,now()+interval '1 month'),
        updated_at=now()
    where tenant_id=v_invoice.tenant_id;
  end if;
  return jsonb_build_object('status','paid','invoice_id',v_invoice.id);
end $$;

revoke all on function public.paypal_confirm_invoice_from_api(text,bigint)
  from public, anon, authenticated;
grant execute on function public.paypal_confirm_invoice_from_api(text,bigint)
  to service_role;

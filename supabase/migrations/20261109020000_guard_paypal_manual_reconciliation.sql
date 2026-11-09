-- Do not let a manual report falsely mark PayPal's USD197 invoice paid.
-- PayPal must confirm its own invoices. Owner-confirmed DOP cash and transfer
-- payments are recorded through platform_apply_implementation_credit instead.

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
 if v_invoice.provider='paypal' then
   raise exception 'PayPal invoices must be verified by PayPal API; record cash/transfer directly on the DOP implementation contract';
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
   if v_invoice.provider='paypal' then
     raise exception 'PayPal invoices require PayPal API verification; record cash/transfer as DOP contract credits';
   end if;

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

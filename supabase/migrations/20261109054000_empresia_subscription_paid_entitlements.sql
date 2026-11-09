-- Never unlock digital access solely from subscription approval.
-- Recurring entitlement requires a PayPal-verified completed sale.
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
   values(v_order.id,v_order.offer_id,v_order.buyer_id,'provisioning')
   on conflict(order_id) do update set status=
     case when public.empresia_entitlements.status='active' then 'active'
       else 'provisioning' end,
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
 -- Only the verified first payment (not the PayPal ACTIVE state alone)
 -- can unlock a digital entitlement.
 update public.empresia_entitlements e set status=
   case when f.fulfillment='entitlement' then 'active' else 'provisioning' end,
   updated_at=now()
 from public.empresia_offers f
 where e.order_id=v_order.id and f.id=v_order.offer_id;
 return jsonb_build_object('status','paid','order_id',v_order.id);
end $$;
revoke all on function public.empresia_confirm_subscription_sale(text,text,bigint)
 from public,anon,authenticated;
grant execute on function public.empresia_confirm_subscription_sale(text,text,bigint)
 to service_role;

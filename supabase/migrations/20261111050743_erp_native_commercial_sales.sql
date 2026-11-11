-- Native customer sales. Platform subscription billing tables are deliberately untouched.
-- No historical totals/payments are rewritten; legacy paid orders require reconciliation.
create table public.erp_sales_requests (
  tenant_id uuid not null references public.tenants(id),
  idempotency_key text not null check(length(btrim(idempotency_key)) between 1 and 160),
  operation text not null,
  payload jsonb not null,
  resource_id uuid not null,
  actor_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key(tenant_id,idempotency_key)
);
alter table public.erp_sales_requests enable row level security;
revoke all on public.erp_sales_requests from public,anon,authenticated;
grant select on public.erp_sales_requests to authenticated;
create policy erp_sales_requests_read on public.erp_sales_requests for select to authenticated
  using(private.has_tenant_access(tenant_id) and private.crm_active_tenant_matches(tenant_id));

alter table public.orders add column native_sales_request_key text;

create table public.commercial_invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  order_id uuid not null,
  invoice_number text not null,
  currency text not null check(currency in ('DOP','USD','EUR')),
  subtotal numeric(18,2) not null check(subtotal>=0 and subtotal<'Infinity'::numeric),
  discount_total numeric(18,2) not null check(discount_total>=0 and discount_total<'Infinity'::numeric),
  tax_total numeric(18,2) not null check(tax_total>=0 and tax_total<'Infinity'::numeric),
  total numeric(18,2) not null check(total>0 and total<'Infinity'::numeric),
  due_date date not null,
  issued_at timestamptz not null default now(),
  issued_by uuid not null references auth.users(id),
  customer_snapshot jsonb not null,
  lines_snapshot jsonb not null check(jsonb_typeof(lines_snapshot)='array' and jsonb_array_length(lines_snapshot)>0),
  document_kind text not null default 'commercial' check(document_kind='commercial'),
  unique(tenant_id,id), unique(tenant_id,order_id), unique(tenant_id,invoice_number),
  foreign key(tenant_id,order_id) references public.orders(tenant_id,id),
  check(total=subtotal-discount_total+tax_total)
);
alter table public.commercial_invoices enable row level security;
revoke all on public.commercial_invoices from public,anon,authenticated;
grant select on public.commercial_invoices to authenticated;
create policy commercial_invoices_read on public.commercial_invoices for select to authenticated
 using(private.has_tenant_access(tenant_id) and private.crm_active_tenant_matches(tenant_id));

alter table public.customer_payments add column commercial_invoice_id uuid;
alter table public.customer_payments add constraint customer_payments_commercial_invoice_fk
 foreign key(tenant_id,commercial_invoice_id) references public.commercial_invoices(tenant_id,id);
create index customer_payments_commercial_invoice_idx on public.customer_payments(tenant_id,commercial_invoice_id)
 where commercial_invoice_id is not null;
create unique index customer_payments_commercial_reference_unique on public.customer_payments(tenant_id,commercial_invoice_id,reference)
 where commercial_invoice_id is not null;
-- The ledger is written only by the checked transaction functions below.
revoke insert,update,delete on public.customer_payments from anon,authenticated;

create function private.erp_sales_authorized(p_tenant_id uuid,p_finance boolean default false)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null
 and coalesce(auth.jwt()->'app_metadata'->>'actor_type','human') not in ('agent','ai','service')
 and private.crm_active_tenant_matches(p_tenant_id)
 and private.has_tenant_access(p_tenant_id)
 and case when p_finance then private.can_manage_crm(p_tenant_id) else private.can_operate_crm(p_tenant_id) end
$$;
revoke all on function private.erp_sales_authorized(uuid,boolean) from public,anon;
grant execute on function private.erp_sales_authorized(uuid,boolean) to authenticated;

create function private.erp_sales_immutable_document() returns trigger language plpgsql set search_path='' as $$
begin raise exception using errcode='55000',message='issued_document_is_immutable'; end;
$$;
revoke all on function private.erp_sales_immutable_document() from public,anon,authenticated;
create trigger commercial_invoices_immutable before update or delete on public.commercial_invoices
 for each row execute function private.erp_sales_immutable_document();
create trigger erp_sales_requests_immutable before update or delete on public.erp_sales_requests
 for each row execute function private.erp_sales_immutable_document();
create trigger commercial_payments_immutable before update or delete on public.customer_payments
 for each row when(old.commercial_invoice_id is not null) execute function private.erp_sales_immutable_document();

-- Lock the parent whenever source lines change. Conversion/issuance takes that same lock.
create function private.erp_sales_guard_quote_lines() returns trigger language plpgsql set search_path='' as $$
declare v_tenant uuid; v_quote uuid;
begin
 if tg_op='UPDATE' and (new.tenant_id is distinct from old.tenant_id or new.quotation_id is distinct from old.quotation_id)
 then raise exception 'quotation_line_parent_is_immutable'; end if;
 v_tenant:=case when tg_op='DELETE' then old.tenant_id else new.tenant_id end;
 v_quote:=case when tg_op='DELETE' then old.quotation_id else new.quotation_id end;
 perform 1 from public.quotations where tenant_id=v_tenant and id=v_quote for update;
 if exists(select 1 from public.orders where tenant_id=v_tenant and quotation_id=v_quote and native_sales_request_key is not null)
 then raise exception using errcode='55000',message='converted_quotation_is_immutable'; end if;
 return case when tg_op='DELETE' then old else new end;
end; $$;
revoke all on function private.erp_sales_guard_quote_lines() from public,anon,authenticated;
create trigger erp_sales_guard_quote_lines before insert or update or delete on public.quotation_items
 for each row execute function private.erp_sales_guard_quote_lines();

create function private.erp_sales_guard_order_lines() returns trigger language plpgsql set search_path='' as $$
declare v_tenant uuid; v_order uuid;
begin
 if tg_op='UPDATE' and (new.tenant_id is distinct from old.tenant_id or new.order_id is distinct from old.order_id)
 then raise exception 'order_line_parent_is_immutable'; end if;
 v_tenant:=case when tg_op='DELETE' then old.tenant_id else new.tenant_id end;
 v_order:=case when tg_op='DELETE' then old.order_id else new.order_id end;
 perform 1 from public.orders where tenant_id=v_tenant and id=v_order for update;
 if exists(select 1 from public.commercial_invoices where tenant_id=v_tenant and order_id=v_order)
 then raise exception using errcode='55000',message='invoiced_order_lines_are_immutable'; end if;
 return case when tg_op='DELETE' then old else new end;
end; $$;
revoke all on function private.erp_sales_guard_order_lines() from public,anon,authenticated;
create trigger erp_sales_guard_order_lines before insert or update or delete on public.order_items
 for each row execute function private.erp_sales_guard_order_lines();

-- Reject a direct browser write to financial totals, and serialize every quote-to-order writer.
create function private.erp_sales_guard_order() returns trigger language plpgsql set search_path='' as $$
declare v_owner name;
begin
 select pg_get_userbyid(c.relowner) into v_owner from pg_class c where c.oid='public.orders'::regclass;
 if tg_op='UPDATE' and (new.tenant_id is distinct from old.tenant_id or new.quotation_id is distinct from old.quotation_id)
 then raise exception 'order_parent_is_immutable'; end if;
 if current_user<>v_owner and (tg_op='INSERT' and (new.amount_paid<>0 or new.native_sales_request_key is not null)
  or tg_op='UPDATE' and (new.amount_paid is distinct from old.amount_paid or new.native_sales_request_key is distinct from old.native_sales_request_key))
 then raise exception using errcode='42501',message='use_commercial_payment_transaction'; end if;
 if tg_op='UPDATE' and exists(select 1 from public.commercial_invoices where tenant_id=old.tenant_id and order_id=old.id)
 and (new.currency,new.subtotal,new.discount_total,new.tax_total,new.total,new.contact_id,new.company_id)
 is distinct from (old.currency,old.subtotal,old.discount_total,old.tax_total,old.total,old.contact_id,old.company_id)
 then raise exception using errcode='55000',message='invoiced_order_totals_are_immutable'; end if;
 if tg_op='INSERT' and new.quotation_id is not null then
  perform 1 from public.quotations where tenant_id=new.tenant_id and id=new.quotation_id for update;
  if exists(select 1 from public.orders where tenant_id=new.tenant_id and quotation_id=new.quotation_id)
  then raise exception using errcode='23505',message='quotation_already_has_order'; end if;
 end if;
 return new;
end; $$;
revoke all on function private.erp_sales_guard_order() from public,anon,authenticated;
create trigger erp_sales_guard_order before insert or update on public.orders
 for each row execute function private.erp_sales_guard_order();

create function private.erp_native_convert_quote(p_tenant_id uuid,p_quotation_id uuid,p_idempotency_key text,p_committed_at timestamptz default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_quote public.quotations%rowtype; v_order uuid; v_payload jsonb;
 v_request public.erp_sales_requests%rowtype; v_subtotal numeric; v_discount numeric; v_tax numeric;
begin
 if not private.erp_sales_authorized(p_tenant_id,false) then raise exception using errcode='42501',message='sales_permission_denied'; end if;
 if p_idempotency_key is null or length(btrim(p_idempotency_key)) not between 1 and 160 then raise exception 'invalid_idempotency_key'; end if;
 v_payload:=jsonb_build_object('quotation_id',p_quotation_id,'committed_at',p_committed_at);
 perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':'||p_idempotency_key,0));
 select * into v_request from public.erp_sales_requests where tenant_id=p_tenant_id and idempotency_key=p_idempotency_key;
 if found then
  if v_request.operation<>'quote_to_order' or v_request.payload<>v_payload then raise exception 'idempotency_payload_mismatch'; end if;
  return v_request.resource_id;
 end if;
 select * into v_quote from public.quotations where tenant_id=p_tenant_id and id=p_quotation_id for update;
 if not found then raise exception 'quotation_not_found'; end if;
 if v_quote.status<>'accepted' then raise exception 'quotation_requires_human_acceptance'; end if;
 if v_quote.total<=0 or v_quote.total>='Infinity'::numeric then raise exception 'invalid_quotation_total'; end if;
 select id into v_order from public.orders where tenant_id=p_tenant_id and quotation_id=p_quotation_id order by created_at,id limit 1;
 if v_order is null then
  if not exists(select 1 from public.quotation_items where tenant_id=p_tenant_id and quotation_id=p_quotation_id) then raise exception 'quotation_requires_items'; end if;
  select round(sum(quantity*unit_price),2),round(sum(quantity*unit_price*discount_percent/100),2),
   round(sum(quantity*unit_price*(1-discount_percent/100)*tax_rate/100),2)
   into v_subtotal,v_discount,v_tax from public.quotation_items where tenant_id=p_tenant_id and quotation_id=p_quotation_id;
  if (v_quote.subtotal,v_quote.discount_total,v_quote.tax_total,v_quote.total) is distinct from
    (v_subtotal,v_discount,v_tax,v_subtotal-v_discount+v_tax) then raise exception 'quotation_totals_require_review'; end if;
  insert into public.orders(tenant_id,order_number,quotation_id,contact_id,company_id,opportunity_id,status,currency,
   subtotal,discount_total,tax_total,total,amount_paid,committed_at,confirmed_at,created_by,native_sales_request_key)
  values(p_tenant_id,'PED-'||upper(replace(gen_random_uuid()::text,'-','')),v_quote.id,v_quote.contact_id,v_quote.company_id,v_quote.opportunity_id,
   'confirmed',v_quote.currency,v_quote.subtotal,v_quote.discount_total,v_quote.tax_total,v_quote.total,0,p_committed_at,now(),auth.uid(),p_idempotency_key)
  returning id into v_order;
  insert into public.order_items(tenant_id,order_id,product_id,description,quantity,unit_price,line_total,personalization,design_approved)
  select tenant_id,v_order,product_id,description,quantity,unit_price,
   round(quantity*unit_price*(1-discount_percent/100)*(1+tax_rate/100),2),
   jsonb_build_object('source_quotation_item_id',id,'sku',sku_snapshot,'discount_percent',discount_percent,'tax_rate',tax_rate),false
  from public.quotation_items where tenant_id=p_tenant_id and quotation_id=p_quotation_id order by position,id;
  insert into public.production_jobs(tenant_id,order_id,status,priority,design_approved,committed_at,created_by)
   values(p_tenant_id,v_order,'blocked_design_approval',3,false,p_committed_at,auth.uid()) on conflict(tenant_id,order_id) do nothing;
  insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
   values(p_tenant_id,auth.uid(),'erp.quote.converted','order',v_order,jsonb_build_object('quotation_id',p_quotation_id));
 end if;
 insert into public.erp_sales_requests(tenant_id,idempotency_key,operation,payload,resource_id,actor_user_id)
 values(p_tenant_id,p_idempotency_key,'quote_to_order',v_payload,v_order,auth.uid());
 return v_order;
end; $$;
revoke all on function private.erp_native_convert_quote(uuid,uuid,text,timestamptz) from public,anon;
grant execute on function private.erp_native_convert_quote(uuid,uuid,text,timestamptz) to authenticated;
create function public.erp_native_convert_quote(p_tenant_id uuid,p_quotation_id uuid,p_idempotency_key text,p_committed_at timestamptz default null)
returns uuid language sql security invoker set search_path='' as $$
 select private.erp_native_convert_quote(p_tenant_id,p_quotation_id,p_idempotency_key,p_committed_at)
$$;
revoke all on function public.erp_native_convert_quote(uuid,uuid,text,timestamptz) from public,anon;
grant execute on function public.erp_native_convert_quote(uuid,uuid,text,timestamptz) to authenticated;
-- Keep the existing operations RPC compatible while removing its race.
create or replace function public.convert_quotation_to_order(p_quotation_id uuid,p_committed_at timestamptz default null)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v_tenant uuid;
begin
 select tenant_id into v_tenant from public.quotations where id=p_quotation_id;
 return private.erp_native_convert_quote(v_tenant,p_quotation_id,'quote:'||p_quotation_id::text,p_committed_at);
end; $$;
revoke all on function public.convert_quotation_to_order(uuid,timestamptz) from public,anon;
grant execute on function public.convert_quotation_to_order(uuid,timestamptz) to authenticated;

create function private.erp_native_issue_invoice(p_tenant_id uuid,p_order_id uuid,p_due_date date,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_order public.orders%rowtype; v_invoice uuid; v_payload jsonb;
 v_request public.erp_sales_requests%rowtype; v_customer jsonb; v_lines jsonb;
 v_subtotal numeric; v_discount numeric; v_tax numeric; v_line_total numeric;
begin
 if not private.erp_sales_authorized(p_tenant_id,true) then raise exception using errcode='42501',message='finance_permission_denied'; end if;
 if p_due_date is null or p_idempotency_key is null or length(btrim(p_idempotency_key)) not between 1 and 160 then raise exception 'invalid_invoice_request'; end if;
 v_payload:=jsonb_build_object('order_id',p_order_id,'due_date',p_due_date);
 perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':'||p_idempotency_key,0));
 select * into v_request from public.erp_sales_requests where tenant_id=p_tenant_id and idempotency_key=p_idempotency_key;
 if found then
  if v_request.operation<>'issue_invoice' or v_request.payload<>v_payload then raise exception 'idempotency_payload_mismatch'; end if;
  return v_request.resource_id;
 end if;
 select * into v_order from public.orders where tenant_id=p_tenant_id and id=p_order_id for update;
 if not found then raise exception 'order_not_found'; end if;
 if v_order.status='cancelled' or v_order.total<=0 or v_order.total>='Infinity'::numeric then raise exception 'order_not_invoiceable'; end if;
 select id into v_invoice from public.commercial_invoices where tenant_id=p_tenant_id and order_id=p_order_id;
 if v_invoice is null then
  if v_order.amount_paid<>0 or exists(select 1 from public.customer_payments where tenant_id=p_tenant_id and order_id=p_order_id and status<>'voided')
   then raise exception 'legacy_payments_require_reconciliation_before_invoicing'; end if;
  if v_order.total<>v_order.subtotal-v_order.discount_total+v_order.tax_total then raise exception 'order_totals_require_review'; end if;
  if exists(select 1 from public.order_items where tenant_id=p_tenant_id and order_id=p_order_id
    and (not(quantity>0 and quantity<'Infinity'::numeric)
      or not(unit_price>=0 and unit_price<'Infinity'::numeric)
      or not(line_total>=0 and line_total<'Infinity'::numeric)
      or coalesce((personalization->>'discount_percent')::numeric,0) not between 0 and 100
      or coalesce((personalization->>'tax_rate')::numeric,0) not between 0 and 100
      or line_total<>round(quantity*unit_price*(1-coalesce((personalization->>'discount_percent')::numeric,0)/100)
        *(1+coalesce((personalization->>'tax_rate')::numeric,0)/100),2)))
   then raise exception 'order_line_totals_require_review'; end if;
  select round(sum(quantity*unit_price),2),
    round(sum(quantity*unit_price*coalesce((personalization->>'discount_percent')::numeric,0)/100),2),
    round(sum(quantity*unit_price*(1-coalesce((personalization->>'discount_percent')::numeric,0)/100)
      *coalesce((personalization->>'tax_rate')::numeric,0)/100),2),sum(line_total)
    into v_subtotal,v_discount,v_tax,v_line_total
    from public.order_items where tenant_id=p_tenant_id and order_id=p_order_id;
  if v_subtotal is null or (v_order.subtotal,v_order.discount_total,v_order.tax_total,v_order.total)
    is distinct from (v_subtotal,v_discount,v_tax,v_line_total)
   then raise exception 'order_line_totals_require_review'; end if;
  select jsonb_agg(jsonb_build_object('id',id,'product_id',product_id,'description',description,'quantity',quantity::text,'unit_price',unit_price::text,'line_total',line_total::text,'details',personalization) order by created_at,id)
   into v_lines from public.order_items where tenant_id=p_tenant_id and order_id=p_order_id;
  if v_lines is null then raise exception 'order_requires_items'; end if;
  select jsonb_build_object('contact_id',c.id,'name',c.display_name,'phone',c.phone,'company_id',v_order.company_id)
   into v_customer from public.contacts c where c.tenant_id=p_tenant_id and c.id=v_order.contact_id;
  v_customer:=coalesce(v_customer,jsonb_build_object('contact_id',v_order.contact_id,'company_id',v_order.company_id,'name','Cliente'));
  insert into public.commercial_invoices(tenant_id,order_id,invoice_number,currency,subtotal,discount_total,tax_total,total,due_date,issued_by,customer_snapshot,lines_snapshot)
  values(p_tenant_id,p_order_id,'FC-'||upper(replace(gen_random_uuid()::text,'-','')),v_order.currency,v_order.subtotal,v_order.discount_total,v_order.tax_total,v_order.total,p_due_date,auth.uid(),v_customer,v_lines)
   returning id into v_invoice;
  insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
   values(p_tenant_id,auth.uid(),'erp.commercial_invoice.issued','commercial_invoice',v_invoice,jsonb_build_object('order_id',p_order_id,'fiscal',false));
 end if;
 insert into public.erp_sales_requests(tenant_id,idempotency_key,operation,payload,resource_id,actor_user_id)
 values(p_tenant_id,p_idempotency_key,'issue_invoice',v_payload,v_invoice,auth.uid());
 return v_invoice;
end; $$;
revoke all on function private.erp_native_issue_invoice(uuid,uuid,date,text) from public,anon;
grant execute on function private.erp_native_issue_invoice(uuid,uuid,date,text) to authenticated;
create function public.erp_native_issue_invoice(p_tenant_id uuid,p_order_id uuid,p_due_date date,p_idempotency_key text)
returns uuid language sql security invoker set search_path='' as $$
 select private.erp_native_issue_invoice(p_tenant_id,p_order_id,p_due_date,p_idempotency_key)
$$;
revoke all on function public.erp_native_issue_invoice(uuid,uuid,date,text) from public,anon;
grant execute on function public.erp_native_issue_invoice(uuid,uuid,date,text) to authenticated;

create function private.erp_native_record_payment(p_tenant_id uuid,p_invoice_id uuid,p_amount numeric,p_currency text,p_method text,p_reference text,p_idempotency_key text,p_human_confirmed boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_invoice public.commercial_invoices%rowtype; v_payload jsonb; v_paid numeric;
 v_request public.erp_sales_requests%rowtype; v_payment uuid; v_order uuid;
begin
 if not private.erp_sales_authorized(p_tenant_id,true) then raise exception using errcode='42501',message='finance_permission_denied'; end if;
 if p_human_confirmed is distinct from true then raise exception 'human_payment_confirmation_required'; end if;
 if p_amount is null or p_amount<=0 or p_amount>='Infinity'::numeric or p_amount<>round(p_amount,2)
 or p_method is null or length(btrim(p_method)) not between 1 and 80
 or p_reference is null or length(btrim(p_reference)) not between 1 and 160
 or p_idempotency_key is null or length(btrim(p_idempotency_key)) not between 1 and 160 then raise exception 'invalid_payment_request'; end if;
 v_payload:=jsonb_build_object('invoice_id',p_invoice_id,'amount',p_amount,'currency',p_currency,'method',p_method,'reference',p_reference);
 perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':'||p_idempotency_key,0));
 select * into v_request from public.erp_sales_requests where tenant_id=p_tenant_id and idempotency_key=p_idempotency_key;
 if found then
  if v_request.operation<>'record_payment' or v_request.payload<>v_payload then raise exception 'idempotency_payload_mismatch'; end if;
  return v_request.resource_id;
 end if;
 -- Consistent parent lock order with issuance and order mutation: order, then invoice.
 select order_id into v_order from public.commercial_invoices where tenant_id=p_tenant_id and id=p_invoice_id;
 if not found then raise exception 'commercial_invoice_not_found'; end if;
 perform 1 from public.orders where tenant_id=p_tenant_id and id=v_order for update;
 select * into v_invoice from public.commercial_invoices where tenant_id=p_tenant_id and id=p_invoice_id for update;
 if p_currency is distinct from v_invoice.currency then raise exception 'currency_mismatch'; end if;
 select coalesce(sum(amount),0) into v_paid from public.customer_payments where tenant_id=p_tenant_id and commercial_invoice_id=p_invoice_id and status='confirmed';
 if v_paid+p_amount>v_invoice.total then raise exception 'payment_exceeds_outstanding'; end if;
 insert into public.customer_payments(tenant_id,order_id,commercial_invoice_id,amount,currency,payment_method,status,reference,recorded_by)
 values(p_tenant_id,v_order,p_invoice_id,p_amount,p_currency,p_method,'confirmed',p_reference,auth.uid()) returning id into v_payment;
 update public.orders set amount_paid=v_paid+p_amount where tenant_id=p_tenant_id and id=v_order;
 insert into public.erp_sales_requests(tenant_id,idempotency_key,operation,payload,resource_id,actor_user_id)
 values(p_tenant_id,p_idempotency_key,'record_payment',v_payload,v_payment,auth.uid());
 insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
 values(p_tenant_id,auth.uid(),'erp.commercial_payment.recorded','customer_payment',v_payment,jsonb_build_object('invoice_id',p_invoice_id,'amount',p_amount,'currency',p_currency));
 return v_payment;
end; $$;
revoke all on function private.erp_native_record_payment(uuid,uuid,numeric,text,text,text,text,boolean) from public,anon;
grant execute on function private.erp_native_record_payment(uuid,uuid,numeric,text,text,text,text,boolean) to authenticated;
create function public.erp_native_record_payment(p_tenant_id uuid,p_invoice_id uuid,p_amount numeric,p_currency text,p_method text,p_reference text,p_idempotency_key text,p_human_confirmed boolean)
returns uuid language sql security invoker set search_path='' as $$
 select private.erp_native_record_payment(p_tenant_id,p_invoice_id,p_amount,p_currency,p_method,p_reference,p_idempotency_key,p_human_confirmed)
$$;
revoke all on function public.erp_native_record_payment(uuid,uuid,numeric,text,text,text,text,boolean) from public,anon;
grant execute on function public.erp_native_record_payment(uuid,uuid,numeric,text,text,text,text,boolean) to authenticated;

create view public.commercial_invoice_balances with(security_invoker=true) as
 select i.*,coalesce(p.paid,0)::numeric(18,2) as amount_paid,
 (i.total-coalesce(p.paid,0))::numeric(18,2) as outstanding,
 (i.due_date<current_date and i.total>coalesce(p.paid,0)) as overdue
 from public.commercial_invoices i left join lateral (
  select sum(amount) as paid from public.customer_payments cp
   where cp.tenant_id=i.tenant_id and cp.commercial_invoice_id=i.id and cp.status='confirmed'
 ) p on true;
revoke all on public.commercial_invoice_balances from public,anon;
grant select on public.commercial_invoice_balances to authenticated;

notify pgrst,'reload schema';

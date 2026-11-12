-- Synthetic customer-sales regression. Always rolls back; never run against customer rows.
begin;
create function pg_temp.sales_assert(v boolean,label text) returns void language plpgsql as $$
begin if v is distinct from true then raise exception 'sales assertion failed: %',label; end if; end$$;
create function pg_temp.sales_throws(statement text,expected text) returns void language plpgsql as $$
begin
 begin execute statement;
 exception when others then
  if position(expected in sqlerrm)>0 then return; end if;
  raise exception 'expected %, received %',expected,sqlerrm;
 end;
 raise exception 'expected error %',expected;
end$$;

insert into auth.users(id) values
 ('da000000-0000-4000-8000-000000000001'),('da000000-0000-4000-8000-000000000002'),('da000000-0000-4000-8000-000000000003');
insert into public.tenants(id,name,slug,owner_user_id) values
 ('db000000-0000-4000-8000-000000000001','Synthetic sales A','synthetic-sales-a','da000000-0000-4000-8000-000000000001'),
 ('db000000-0000-4000-8000-000000000002','Synthetic sales B','synthetic-sales-b','da000000-0000-4000-8000-000000000002');
insert into public.memberships(tenant_id,user_id,role) values
 ('db000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000001','owner'),
 ('db000000-0000-4000-8000-000000000002','da000000-0000-4000-8000-000000000002','owner'),
 ('db000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000003','agent');
insert into public.contacts(id,tenant_id,display_name) values
 ('dc000000-0000-4000-8000-000000000001','db000000-0000-4000-8000-000000000001','Synthetic customer');
insert into public.quotations(id,tenant_id,quote_number,contact_id,status,currency,subtotal,total) values
 ('dd000000-0000-4000-8000-000000000001','db000000-0000-4000-8000-000000000001','Q-SYNTHETIC-1','dc000000-0000-4000-8000-000000000001','accepted','DOP',100.10,100.10),
 ('dd000000-0000-4000-8000-000000000002','db000000-0000-4000-8000-000000000001','Q-SYNTHETIC-DRAFT',null,'draft','DOP',10,10);
insert into public.quotation_items(tenant_id,quotation_id,position,description,quantity,unit_price) values
 ('db000000-0000-4000-8000-000000000001','dd000000-0000-4000-8000-000000000001',1,'Synthetic decimal line',1,100.10),
 ('db000000-0000-4000-8000-000000000001','dd000000-0000-4000-8000-000000000002',1,'Unapproved line',1,10);

set local role authenticated;
set local request.jwt.claims='{"sub":"da000000-0000-4000-8000-000000000001","role":"authenticated"}';
select public.erp_native_convert_quote('db000000-0000-4000-8000-000000000001','dd000000-0000-4000-8000-000000000001','sales-conversion',null) as order_id \gset
select pg_temp.sales_assert(public.erp_native_convert_quote('db000000-0000-4000-8000-000000000001','dd000000-0000-4000-8000-000000000001','sales-conversion',null)=:'order_id'::uuid,'repeated conversion returns same order');
select pg_temp.sales_assert((select count(*)=1 from public.orders where quotation_id='dd000000-0000-4000-8000-000000000001'),'one order per quotation');
select pg_temp.sales_assert((select count(*)=1 from public.order_items where order_id=:'order_id'),'persisted order lines');
select pg_temp.sales_throws($q$select public.erp_native_convert_quote('db000000-0000-4000-8000-000000000001','dd000000-0000-4000-8000-000000000002','sales-conversion',null)$q$,'idempotency_payload_mismatch');
select pg_temp.sales_throws($q$select public.erp_native_convert_quote('db000000-0000-4000-8000-000000000001','dd000000-0000-4000-8000-000000000002','sales-draft',null)$q$,'quotation_requires_human_acceptance');
select pg_temp.sales_throws($q$update public.quotation_items set quantity=2 where quotation_id='dd000000-0000-4000-8000-000000000001'$q$,'converted_quotation_is_immutable');
update public.order_items set unit_price=1 where order_id=:'order_id';
select pg_temp.sales_throws(format('select public.erp_native_issue_invoice(%L,%L,%L,%L)','db000000-0000-4000-8000-000000000001',:'order_id','2026-01-01','sales-bad-lines'),'order_line_totals_require_review');
update public.order_items set unit_price=100.10 where order_id=:'order_id';
select public.erp_native_issue_invoice('db000000-0000-4000-8000-000000000001',:'order_id','2026-01-01','sales-invoice') as invoice_id \gset
select pg_temp.sales_assert(public.erp_native_issue_invoice('db000000-0000-4000-8000-000000000001',:'order_id','2026-01-01','sales-invoice')=:'invoice_id'::uuid,'repeated issue returns same immutable invoice');
select pg_temp.sales_assert((select total=100.10 and amount_paid=0 and outstanding=100.10 and overdue from public.commercial_invoice_balances where id=:'invoice_id'),'initial decimal AR and overdue');
select pg_temp.sales_throws(format('update public.orders set total=1 where id=%L',:'order_id'),'invoiced_order_totals_are_immutable');
select pg_temp.sales_throws(format('update public.order_items set quantity=2 where order_id=%L',:'order_id'),'invoiced_order_lines_are_immutable');
select pg_temp.sales_throws(format('select public.erp_native_record_payment(%L,%L,30.03,%L,%L,%L,%L,false)','db000000-0000-4000-8000-000000000001',:'invoice_id','DOP','transfer','evidence-1','payment-false'),'human_payment_confirmation_required');
select pg_temp.sales_throws(format('select public.erp_native_record_payment(%L,%L,30.03,%L,%L,%L,%L,true)','db000000-0000-4000-8000-000000000001',:'invoice_id','USD','transfer','evidence-1','payment-currency'),'currency_mismatch');
select public.erp_native_record_payment('db000000-0000-4000-8000-000000000001',:'invoice_id',30.03,'DOP','transfer','synthetic-evidence-1','sales-partial',true) as payment_id \gset
select pg_temp.sales_assert(public.erp_native_record_payment('db000000-0000-4000-8000-000000000001',:'invoice_id',30.03,'DOP','transfer','synthetic-evidence-1','sales-partial',true)=:'payment_id'::uuid,'repeated payment is not duplicated');
select pg_temp.sales_assert((select amount_paid=30.03 and outstanding=70.07 from public.commercial_invoice_balances where id=:'invoice_id'),'partial decimal payment');
select pg_temp.sales_throws(format('select public.erp_native_record_payment(%L,%L,70.08,%L,%L,%L,%L,true)','db000000-0000-4000-8000-000000000001',:'invoice_id','DOP','transfer','synthetic-overpayment','sales-overpay'),'payment_exceeds_outstanding');
select pg_temp.sales_throws(format('update public.orders set amount_paid=100 where id=%L',:'order_id'),'use_commercial_payment_transaction');
select pg_temp.sales_throws(format('insert into public.customer_payments(tenant_id,order_id,amount) values(%L,%L,1)','db000000-0000-4000-8000-000000000001',:'order_id'),'permission denied');
select public.erp_native_record_payment('db000000-0000-4000-8000-000000000001',:'invoice_id',70.07,'DOP','transfer','synthetic-evidence-2','sales-final',true);
select pg_temp.sales_assert((select amount_paid=100.10 and outstanding=0 and not overdue from public.commercial_invoice_balances where id=:'invoice_id'),'fully paid AR');
select pg_temp.sales_assert((select amount_paid=100.10 from public.orders where id=:'order_id'),'order paid projection updated atomically');

set local request.jwt.claims='{"sub":"da000000-0000-4000-8000-000000000002","role":"authenticated"}';
select pg_temp.sales_assert((select count(*)=0 from public.commercial_invoice_balances where id=:'invoice_id'),'cross-tenant read isolation');
select pg_temp.sales_throws(format('select public.erp_native_record_payment(%L,%L,1,%L,%L,%L,%L,true)','db000000-0000-4000-8000-000000000001',:'invoice_id','DOP','transfer','cross','sales-cross'),'finance_permission_denied');
set local request.jwt.claims='{"sub":"da000000-0000-4000-8000-000000000003","role":"authenticated"}';
select pg_temp.sales_throws(format('select public.erp_native_issue_invoice(%L,%L,%L,%L)','db000000-0000-4000-8000-000000000001',:'order_id','2026-01-01','agent-issue'),'finance_permission_denied');
set local request.jwt.claims='{"sub":"da000000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"actor_type":"agent"}}';
select pg_temp.sales_throws(format('select public.erp_native_record_payment(%L,%L,1,%L,%L,%L,%L,true)','db000000-0000-4000-8000-000000000001',:'invoice_id','DOP','transfer','ai','sales-ai'),'finance_permission_denied');
reset role;
select pg_temp.sales_throws(format('update public.commercial_invoices set total=1 where id=%L',:'invoice_id'),'issued_document_is_immutable');
select pg_temp.sales_throws(format('delete from public.customer_payments where id=%L',:'payment_id'),'issued_document_is_immutable');
rollback;

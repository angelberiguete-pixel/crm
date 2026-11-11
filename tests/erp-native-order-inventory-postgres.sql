-- Synthetic only. Like Odoo assignment/completion, allocation and physical stock
-- are distinct; no original Odoo source is copied. Always roll back fixtures.
begin;
create function pg_temp.fulfill_assert(v boolean,label text) returns void language plpgsql as $$
begin if v is distinct from true then raise exception 'fulfillment assertion failed: %',label; end if; end$$;
create function pg_temp.fulfill_throws(statement text,expected text) returns void language plpgsql as $$
begin
 begin execute statement;
 exception when others then
  if position(expected in sqlerrm)>0 then return; end if;
  raise exception 'expected %, received %',expected,sqlerrm;
 end;
 raise exception 'expected error %',expected;
end$$;
insert into auth.users(id) values
 ('fa000000-0000-4000-8000-000000000001'),('fa000000-0000-4000-8000-000000000002'),('fa000000-0000-4000-8000-000000000003');
insert into public.tenants(id,name,slug,owner_user_id) values
 ('fb000000-0000-4000-8000-000000000001','Synthetic fulfillment A','synthetic-fulfillment-a','fa000000-0000-4000-8000-000000000001'),
 ('fb000000-0000-4000-8000-000000000002','Synthetic fulfillment B','synthetic-fulfillment-b','fa000000-0000-4000-8000-000000000002');
insert into public.memberships(tenant_id,user_id,role) values
 ('fb000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000001','owner'),
 ('fb000000-0000-4000-8000-000000000002','fa000000-0000-4000-8000-000000000002','owner'),
 ('fb000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000003','viewer');
insert into public.products(id,tenant_id,sku,name) values
 ('fc000000-0000-4000-8000-000000000001','fb000000-0000-4000-8000-000000000001','ALLOC-GOOD','Synthetic good'),
 ('fc000000-0000-4000-8000-000000000003','fb000000-0000-4000-8000-000000000001','ALLOC-EMPTY','Synthetic empty good');
insert into public.inventory_items(id,tenant_id,sku,name,product_id,on_hand) values
 ('fd000000-0000-4000-8000-000000000001','fb000000-0000-4000-8000-000000000001','ALLOC-GOOD','Synthetic good','fc000000-0000-4000-8000-000000000001',12),
 ('fd000000-0000-4000-8000-000000000003','fb000000-0000-4000-8000-000000000001','ALLOC-EMPTY','Synthetic empty good','fc000000-0000-4000-8000-000000000003',0);
insert into public.orders(id,tenant_id,order_number,status) values
 ('fe000000-0000-4000-8000-000000000001','fb000000-0000-4000-8000-000000000001','ALLOC-ORDER-1','confirmed'),
 ('fe000000-0000-4000-8000-000000000002','fb000000-0000-4000-8000-000000000001','ALLOC-ORDER-2','confirmed'),
 ('fe000000-0000-4000-8000-000000000003','fb000000-0000-4000-8000-000000000001','ALLOC-ORDER-3','confirmed');
insert into public.order_items(tenant_id,order_id,product_id,description,quantity) values
 ('fb000000-0000-4000-8000-000000000001','fe000000-0000-4000-8000-000000000001','fc000000-0000-4000-8000-000000000001','Synthetic 4 units',4),
 ('fb000000-0000-4000-8000-000000000001','fe000000-0000-4000-8000-000000000002','fc000000-0000-4000-8000-000000000001','Synthetic 5 units',5),
 ('fb000000-0000-4000-8000-000000000001','fe000000-0000-4000-8000-000000000003','fc000000-0000-4000-8000-000000000001','Synthetic first line',2),
 ('fb000000-0000-4000-8000-000000000001','fe000000-0000-4000-8000-000000000003','fc000000-0000-4000-8000-000000000003','Synthetic insufficient second line',2);
insert into public.production_jobs(tenant_id,order_id,status) values('fb000000-0000-4000-8000-000000000001','fe000000-0000-4000-8000-000000000001','blocked_design_approval');
insert into public.deliveries(tenant_id,order_id,status) values('fb000000-0000-4000-8000-000000000001','fe000000-0000-4000-8000-000000000001','pending');
set local role authenticated;
set local request.jwt.claims='{"sub":"fa000000-0000-4000-8000-000000000001","role":"authenticated"}';
select public.erp_order_inventory_command('fb000000-0000-4000-8000-000000000001','fe000000-0000-4000-8000-000000000001','reserve','allocate-1') as allocation_result \gset
select pg_temp.fulfill_assert((select reserved=4 and on_hand=12 from public.inventory_items where id='fd000000-0000-4000-8000-000000000001'),'reserve does not consume physical stock');
select pg_temp.fulfill_assert(public.erp_order_inventory_command('fb000000-0000-4000-8000-000000000001','fe000000-0000-4000-8000-000000000001','reserve','allocate-1')=:'allocation_result'::jsonb,'allocation retry is idempotent');
select pg_temp.fulfill_throws($q$select public.erp_order_inventory_command('fb000000-0000-4000-8000-000000000001','fe000000-0000-4000-8000-000000000001','release','allocate-1')$q$,'idempotency_payload_mismatch');
select pg_temp.fulfill_throws($q$select public.erp_inventory_move('fb000000-0000-4000-8000-000000000001','fd000000-0000-4000-8000-000000000001','release',4,'steal-reservation')$q$,'stock_reserved_for_order');
select pg_temp.fulfill_throws($q$select public.erp_inventory_move('fb000000-0000-4000-8000-000000000001','fd000000-0000-4000-8000-000000000001','consume',4,'steal-consumption')$q$,'stock_reserved_for_order');
select pg_temp.fulfill_throws($q$update public.order_items set quantity=1 where order_id='fe000000-0000-4000-8000-000000000001'$q$,'allocated_order_lines_are_immutable');
select pg_temp.fulfill_throws($q$update public.orders set status='cancelled' where id='fe000000-0000-4000-8000-000000000001'$q$,'release_inventory_before_cancellation');
select pg_temp.fulfill_throws($q$select public.erp_inventory_item_save('fb000000-0000-4000-8000-000000000001','fd000000-0000-4000-8000-000000000001','{"active":false}','deactivate-allocated')$q$,'release_allocations_before_deactivation');
select pg_temp.fulfill_throws($q$update public.products set metadata='{"erp_stock_policy":"service"}' where id='fc000000-0000-4000-8000-000000000001'$q$,'allocated_product_policy_is_immutable');
select pg_temp.fulfill_throws($q$select public.erp_order_inventory_command('fb000000-0000-4000-8000-000000000001','fe000000-0000-4000-8000-000000000001','ship','not-ready')$q$,'order_not_ready_for_delivery');
set local request.jwt.claims='{"sub":"fa000000-0000-4000-8000-000000000002","role":"authenticated"}';
select pg_temp.fulfill_assert((select count(*)=0 from public.order_inventory_allocations),'tenant B cannot see allocations A');
select pg_temp.fulfill_throws($q$select public.erp_order_inventory_command('fb000000-0000-4000-8000-000000000001','fe000000-0000-4000-8000-000000000001','release','cross-tenant')$q$,'inventory_access_denied');
set local request.jwt.claims='{"sub":"fa000000-0000-4000-8000-000000000003","role":"authenticated"}';
select pg_temp.fulfill_throws($q$select public.erp_order_inventory_command('fb000000-0000-4000-8000-000000000001','fe000000-0000-4000-8000-000000000001','ship','viewer-ship')$q$,'inventory_access_denied');
set local request.jwt.claims='{"sub":"fa000000-0000-4000-8000-000000000001","role":"authenticated"}';
select pg_temp.fulfill_throws($q$update public.orders set status='delivered' where id='fe000000-0000-4000-8000-000000000001'$q$,'use_order_inventory_transaction');
select pg_temp.fulfill_throws($q$update public.deliveries set status='delivered' where order_id='fe000000-0000-4000-8000-000000000001'$q$,'use_order_inventory_transaction');
update public.orders set status='ready_for_delivery' where id='fe000000-0000-4000-8000-000000000001';
select pg_temp.fulfill_throws($q$select public.erp_order_inventory_command('fb000000-0000-4000-8000-000000000001','fe000000-0000-4000-8000-000000000001','ship','unapproved-quality')$q$,'production_quality_approval_required');
update public.production_jobs set status='completed',design_approved=true,quality_control_status='passed' where order_id='fe000000-0000-4000-8000-000000000001';
select public.erp_order_inventory_command('fb000000-0000-4000-8000-000000000001','fe000000-0000-4000-8000-000000000001','ship','ship-1') as shipment_result \gset
select pg_temp.fulfill_assert((select on_hand=8 and reserved=0 from public.inventory_items where id='fd000000-0000-4000-8000-000000000001'),'shipping consumes exactly allocated stock');
select pg_temp.fulfill_assert((select status='delivered' and delivered_at is not null from public.orders where id='fe000000-0000-4000-8000-000000000001'),'order updated atomically');
select pg_temp.fulfill_assert((select status='delivered' from public.deliveries where order_id='fe000000-0000-4000-8000-000000000001'),'delivery updated atomically');
select pg_temp.fulfill_assert(public.erp_order_inventory_command('fb000000-0000-4000-8000-000000000001','fe000000-0000-4000-8000-000000000001','ship','ship-1')=:'shipment_result'::jsonb,'shipment retry never consumes twice');
select pg_temp.fulfill_throws($q$select public.erp_order_inventory_command('fb000000-0000-4000-8000-000000000001','fe000000-0000-4000-8000-000000000001','ship','ship-again')$q$,'order_already_delivered');
select pg_temp.fulfill_throws($q$select public.erp_order_inventory_command('fb000000-0000-4000-8000-000000000001','fe000000-0000-4000-8000-000000000003','reserve','partial-failure')$q$,'insufficient_stock');
select pg_temp.fulfill_assert((select reserved=0 from public.inventory_items where id='fd000000-0000-4000-8000-000000000001'),'failed second line rolls back first line stock');
select pg_temp.fulfill_assert((select count(*)=0 from public.order_inventory_allocations where order_id='fe000000-0000-4000-8000-000000000003'),'failed order leaves no partial allocation');
select public.erp_order_inventory_command('fb000000-0000-4000-8000-000000000001','fe000000-0000-4000-8000-000000000002','reserve','allocate-2');
select public.erp_order_inventory_command('fb000000-0000-4000-8000-000000000001','fe000000-0000-4000-8000-000000000002','release','release-2');
select pg_temp.fulfill_assert((select reserved=0 and on_hand=8 from public.inventory_items where id='fd000000-0000-4000-8000-000000000001'),'release restores availability without changing physical stock');
select pg_temp.fulfill_throws($q$update public.order_inventory_allocations set reserved_quantity=0$q$,'permission denied');
reset role;
rollback;

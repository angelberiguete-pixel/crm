-- Disposable fixture data only; every row and DDL helper is rolled back.
begin;
create function pg_temp.erp_assert(p_ok boolean,p_label text) returns void language plpgsql as $$
begin if not coalesce(p_ok,false) then raise exception 'ASSERT: %',p_label; end if; end $$;
create function pg_temp.erp_throws(p_sql text,p_code text,p_message text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlstate<>p_code or position(p_message in sqlerrm)=0 then raise; end if;
    return;
  end;
  raise exception 'Expected exception %: %',p_code,p_message;
end $$;
insert into auth.users(id) values('81000000-0000-4000-8000-000000000001'),('81000000-0000-4000-8000-000000000002');
insert into public.tenants(id,name,slug,owner_user_id) values
 ('82000000-0000-4000-8000-000000000001','Synthetic Inventory A','synthetic-inventory-a','81000000-0000-4000-8000-000000000001'),
 ('82000000-0000-4000-8000-000000000002','Synthetic Inventory B','synthetic-inventory-b','81000000-0000-4000-8000-000000000002');
insert into public.memberships(tenant_id,user_id,role,status) values
 ('82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','owner','active'),
 ('82000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000002','owner','active');
insert into private.user_active_tenants(user_id,tenant_id) values
 ('81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001'),
 ('81000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000002');
insert into public.inventory_items(id,tenant_id,sku,name,on_hand,reserved) values
 ('83000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000002','OTHER','Other company',3,0);
set local role authenticated;
set local request.jwt.claims='{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated"}';
do $$
declare
 t uuid:='82000000-0000-4000-8000-000000000001';
 other_t uuid:='82000000-0000-4000-8000-000000000002';
 i uuid; wh uuid; r jsonb; replay jsonb; updated jsonb;
begin
 r:=public.erp_inventory_item_save(t,null,'{"sku":"SYN-01","name":"Synthetic item","category":"Test","reorder_level":2,"cost_per_unit":12.3456}','inv:create');
 i:=(r->>'id')::uuid;
 perform set_config('erp_test.inventory_item',i::text,true);
 perform pg_temp.erp_assert(r->>'category'='Test','metadata creation');
 replay:=public.erp_inventory_item_save(t,null,'{"sku":"SYN-01","name":"Synthetic item","category":"Test","reorder_level":2,"cost_per_unit":12.3456}','inv:create');
 perform pg_temp.erp_assert(r=replay,'item creation replay returns original');
 updated:=public.erp_inventory_item_save(t,i,'{"name":"Updated synthetic item"}','inv:edit');
 perform pg_temp.erp_assert(updated->>'name'='Updated synthetic item','metadata update');
 perform pg_temp.erp_throws(format('select public.erp_inventory_item_save(%L,null,%L,%L)',t,'{"sku":"DIFFERENT","name":"Changed"}','inv:create'),'22023','idempotency_conflict');
 perform pg_temp.erp_throws(format('select public.erp_inventory_item_save(%L,%L,%L,%L)',t,i,'{"on_hand":100}','inv:bypass'),'22023','invalid_inventory_item_request');
 perform pg_temp.erp_throws(format('select public.erp_inventory_move(%L,%L,''entry'',1,''inv:other'')',other_t,i),'42501','inventory_access_denied');
 perform pg_temp.erp_throws(format('select public.erp_inventory_move(%L,%L,''entry'',1,''inv:foreign-item'')',t,'83000000-0000-4000-8000-000000000002'),'22023','inventory_item_unavailable');
 perform pg_temp.erp_assert((select count(*)=0 from public.inventory_items where tenant_id=other_t),'other tenant rows hidden by RLS');
 r:=public.erp_inventory_move(t,i,'entry',10,'inv:opening');
 replay:=public.erp_inventory_move(t,i,'entry',10,'inv:opening');
 perform pg_temp.erp_assert(r=replay,'movement retry returns exact original result');
 perform pg_temp.erp_assert((select on_hand=10 from public.inventory_items where id=i),'retry changes stock once');
 perform pg_temp.erp_throws(format('select public.erp_inventory_move(%L,%L,''entry'',11,''inv:opening'')',t,i),'22023','idempotency_conflict');
 perform public.erp_inventory_move(t,i,'reserve',3,'inv:reserve');
 perform pg_temp.erp_throws(format('select public.erp_inventory_move(%L,%L,''exit'',8,''inv:negative'')',t,i),'23514','insufficient_stock');
 perform pg_temp.erp_assert((select count(*)=0 from public.inventory_operations where tenant_id=t and idempotency_key='inv:negative'),'failed stock operation rolled back');
 perform public.erp_inventory_move(t,i,'exit',2,'inv:exit');
 perform public.erp_inventory_move(t,i,'release',1,'inv:release');
 perform public.erp_inventory_move(t,i,'consume',1,'inv:consume');
 perform pg_temp.erp_assert((select on_hand=7 and reserved=1 from public.inventory_items where id=i),'entry exit reserve release consume balances');
 wh:=(public.erp_inventory_warehouse_create(t,'SECOND','Synthetic secondary','inv:warehouse')->>'id')::uuid;
 r:=public.erp_inventory_move(t,i,'transfer',4,'inv:transfer',null,wh);
 perform pg_temp.erp_assert(jsonb_array_length(r->'movement_ids')=2,'transfer has paired ledger rows');
 perform pg_temp.erp_assert((select on_hand=7 and reserved=1 from public.inventory_items where id=i),'transfer conserves aggregate stock');
 perform pg_temp.erp_assert((select on_hand=4 and reserved=0 from public.inventory_stock_locations where inventory_item_id=i and warehouse_id=wh),'destination stock received');
 perform pg_temp.erp_assert((select sum(on_hand)=7 and sum(reserved)=1 from public.inventory_stock_locations where inventory_item_id=i),'location totals reconcile');
 perform pg_temp.erp_throws(format('select public.erp_inventory_move(%L,%L,''transfer'',3,''inv:reserved-transfer'',null,%L)',t,i,wh),'23514','insufficient_stock');
 perform pg_temp.erp_throws(format('select public.erp_inventory_move(%L,%L,''entry'',''NaN''::numeric,''inv:nan'')',t,i),'22023','invalid_inventory_movement');
 perform pg_temp.erp_throws(format('select public.erp_inventory_move(%L,%L,''entry'',0.0000001,''inv:precision'')',t,i),'22023','invalid_inventory_movement');
 perform pg_temp.erp_throws(format('select public.erp_inventory_move(%L,%L,''entry'',1,'' '')',t,i),'22023','missing_idempotency_key');
 perform pg_temp.erp_throws(format('update public.inventory_items set on_hand=100 where id=%L',i),'42501','permission denied');
 perform pg_temp.erp_throws(format('delete from public.inventory_movements where inventory_item_id=%L',i),'42501','permission denied');
end $$;
reset role;
-- Even the trusted database writer must reverse through a new movement, not edit the ledger.
select pg_temp.erp_throws('update public.inventory_movements set quantity=999 where inventory_item_id=current_setting(''erp_test.inventory_item'')::uuid','55000','inventory_ledger_immutable');
-- Active-context and AI actors cannot invoke mutation endpoints.
set local role authenticated;
set local request.jwt.claims='{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"actor_type":"ai"}}';
select pg_temp.erp_throws('select public.erp_inventory_move(''82000000-0000-4000-8000-000000000001'',current_setting(''erp_test.inventory_item'')::uuid,''entry'',1,''inv:ai'')','42501','inventory_access_denied');
reset role;
update private.user_active_tenants set tenant_id='82000000-0000-4000-8000-000000000002' where user_id='81000000-0000-4000-8000-000000000001';
set local role authenticated;
set local request.jwt.claims='{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated"}';
select pg_temp.erp_throws('select public.erp_inventory_move(''82000000-0000-4000-8000-000000000001'',current_setting(''erp_test.inventory_item'')::uuid,''entry'',1,''inv:context'')','42501','inventory_access_denied');
reset role;
rollback;

-- Pre-use rollback only. Never discard recorded operations or new client metadata.
-- If already used: revoke EXECUTE on public RPCs, retain balances/ledger and restore
-- application traffic to the prior release; plan a reviewed forward correction.
begin;
lock table public.inventory_items,public.inventory_movements,public.inventory_warehouses,
  public.inventory_stock_locations,public.inventory_operations in access exclusive mode;
do $$ begin
 if exists(select 1 from public.inventory_operations)
   or exists(select 1 from public.inventory_stock_locations)
   or exists(select 1 from public.inventory_warehouses)
   or exists(select 1 from public.inventory_items where category is not null or product_id is not null)
   or exists(select 1 from public.inventory_movements where operation_id is not null or warehouse_id is not null) then
   raise exception 'rollback_refused_inventory_already_used: preserve ledger; use a reviewed forward correction';
 end if;
end $$;
drop trigger inventory_items_native_write_guard on public.inventory_items;
drop trigger inventory_movements_native_write_guard on public.inventory_movements;
drop trigger inventory_movements_native_immutable on public.inventory_movements;
drop policy inventory_items_active_context on public.inventory_items;
drop policy inventory_movements_active_context on public.inventory_movements;
alter table public.inventory_movements drop constraint inventory_movements_native_finite;
alter table public.inventory_items drop constraint inventory_items_native_finite;
alter table public.inventory_movements drop column operation_id;
alter table public.inventory_movements drop column warehouse_id;
drop table public.inventory_operations;
drop table public.inventory_stock_locations;
drop table public.inventory_warehouses;
alter table public.inventory_items drop column product_id;
alter table public.inventory_items drop column category;
drop function public.erp_inventory_move(uuid,uuid,text,numeric,text,uuid,uuid,uuid,numeric,text);
drop function public.erp_inventory_item_save(uuid,uuid,jsonb,text);
drop function public.erp_inventory_warehouse_create(uuid,text,text,text);
drop function private.erp_inventory_move(uuid,uuid,text,numeric,text,uuid,uuid,uuid,numeric,text);
drop function private.erp_inventory_item_save(uuid,uuid,jsonb,text);
drop function private.erp_inventory_warehouse_create(uuid,text,text,text);
drop function private.erp_inventory_authorize(uuid);
drop function private.erp_inventory_write_guard();
drop function private.erp_inventory_immutable_guard();
-- Exact prior inventory grants observed on the primary catalog, 2026-11-11.
grant select,insert,update,delete on public.inventory_items,public.inventory_movements to authenticated;
grant all on public.inventory_items,public.inventory_movements to service_role;
notify pgrst,'reload schema';
commit;

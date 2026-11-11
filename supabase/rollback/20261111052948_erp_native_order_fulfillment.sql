-- Pre-use only; retain every allocation/request once the module has been used.
begin;
lock table public.orders,public.order_inventory_allocations,public.order_inventory_requests in access exclusive mode;
do $$begin
 if exists(select 1 from public.order_inventory_allocations) or exists(select 1 from public.order_inventory_requests)
   or exists(select 1 from public.orders where native_inventory_managed) then
   raise exception 'rollback_refused_fulfillment_already_used'; end if;
end$$;
drop trigger order_inventory_lines_guard on public.order_items;
drop trigger order_inventory_header_guard on public.orders;
drop trigger order_inventory_delivery_guard on public.deliveries;
drop trigger order_inventory_product_guard on public.inventory_items;
drop trigger order_inventory_policy_guard on public.products;
drop trigger order_allocation_floor on public.inventory_stock_locations;
drop function public.erp_order_inventory_command(uuid,uuid,text,text,uuid);
drop function private.erp_order_inventory_command(uuid,uuid,text,text,uuid);
drop function private.erp_order_inventory_guard();
drop function private.erp_order_allocation_floor();
drop table public.order_inventory_requests;
drop table public.order_inventory_allocations;
drop index public.inventory_items_one_product;
alter table public.orders drop column native_inventory_managed;
notify pgrst,'reload schema';
commit;

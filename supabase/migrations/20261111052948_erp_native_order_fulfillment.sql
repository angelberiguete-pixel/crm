-- Independently implemented native order allocation/fulfillment. Reference patterns:
-- Odoo 20 stock.quant availability, stock.move assignment/completion and sale_stock.
-- No Odoo/Dolibarr source is copied or executed. See THIRD_PARTY_NOTICES.md.
alter table public.orders add column native_inventory_managed boolean not null default false;
-- Fail safely on ambiguous historical mappings; never choose an arbitrary SKU.
create unique index inventory_items_one_product on public.inventory_items(tenant_id,product_id) where product_id is not null;
create table public.order_inventory_allocations (
  tenant_id uuid not null,
  order_id uuid not null,
  inventory_item_id uuid not null,
  warehouse_id uuid not null,
  reserved_quantity numeric(18,6) not null default 0 check(reserved_quantity>=0 and reserved_quantity<'Infinity'::numeric),
  shipped_quantity numeric(18,6) not null default 0 check(shipped_quantity>=0 and shipped_quantity<'Infinity'::numeric),
  updated_at timestamptz not null default now(),
  primary key(tenant_id,order_id,inventory_item_id),
  foreign key(tenant_id,order_id) references public.orders(tenant_id,id),
  foreign key(tenant_id,inventory_item_id) references public.inventory_items(tenant_id,id),
  foreign key(tenant_id,warehouse_id) references public.inventory_warehouses(tenant_id,id)
);
create index order_inventory_allocations_location on public.order_inventory_allocations(tenant_id,inventory_item_id,warehouse_id);
create table public.order_inventory_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  idempotency_key text not null check(length(btrim(idempotency_key)) between 1 and 160),
  request jsonb not null,
  result jsonb not null,
  actor_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(tenant_id,idempotency_key)
);
alter table public.order_inventory_allocations enable row level security;
alter table public.order_inventory_requests enable row level security;
revoke all on public.order_inventory_allocations,public.order_inventory_requests from public,anon,authenticated,service_role;
grant select on public.order_inventory_allocations,public.order_inventory_requests to authenticated;
create policy order_inventory_allocations_read on public.order_inventory_allocations for select to authenticated
 using(private.has_tenant_access(tenant_id) and private.crm_active_tenant_matches(tenant_id));
create policy order_inventory_requests_read on public.order_inventory_requests for select to authenticated
 using(private.has_tenant_access(tenant_id) and private.crm_active_tenant_matches(tenant_id));

create function private.erp_order_inventory_command(p_tenant_id uuid,p_order_id uuid,p_action text,p_idempotency_key text,p_warehouse_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_order public.orders%rowtype; v_saved public.order_inventory_requests%rowtype;
 v_row record; v_alloc public.order_inventory_allocations%rowtype;
 v_payload jsonb; v_result jsonb; v_move jsonb; v_warehouse uuid;
 v_id uuid:=gen_random_uuid(); v_delivery uuid; v_delta numeric;
begin
 perform private.erp_inventory_authorize(p_tenant_id);
 if p_action is null or p_action not in ('reserve','release','ship') or p_idempotency_key is null
   or length(btrim(p_idempotency_key)) not between 1 and 160 then
   raise exception using errcode='22023',message='invalid_order_inventory_request'; end if;
 v_payload:=jsonb_build_object('order_id',p_order_id,'action',p_action,'warehouse_id',p_warehouse_id);
 perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':order-inventory:'||p_idempotency_key,0));
 select * into v_saved from public.order_inventory_requests where tenant_id=p_tenant_id and idempotency_key=p_idempotency_key;
 if found then
   if v_saved.request is distinct from v_payload then raise exception 'idempotency_payload_mismatch'; end if;
   return v_saved.result;
 end if;
 select * into v_order from public.orders where tenant_id=p_tenant_id and id=p_order_id for update;
 if not found then raise exception 'order_not_found'; end if;
 if v_order.status='delivered' then raise exception 'order_already_delivered'; end if;
 if p_action<>'release' and v_order.status='cancelled' then raise exception 'cancelled_order_inventory_forbidden'; end if;
 -- Catalog locks precede item locks. Every participating product uses one order.
 perform 1 from public.products p where p.tenant_id=p_tenant_id and p.id in
   (select product_id from public.order_items where tenant_id=p_tenant_id and order_id=p_order_id)
   order by p.id for share;
 if p_action<>'release' then
   if not exists(select 1 from public.order_items where tenant_id=p_tenant_id and order_id=p_order_id) then raise exception 'order_requires_items'; end if;
   if exists(select 1 from public.order_items l left join public.products p on p.tenant_id=l.tenant_id and p.id=l.product_id
     where l.tenant_id=p_tenant_id and l.order_id=p_order_id
       and (p.id is null or not(l.quantity>0 and l.quantity<1000000000000 and l.quantity=round(l.quantity,6))
         or (coalesce(p.metadata->>'erp_stock_policy','stock')<>'service' and
           (select count(*) from public.inventory_items i where i.tenant_id=l.tenant_id and i.product_id=l.product_id and i.active)<>1))) then
     raise exception 'order_inventory_mapping_required'; end if;
 end if;
 -- Match every writer's lock hierarchy: order -> product UUID -> item UUID -> location.
 perform 1 from public.inventory_items i where i.tenant_id=p_tenant_id and
   (i.product_id in(select product_id from public.order_items where tenant_id=p_tenant_id and order_id=p_order_id)
    or i.id in(select inventory_item_id from public.order_inventory_allocations where tenant_id=p_tenant_id and order_id=p_order_id))
   order by i.id for update;
 if p_action='reserve' then
   insert into public.inventory_warehouses(tenant_id,code,name,created_by)
     values(p_tenant_id,'MAIN','Principal',auth.uid()) on conflict(tenant_id,code) do nothing;
   select id into v_warehouse from public.inventory_warehouses where tenant_id=p_tenant_id
     and id=coalesce(p_warehouse_id,(select id from public.inventory_warehouses where tenant_id=p_tenant_id and code='MAIN')) and active;
   if v_warehouse is null then raise exception 'warehouse_tenant_mismatch'; end if;
   for v_row in select i.id as item_id,sum(l.quantity) as needed from public.order_items l
     join public.products p on p.tenant_id=l.tenant_id and p.id=l.product_id
     join public.inventory_items i on i.tenant_id=l.tenant_id and i.product_id=l.product_id and i.active
     where l.tenant_id=p_tenant_id and l.order_id=p_order_id and coalesce(p.metadata->>'erp_stock_policy','stock')<>'service'
     group by i.id order by i.id loop
     select * into v_alloc from public.order_inventory_allocations where tenant_id=p_tenant_id and order_id=p_order_id and inventory_item_id=v_row.item_id;
     if found and (v_alloc.shipped_quantity>0 or (v_alloc.reserved_quantity>0 and v_alloc.warehouse_id<>v_warehouse)) then raise exception 'order_allocation_conflict'; end if;
     v_delta:=v_row.needed-coalesce(v_alloc.reserved_quantity,0);
     if v_delta<0 then raise exception 'order_allocation_conflict'; end if;
     if v_delta>0 then
       perform public.erp_inventory_move(p_tenant_id,v_row.item_id,'reserve',v_delta,'order:'||v_id||':'||v_row.item_id,v_warehouse,null,p_order_id,null,'Reserva de pedido '||v_order.order_number);
       insert into public.order_inventory_allocations(tenant_id,order_id,inventory_item_id,warehouse_id,reserved_quantity)
         values(p_tenant_id,p_order_id,v_row.item_id,v_warehouse,v_row.needed)
       on conflict(tenant_id,order_id,inventory_item_id) do update set reserved_quantity=excluded.reserved_quantity,warehouse_id=excluded.warehouse_id,updated_at=now();
     end if;
   end loop;
   update public.orders set native_inventory_managed=true where tenant_id=p_tenant_id and id=p_order_id;
 elsif p_action='release' then
   for v_alloc in select * from public.order_inventory_allocations where tenant_id=p_tenant_id and order_id=p_order_id and reserved_quantity>0 order by inventory_item_id loop
     if p_warehouse_id is not null and p_warehouse_id<>v_alloc.warehouse_id then raise exception 'order_warehouse_mismatch'; end if;
     update public.order_inventory_allocations set reserved_quantity=0,updated_at=now()
       where tenant_id=p_tenant_id and order_id=p_order_id and inventory_item_id=v_alloc.inventory_item_id;
     perform public.erp_inventory_move(p_tenant_id,v_alloc.inventory_item_id,'release',v_alloc.reserved_quantity,
       'order:'||v_id||':'||v_alloc.inventory_item_id,v_alloc.warehouse_id,null,p_order_id,null,'Liberación de pedido '||v_order.order_number);
   end loop;
 else
   if v_order.status not in ('ready_for_delivery','out_for_delivery') then raise exception 'order_not_ready_for_delivery'; end if;
   perform 1 from public.production_jobs where tenant_id=p_tenant_id and order_id=p_order_id
     and status='completed' and design_approved and quality_control_status='passed' for update;
   if not found then raise exception 'production_quality_approval_required'; end if;
   for v_row in select i.id as item_id,sum(l.quantity) as needed from public.order_items l
     join public.products p on p.tenant_id=l.tenant_id and p.id=l.product_id
     join public.inventory_items i on i.tenant_id=l.tenant_id and i.product_id=l.product_id and i.active
     where l.tenant_id=p_tenant_id and l.order_id=p_order_id and coalesce(p.metadata->>'erp_stock_policy','stock')<>'service'
     group by i.id order by i.id loop
     select * into v_alloc from public.order_inventory_allocations where tenant_id=p_tenant_id and order_id=p_order_id and inventory_item_id=v_row.item_id;
     if not found or v_alloc.reserved_quantity<>v_row.needed or v_alloc.shipped_quantity<>0 then raise exception 'complete_order_reservation_required'; end if;
     if p_warehouse_id is not null and p_warehouse_id<>v_alloc.warehouse_id then raise exception 'order_warehouse_mismatch'; end if;
     update public.order_inventory_allocations set reserved_quantity=0,shipped_quantity=v_row.needed,updated_at=now()
       where tenant_id=p_tenant_id and order_id=p_order_id and inventory_item_id=v_row.item_id;
     perform public.erp_inventory_move(p_tenant_id,v_row.item_id,'consume',v_row.needed,'order:'||v_id||':'||v_row.item_id,
       v_alloc.warehouse_id,null,p_order_id,null,'Entrega de pedido '||v_order.order_number);
   end loop;
   insert into public.deliveries(tenant_id,order_id,status,delivered_at) values(p_tenant_id,p_order_id,'delivered',now())
     on conflict(tenant_id,order_id) do update set status='delivered',delivered_at=excluded.delivered_at returning id into v_delivery;
   update public.orders set status='delivered',delivered_at=now(),native_inventory_managed=true where tenant_id=p_tenant_id and id=p_order_id;
 end if;
 v_result:=jsonb_build_object('order_id',p_order_id,'action',p_action,'delivery_id',v_delivery,
   'allocations',coalesce((select jsonb_agg(to_jsonb(a) order by a.inventory_item_id) from public.order_inventory_allocations a
     where a.tenant_id=p_tenant_id and a.order_id=p_order_id),'[]'::jsonb));
 insert into public.order_inventory_requests(id,tenant_id,idempotency_key,request,result,actor_user_id)
   values(v_id,p_tenant_id,p_idempotency_key,v_payload,v_result,auth.uid());
 insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
   values(p_tenant_id,auth.uid(),'erp.order_inventory.'||p_action,'order',p_order_id,jsonb_build_object('request_id',v_id));
 return v_result;
end $$;
revoke all on function private.erp_order_inventory_command(uuid,uuid,text,text,uuid) from public,anon,service_role;
grant execute on function private.erp_order_inventory_command(uuid,uuid,text,text,uuid) to authenticated;
create function public.erp_order_inventory_command(p_tenant_id uuid,p_order_id uuid,p_action text,p_idempotency_key text,p_warehouse_id uuid default null)
returns jsonb language sql security invoker set search_path='' as $$
 select private.erp_order_inventory_command(p_tenant_id,p_order_id,p_action,p_idempotency_key,p_warehouse_id)
$$;
revoke all on function public.erp_order_inventory_command(uuid,uuid,text,text,uuid) from public,anon,service_role;
grant execute on function public.erp_order_inventory_command(uuid,uuid,text,text,uuid) to authenticated;

-- A generic release/consume cannot spend an order's allocation. Item row locks
-- serialize both this check and allocation writers, including independent orders.
create function private.erp_order_allocation_floor() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.reserved < (select coalesce(sum(reserved_quantity),0) from public.order_inventory_allocations
    where tenant_id=new.tenant_id and inventory_item_id=new.inventory_item_id and warehouse_id=new.warehouse_id) then
   raise exception using errcode='23514',message='stock_reserved_for_order'; end if;
 return new;
end $$;
revoke all on function private.erp_order_allocation_floor() from public,anon,authenticated,service_role;
create trigger order_allocation_floor before update on public.inventory_stock_locations for each row execute function private.erp_order_allocation_floor();

create function private.erp_order_inventory_guard() returns trigger language plpgsql set search_path='' as $$
declare v_tenant uuid; v_order uuid; v_owner name;
begin
 select pg_get_userbyid(proowner) into v_owner from pg_proc
   where oid='private.erp_order_inventory_command(uuid,uuid,text,text,uuid)'::regprocedure;
 if tg_table_name='order_items' then
   v_tenant:=case when tg_op='DELETE' then old.tenant_id else new.tenant_id end;
   v_order:=case when tg_op='DELETE' then old.order_id else new.order_id end;
   perform 1 from public.orders where tenant_id=v_tenant and id=v_order for update;
   if exists(select 1 from public.order_inventory_allocations where tenant_id=v_tenant and order_id=v_order
      and (reserved_quantity>0 or shipped_quantity>0)) then raise exception 'allocated_order_lines_are_immutable'; end if;
 elsif tg_table_name='orders' then
   if new.status='cancelled' and exists(select 1 from public.order_inventory_allocations where tenant_id=old.tenant_id and order_id=old.id and reserved_quantity>0) then
     raise exception 'release_inventory_before_cancellation'; end if;
   if current_user<>v_owner and (new.native_inventory_managed is distinct from old.native_inventory_managed
     or ((old.native_inventory_managed or new.native_inventory_managed) and
       (new.status='delivered' or new.delivered_at is distinct from old.delivered_at))) then raise exception 'use_order_inventory_transaction'; end if;
 elsif tg_table_name='deliveries' then
   if current_user<>v_owner and (new.status='delivered' or (tg_op='UPDATE' and new.delivered_at is distinct from old.delivered_at))
     and exists(select 1 from public.orders where tenant_id=new.tenant_id and id=new.order_id and native_inventory_managed) then
     raise exception 'use_order_inventory_transaction'; end if;
 elsif tg_table_name='inventory_items' then
   if new.product_id is distinct from old.product_id and exists(select 1 from public.order_inventory_allocations where tenant_id=old.tenant_id
     and inventory_item_id=old.id and (reserved_quantity>0 or shipped_quantity>0)) then raise exception 'allocated_product_mapping_is_immutable'; end if;
   if new.active is distinct from old.active and not new.active and exists(select 1 from public.order_inventory_allocations
     where tenant_id=old.tenant_id and inventory_item_id=old.id and reserved_quantity>0) then raise exception 'release_allocations_before_deactivation'; end if;
 elsif tg_table_name='products' then
   if coalesce(new.metadata->>'erp_stock_policy','stock') is distinct from coalesce(old.metadata->>'erp_stock_policy','stock')
     and exists(select 1 from public.order_inventory_allocations a join public.inventory_items i
       on i.tenant_id=a.tenant_id and i.id=a.inventory_item_id
       where i.tenant_id=old.tenant_id and i.product_id=old.id and (a.reserved_quantity>0 or a.shipped_quantity>0)) then
     raise exception 'allocated_product_policy_is_immutable'; end if;
 end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
revoke all on function private.erp_order_inventory_guard() from public,anon,authenticated,service_role;
create trigger order_inventory_lines_guard before insert or update or delete on public.order_items for each row execute function private.erp_order_inventory_guard();
create trigger order_inventory_header_guard before update on public.orders for each row execute function private.erp_order_inventory_guard();
create trigger order_inventory_delivery_guard before insert or update on public.deliveries for each row execute function private.erp_order_inventory_guard();
create trigger order_inventory_product_guard before update on public.inventory_items for each row execute function private.erp_order_inventory_guard();
create trigger order_inventory_policy_guard before update on public.products for each row execute function private.erp_order_inventory_guard();
create trigger order_inventory_allocations_write_guard before insert or update or delete on public.order_inventory_allocations for each row execute function private.erp_inventory_write_guard();
create trigger order_inventory_requests_write_guard before insert on public.order_inventory_requests for each row execute function private.erp_inventory_write_guard();
create trigger order_inventory_requests_immutable before update or delete on public.order_inventory_requests for each row execute function private.erp_inventory_immutable_guard();
notify pgrst,'reload schema';

-- Native Empresia inventory. Existing balances are not changed by this migration.
-- All mutations run in one PostgreSQL transaction; item locks serialize each SKU.
-- SECURITY DEFINER is deliberately confined to the non-exposed private schema.
-- Public RPCs are invoker wrappers, with explicit tenant authorization in the mutators.

alter table public.inventory_items add column category text;
alter table public.inventory_items add column product_id uuid;
alter table public.inventory_items add constraint inventory_items_product_tenant_fk
  foreign key (tenant_id, product_id) references public.products(tenant_id,id);

create table public.inventory_warehouses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  code text not null check (length(trim(code)) between 1 and 60),
  name text not null check (length(trim(name)) between 1 and 160),
  active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (tenant_id,id), unique (tenant_id,code)
);
create table public.inventory_stock_locations (
  tenant_id uuid not null,
  inventory_item_id uuid not null,
  warehouse_id uuid not null,
  on_hand numeric not null default 0,
  reserved numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (tenant_id,inventory_item_id,warehouse_id),
  foreign key (tenant_id,inventory_item_id) references public.inventory_items(tenant_id,id),
  foreign key (tenant_id,warehouse_id) references public.inventory_warehouses(tenant_id,id),
  check (on_hand::text not in ('NaN','Infinity','-Infinity') and on_hand >= 0),
  check (reserved::text not in ('NaN','Infinity','-Infinity') and reserved >= 0 and reserved <= on_hand)
);
create index inventory_stock_locations_warehouse_idx on public.inventory_stock_locations(tenant_id,warehouse_id);

create table public.inventory_operations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  idempotency_key text not null check (length(trim(idempotency_key)) between 1 and 200),
  request jsonb not null,
  result jsonb not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (tenant_id,id), unique (tenant_id,idempotency_key)
);
alter table public.inventory_movements add column warehouse_id uuid;
alter table public.inventory_movements add column operation_id uuid;
alter table public.inventory_movements add constraint inventory_movements_warehouse_tenant_fk
  foreign key (tenant_id,warehouse_id) references public.inventory_warehouses(tenant_id,id);
alter table public.inventory_movements add constraint inventory_movements_operation_tenant_fk
  foreign key (tenant_id,operation_id) references public.inventory_operations(tenant_id,id)
  deferrable initially deferred;
create index inventory_movements_operation_idx on public.inventory_movements(tenant_id,operation_id);

alter table public.inventory_items enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.inventory_warehouses enable row level security;
alter table public.inventory_stock_locations enable row level security;
alter table public.inventory_operations enable row level security;
create policy inventory_warehouses_read on public.inventory_warehouses for select to authenticated
  using (private.has_tenant_access(tenant_id) and private.crm_active_tenant_matches(tenant_id));
create policy inventory_stock_locations_read on public.inventory_stock_locations for select to authenticated
  using (private.has_tenant_access(tenant_id) and private.crm_active_tenant_matches(tenant_id));
create policy inventory_operations_read on public.inventory_operations for select to authenticated
  using (private.has_tenant_access(tenant_id) and private.crm_active_tenant_matches(tenant_id));
-- Restrictive policies also constrain the pre-existing, permissive inventory policies.
create policy inventory_items_active_context on public.inventory_items as restrictive for select to authenticated
  using (private.crm_active_tenant_matches(tenant_id));
create policy inventory_movements_active_context on public.inventory_movements as restrictive for select to authenticated
  using (private.crm_active_tenant_matches(tenant_id));
revoke all on public.inventory_warehouses,public.inventory_stock_locations,public.inventory_operations from public,anon,authenticated,service_role;
grant select on public.inventory_warehouses,public.inventory_stock_locations,public.inventory_operations to authenticated;
revoke insert,update,delete,truncate on public.inventory_items,public.inventory_movements from public,anon,authenticated,service_role;
grant select on public.inventory_items,public.inventory_movements to authenticated;

create function private.erp_inventory_authorize(p_tenant_id uuid)
returns void language plpgsql stable security invoker set search_path=''
as $$ begin
  if auth.uid() is null or p_tenant_id is null
    or coalesce(auth.jwt()->'app_metadata'->>'actor_type','human') in ('agent','ai','service')
    or not coalesce(private.has_tenant_access(p_tenant_id),false)
    or not coalesce(private.crm_active_tenant_matches(p_tenant_id),false)
    or not coalesce(private.can_operate_crm(p_tenant_id),false)
  then raise exception using errcode='42501',message='inventory_access_denied'; end if;
end $$;
revoke all on function private.erp_inventory_authorize(uuid) from public,anon,authenticated,service_role;

create function private.erp_inventory_move(
  p_tenant_id uuid,p_item_id uuid,p_movement_type text,p_quantity numeric,p_idempotency_key text,
  p_warehouse_id uuid default null,p_to_warehouse_id uuid default null,p_order_id uuid default null,
  p_unit_cost numeric default null,p_notes text default null)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_item public.inventory_items%rowtype;
  v_source public.inventory_stock_locations%rowtype;
  v_target public.inventory_stock_locations%rowtype;
  v_existing public.inventory_operations%rowtype;
  v_request jsonb;
  v_result jsonb;
  v_op uuid:=gen_random_uuid(); v_move uuid:=gen_random_uuid(); v_other uuid:=gen_random_uuid();
  v_default uuid; v_warehouse uuid; v_sum numeric; v_reserved_sum numeric;
  v_dh numeric:=0; v_dr numeric:=0;
begin
  perform private.erp_inventory_authorize(p_tenant_id);
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 1 and 200 then
    raise exception using errcode='22023',message='missing_idempotency_key'; end if;
  if p_movement_type is null or p_movement_type not in ('entry','exit','reserve','release','consume','transfer')
    or p_quantity is null or p_quantity::text in ('NaN','Infinity','-Infinity')
    or p_quantity<=0 or p_quantity>=1000000000000 or p_quantity<>round(p_quantity,6)
    or (p_unit_cost is not null and (p_unit_cost::text in ('NaN','Infinity','-Infinity') or p_unit_cost<0 or p_unit_cost>=1000000000000 or p_unit_cost<>round(p_unit_cost,4)))
    or (p_movement_type='transfer' and p_to_warehouse_id is null)
    or (p_movement_type<>'transfer' and p_to_warehouse_id is not null)
    or length(coalesce(p_notes,''))>2000
  then raise exception using errcode='22023',message='invalid_inventory_movement'; end if;
  v_request:=jsonb_build_object('action','move','item_id',p_item_id,'movement_type',p_movement_type,
    'quantity',p_quantity,'warehouse_id',p_warehouse_id,'to_warehouse_id',p_to_warehouse_id,
    'order_id',p_order_id,'unit_cost',p_unit_cost,'notes',p_notes);
  -- A transaction advisory lock serializes retries even when different items use the same key.
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':'||p_idempotency_key,0));
  select * into v_existing from public.inventory_operations
    where tenant_id=p_tenant_id and idempotency_key=p_idempotency_key;
  if found then
    if v_existing.request is distinct from v_request then
      raise exception using errcode='22023',message='idempotency_conflict'; end if;
    return v_existing.result;
  end if;
  -- An older ledger request cannot be silently re-executed under the native API.
  if exists(select 1 from public.inventory_movements where tenant_id=p_tenant_id and idempotency_key=p_idempotency_key) then
    raise exception using errcode='22023',message='legacy_idempotency_conflict'; end if;
  select * into v_item from public.inventory_items where tenant_id=p_tenant_id and id=p_item_id for update;
  if not found or not v_item.active then raise exception using errcode='22023',message='inventory_item_unavailable'; end if;
  if p_order_id is not null then
    perform 1 from public.orders where tenant_id=p_tenant_id and id=p_order_id;
    if not found then raise exception using errcode='22023',message='order_tenant_mismatch'; end if;
  end if;
  -- Existing aggregate balances are allocated once, under the item lock, without rewriting them.
  insert into public.inventory_warehouses(tenant_id,code,name,created_by)
    values(p_tenant_id,'MAIN','Principal',auth.uid()) on conflict(tenant_id,code) do nothing;
  select id into v_default from public.inventory_warehouses where tenant_id=p_tenant_id and code='MAIN' and active;
  if v_default is null then raise exception using errcode='22023',message='default_warehouse_unavailable'; end if;
  if not exists(select 1 from public.inventory_stock_locations where tenant_id=p_tenant_id and inventory_item_id=p_item_id) then
    insert into public.inventory_stock_locations(tenant_id,inventory_item_id,warehouse_id,on_hand,reserved)
      values(p_tenant_id,p_item_id,v_default,v_item.on_hand,v_item.reserved);
  end if;
  select coalesce(sum(on_hand),0),coalesce(sum(reserved),0) into v_sum,v_reserved_sum
    from public.inventory_stock_locations where tenant_id=p_tenant_id and inventory_item_id=p_item_id;
  if v_sum<>v_item.on_hand or v_reserved_sum<>v_item.reserved then
    raise exception using errcode='23514',message='inventory_location_balance_mismatch'; end if;
  v_warehouse:=coalesce(p_warehouse_id,v_default);
  if not exists(select 1 from public.inventory_warehouses where tenant_id=p_tenant_id and id=v_warehouse and active)
    or (p_to_warehouse_id is not null and not exists(select 1 from public.inventory_warehouses where tenant_id=p_tenant_id and id=p_to_warehouse_id and active))
    or p_to_warehouse_id=v_warehouse then
    raise exception using errcode='22023',message='warehouse_tenant_mismatch'; end if;
  insert into public.inventory_stock_locations(tenant_id,inventory_item_id,warehouse_id)
    values(p_tenant_id,p_item_id,v_warehouse) on conflict do nothing;
  if p_movement_type='transfer' then
    insert into public.inventory_stock_locations(tenant_id,inventory_item_id,warehouse_id)
      values(p_tenant_id,p_item_id,p_to_warehouse_id) on conflict do nothing;
  end if;
  -- Item lock precedes location locks for every mutation; UUID order avoids reverse-transfer deadlocks.
  perform 1 from public.inventory_stock_locations
    where tenant_id=p_tenant_id and inventory_item_id=p_item_id
      and warehouse_id in (v_warehouse,p_to_warehouse_id) order by warehouse_id for update;
  select * into v_source from public.inventory_stock_locations
    where tenant_id=p_tenant_id and inventory_item_id=p_item_id and warehouse_id=v_warehouse;
  case p_movement_type
    when 'entry' then v_dh:=p_quantity;
    when 'exit' then v_dh:=-p_quantity;
    when 'reserve' then v_dr:=p_quantity;
    when 'release' then v_dr:=-p_quantity;
    when 'consume' then v_dh:=-p_quantity; v_dr:=-p_quantity;
    when 'transfer' then v_dh:=-p_quantity;
  end case;
  if v_source.on_hand+v_dh<0 or v_source.reserved+v_dr<0
    or v_source.reserved+v_dr>v_source.on_hand+v_dh then
    raise exception using errcode='23514',message='insufficient_stock'; end if;
  update public.inventory_stock_locations set on_hand=on_hand+v_dh,reserved=reserved+v_dr,updated_at=now()
    where tenant_id=p_tenant_id and inventory_item_id=p_item_id and warehouse_id=v_warehouse returning * into v_source;
  if p_movement_type='transfer' then
    update public.inventory_stock_locations set on_hand=on_hand+p_quantity,updated_at=now()
      where tenant_id=p_tenant_id and inventory_item_id=p_item_id and warehouse_id=p_to_warehouse_id returning * into v_target;
  else
    update public.inventory_items set on_hand=on_hand+v_dh,reserved=reserved+v_dr,updated_at=now()
      where tenant_id=p_tenant_id and id=p_item_id returning * into v_item;
  end if;
  insert into public.inventory_movements(id,tenant_id,inventory_item_id,order_id,movement_type,quantity,unit_cost,idempotency_key,notes,created_by,warehouse_id,operation_id)
    values(v_move,p_tenant_id,p_item_id,p_order_id,case when p_movement_type='transfer' then 'exit' else p_movement_type end,
      p_quantity,p_unit_cost,v_op::text||':source',p_notes,auth.uid(),v_warehouse,v_op);
  if p_movement_type='transfer' then
    insert into public.inventory_movements(id,tenant_id,inventory_item_id,order_id,movement_type,quantity,unit_cost,idempotency_key,notes,created_by,warehouse_id,operation_id)
      values(v_other,p_tenant_id,p_item_id,p_order_id,'entry',p_quantity,p_unit_cost,v_op::text||':target',p_notes,auth.uid(),p_to_warehouse_id,v_op);
  end if;
  v_result:=jsonb_build_object('operation_id',v_op,'movement_ids',case when p_movement_type='transfer' then jsonb_build_array(v_move,v_other) else jsonb_build_array(v_move) end,
    'item',to_jsonb(v_item),'stock',to_jsonb(v_source),'destination_stock',case when p_movement_type='transfer' then to_jsonb(v_target) else null end);
  insert into public.inventory_operations(id,tenant_id,idempotency_key,request,result,created_by)
    values(v_op,p_tenant_id,p_idempotency_key,v_request,v_result,auth.uid());
  insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
    values(p_tenant_id,auth.uid(),'inventory.'||p_movement_type,'inventory_item',p_item_id,
      jsonb_build_object('operation_id',v_op,'quantity',p_quantity,'warehouse_id',v_warehouse,'to_warehouse_id',p_to_warehouse_id));
  return v_result;
end $$;
revoke all on function private.erp_inventory_move(uuid,uuid,text,numeric,text,uuid,uuid,uuid,numeric,text) from public,anon,authenticated,service_role;
grant execute on function private.erp_inventory_move(uuid,uuid,text,numeric,text,uuid,uuid,uuid,numeric,text) to authenticated;
create function public.erp_inventory_move(
  p_tenant_id uuid,p_item_id uuid,p_movement_type text,p_quantity numeric,p_idempotency_key text,
  p_warehouse_id uuid default null,p_to_warehouse_id uuid default null,p_order_id uuid default null,
  p_unit_cost numeric default null,p_notes text default null)
returns jsonb language sql security invoker set search_path=''
as $$ select private.erp_inventory_move(p_tenant_id,p_item_id,p_movement_type,p_quantity,p_idempotency_key,
  p_warehouse_id,p_to_warehouse_id,p_order_id,p_unit_cost,p_notes); $$;
revoke all on function public.erp_inventory_move(uuid,uuid,text,numeric,text,uuid,uuid,uuid,numeric,text) from public,anon,service_role;
grant execute on function public.erp_inventory_move(uuid,uuid,text,numeric,text,uuid,uuid,uuid,numeric,text) to authenticated;

create function private.erp_inventory_item_save(p_tenant_id uuid,p_item_id uuid,p_payload jsonb,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_item public.inventory_items%rowtype; v_request jsonb; v_existing public.inventory_operations%rowtype;
  v_result jsonb; v_action text; v_op uuid:=gen_random_uuid();
begin
  perform private.erp_inventory_authorize(p_tenant_id);
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 1 and 200
    or p_payload is null or jsonb_typeof(p_payload)<>'object'
    or exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('sku','name','item_type','unit','cost_per_unit','reorder_level','category','active','product_id','supplier'))
  then raise exception using errcode='22023',message='invalid_inventory_item_request'; end if;
  v_request:=jsonb_build_object('action','item_save','item_id',p_item_id,'payload',p_payload);
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':'||p_idempotency_key,0));
  select * into v_existing from public.inventory_operations where tenant_id=p_tenant_id and idempotency_key=p_idempotency_key;
  if found then
    if v_existing.request is distinct from v_request then raise exception using errcode='22023',message='idempotency_conflict'; end if;
    return v_existing.result;
  end if;
  if p_item_id is not null then
    select * into v_item from public.inventory_items where tenant_id=p_tenant_id and id=p_item_id for update;
    if not found then raise exception using errcode='22023',message='inventory_item_unavailable'; end if;
    v_action:='inventory.item_updated';
  else
    v_item.id:=gen_random_uuid(); v_item.tenant_id:=p_tenant_id; v_item.on_hand:=0; v_item.reserved:=0;
    v_item.item_type:='blank'; v_item.unit:='unit'; v_item.active:=true; v_item.reorder_level:=0;
    v_action:='inventory.item_created';
  end if;
  if p_payload ? 'sku' then v_item.sku:=trim(p_payload->>'sku'); end if;
  if p_payload ? 'name' then v_item.name:=trim(p_payload->>'name'); end if;
  if p_payload ? 'item_type' then v_item.item_type:=p_payload->>'item_type'; end if;
  if p_payload ? 'unit' then v_item.unit:=trim(p_payload->>'unit'); end if;
  if p_payload ? 'category' then v_item.category:=nullif(trim(p_payload->>'category'),''); end if;
  if p_payload ? 'supplier' then v_item.supplier:=nullif(trim(p_payload->>'supplier'),''); end if;
  if p_payload ? 'product_id' then v_item.product_id:=nullif(p_payload->>'product_id','')::uuid; end if;
  if p_payload ? 'active' then v_item.active:=(p_payload->>'active')::boolean; end if;
  if p_payload ? 'cost_per_unit' then v_item.cost_per_unit:=nullif(p_payload->>'cost_per_unit','')::numeric; end if;
  if p_payload ? 'reorder_level' then v_item.reorder_level:=(p_payload->>'reorder_level')::numeric; end if;
  if v_item.sku is null or length(v_item.sku) not between 1 and 100
    or v_item.name is null or length(v_item.name) not between 1 and 200
    or v_item.unit is null or length(v_item.unit) not between 1 and 60
    or length(coalesce(v_item.category,''))>100 or length(coalesce(v_item.supplier,''))>200
    or v_item.item_type is null or v_item.item_type not in ('blank','material','packaging','consumable','other')
    or v_item.active is null or v_item.reorder_level is null
    or v_item.reorder_level::text in ('NaN','Infinity','-Infinity') or v_item.reorder_level<0
    or v_item.reorder_level>=1000000000000 or v_item.reorder_level<>round(v_item.reorder_level,6)
    or (v_item.cost_per_unit is not null and (v_item.cost_per_unit::text in ('NaN','Infinity','-Infinity')
      or v_item.cost_per_unit<0 or v_item.cost_per_unit>=1000000000000 or v_item.cost_per_unit<>round(v_item.cost_per_unit,4)))
  then raise exception using errcode='22023',message='invalid_inventory_item'; end if;
  if v_item.product_id is not null and not exists(select 1 from public.products where tenant_id=p_tenant_id and id=v_item.product_id) then
    raise exception using errcode='22023',message='product_tenant_mismatch'; end if;
  if p_item_id is null then
    insert into public.inventory_items(id,tenant_id,sku,name,item_type,unit,category,product_id,cost_per_unit,reorder_level,supplier,active,created_by)
      values(v_item.id,p_tenant_id,v_item.sku,v_item.name,v_item.item_type,v_item.unit,v_item.category,v_item.product_id,
        v_item.cost_per_unit,v_item.reorder_level,v_item.supplier,v_item.active,auth.uid()) returning * into v_item;
  else
    update public.inventory_items set sku=v_item.sku,name=v_item.name,item_type=v_item.item_type,unit=v_item.unit,
      category=v_item.category,product_id=v_item.product_id,cost_per_unit=v_item.cost_per_unit,reorder_level=v_item.reorder_level,
      supplier=v_item.supplier,active=v_item.active,updated_at=now()
      where tenant_id=p_tenant_id and id=p_item_id returning * into v_item;
  end if;
  v_result:=to_jsonb(v_item);
  insert into public.inventory_operations(id,tenant_id,idempotency_key,request,result,created_by)
    values(v_op,p_tenant_id,p_idempotency_key,v_request,v_result,auth.uid());
  insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
    values(p_tenant_id,auth.uid(),v_action,'inventory_item',v_item.id,jsonb_build_object('operation_id',v_op));
  return v_result;
end $$;
revoke all on function private.erp_inventory_item_save(uuid,uuid,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function private.erp_inventory_item_save(uuid,uuid,jsonb,text) to authenticated;
create function public.erp_inventory_item_save(p_tenant_id uuid,p_item_id uuid,p_payload jsonb,p_idempotency_key text)
returns jsonb language sql security invoker set search_path=''
as $$ select private.erp_inventory_item_save(p_tenant_id,p_item_id,p_payload,p_idempotency_key); $$;
revoke all on function public.erp_inventory_item_save(uuid,uuid,jsonb,text) from public,anon,service_role;
grant execute on function public.erp_inventory_item_save(uuid,uuid,jsonb,text) to authenticated;

create function private.erp_inventory_warehouse_create(p_tenant_id uuid,p_code text,p_name text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_warehouse public.inventory_warehouses%rowtype; v_request jsonb;
  v_existing public.inventory_operations%rowtype; v_result jsonb; v_op uuid:=gen_random_uuid();
begin
  perform private.erp_inventory_authorize(p_tenant_id);
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 1 and 200
    or p_code is null or length(trim(p_code)) not between 1 and 60
    or p_name is null or length(trim(p_name)) not between 1 and 160 then
    raise exception using errcode='22023',message='invalid_warehouse'; end if;
  v_request:=jsonb_build_object('action','warehouse_create','code',p_code,'name',p_name);
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':'||p_idempotency_key,0));
  select * into v_existing from public.inventory_operations where tenant_id=p_tenant_id and idempotency_key=p_idempotency_key;
  if found then
    if v_existing.request is distinct from v_request then raise exception using errcode='22023',message='idempotency_conflict'; end if;
    return v_existing.result;
  end if;
  insert into public.inventory_warehouses(tenant_id,code,name,created_by)
    values(p_tenant_id,upper(trim(p_code)),trim(p_name),auth.uid()) returning * into v_warehouse;
  v_result:=to_jsonb(v_warehouse);
  insert into public.inventory_operations(id,tenant_id,idempotency_key,request,result,created_by)
    values(v_op,p_tenant_id,p_idempotency_key,v_request,v_result,auth.uid());
  insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
    values(p_tenant_id,auth.uid(),'inventory.warehouse_created','inventory_warehouse',v_warehouse.id,jsonb_build_object('operation_id',v_op));
  return v_result;
end $$;
revoke all on function private.erp_inventory_warehouse_create(uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function private.erp_inventory_warehouse_create(uuid,text,text,text) to authenticated;
create function public.erp_inventory_warehouse_create(p_tenant_id uuid,p_code text,p_name text,p_idempotency_key text)
returns jsonb language sql security invoker set search_path=''
as $$ select private.erp_inventory_warehouse_create(p_tenant_id,p_code,p_name,p_idempotency_key); $$;
revoke all on function public.erp_inventory_warehouse_create(uuid,text,text,text) from public,anon,service_role;
grant execute on function public.erp_inventory_warehouse_create(uuid,text,text,text) to authenticated;

-- API roles cannot bypass RPC authorization by writing tables, even if a later
-- accidental GRANT is introduced. The mutator's owner is the trusted writer.
create function private.erp_inventory_write_guard()
returns trigger language plpgsql security invoker set search_path=''
as $$ begin
  if current_user <> (select pg_get_userbyid(proowner) from pg_proc
      where oid='private.erp_inventory_move(uuid,uuid,text,numeric,text,uuid,uuid,uuid,numeric,text)'::regprocedure) then
    raise exception using errcode='42501',message='inventory_rpc_required'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function private.erp_inventory_write_guard() from public,anon,authenticated,service_role;
create trigger inventory_items_native_write_guard before insert or update or delete on public.inventory_items
  for each row execute function private.erp_inventory_write_guard();
create trigger inventory_movements_native_write_guard before insert on public.inventory_movements
  for each row execute function private.erp_inventory_write_guard();
create trigger inventory_stock_locations_native_write_guard before insert or update or delete on public.inventory_stock_locations
  for each row execute function private.erp_inventory_write_guard();
create trigger inventory_warehouses_native_write_guard before insert or update or delete on public.inventory_warehouses
  for each row execute function private.erp_inventory_write_guard();
create trigger inventory_operations_native_write_guard before insert on public.inventory_operations
  for each row execute function private.erp_inventory_write_guard();
create function private.erp_inventory_immutable_guard()
returns trigger language plpgsql security invoker set search_path=''
as $$ begin raise exception using errcode='55000',message='inventory_ledger_immutable'; end $$;
revoke all on function private.erp_inventory_immutable_guard() from public,anon,authenticated,service_role;
create trigger inventory_movements_native_immutable before update or delete on public.inventory_movements
  for each row execute function private.erp_inventory_immutable_guard();
create trigger inventory_operations_native_immutable before update or delete on public.inventory_operations
  for each row execute function private.erp_inventory_immutable_guard();

-- NOT VALID avoids altering or silently repairing historic client data. It still
-- rejects future invalid writes. Validate after the deployment preflight is clean.
alter table public.inventory_items add constraint inventory_items_native_finite check (
  on_hand::text not in ('NaN','Infinity','-Infinity') and reserved::text not in ('NaN','Infinity','-Infinity')
  and reorder_level::text not in ('NaN','Infinity','-Infinity')
  and (cost_per_unit is null or cost_per_unit::text not in ('NaN','Infinity','-Infinity'))) not valid;
alter table public.inventory_movements add constraint inventory_movements_native_finite check (
  quantity::text not in ('NaN','Infinity','-Infinity')
  and (unit_cost is null or unit_cost::text not in ('NaN','Infinity','-Infinity'))) not valid;

comment on function public.erp_inventory_move(uuid,uuid,text,numeric,text,uuid,uuid,uuid,numeric,text)
  is 'Atomic native inventory mutation: authorized tenant, immutable ledger, payload-bound retries and row locks. Null warehouse means Principal.';
notify pgrst,'reload schema';

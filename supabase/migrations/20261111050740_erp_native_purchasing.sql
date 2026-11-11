-- Native purchasing. No customer data is seeded or rewritten. Requires the
-- native inventory migration. All financial/stock writes use one transaction.
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  name text not null check (length(btrim(name)) between 1 and 200),
  tax_identifier text, email text, phone text, address text,
  active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id,id)
);
create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  supplier_id uuid not null,
  order_number text not null,
  currency text not null check (currency in ('DOP','USD','EUR')),
  status text not null default 'draft' check (status in ('draft','approved','partial','received')),
  notes text,
  approved_by uuid references auth.users(id), approved_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (tenant_id,id), unique (tenant_id,order_number),
  foreign key (tenant_id,supplier_id) references public.suppliers(tenant_id,id)
);
create table public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  purchase_order_id uuid not null,
  inventory_item_id uuid not null,
  quantity numeric(18,6) not null check (quantity > 0 and quantity <> 'NaN'::numeric),
  unit_cost numeric(18,4) not null check (unit_cost >= 0 and unit_cost <> 'NaN'::numeric),
  received_quantity numeric(18,6) not null default 0
    check (received_quantity >= 0 and received_quantity <= quantity),
  unique (tenant_id,id), unique (tenant_id,purchase_order_id,id),
  foreign key (tenant_id,purchase_order_id) references public.purchase_orders(tenant_id,id),
  foreign key (tenant_id,inventory_item_id) references public.inventory_items(tenant_id,id)
);
create table public.purchase_receipts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  purchase_order_id uuid not null,
  kind text not null check (kind in ('receipt','return')),
  reference text not null check (length(btrim(reference)) between 1 and 200),
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (tenant_id,id),
  foreign key (tenant_id,purchase_order_id) references public.purchase_orders(tenant_id,id)
);
create table public.purchase_receipt_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  receipt_id uuid not null,
  purchase_order_id uuid not null,
  purchase_order_item_id uuid not null,
  original_receipt_item_id uuid,
  warehouse_id uuid,
  quantity numeric(18,6) not null check (quantity > 0 and quantity <> 'NaN'::numeric),
  amount numeric(24,2) not null check (amount >= 0 and amount <> 'NaN'::numeric),
  inventory_operation_id uuid not null,
  unique (tenant_id,id),
  foreign key (tenant_id,receipt_id) references public.purchase_receipts(tenant_id,id),
  foreign key (tenant_id,purchase_order_id,purchase_order_item_id)
    references public.purchase_order_items(tenant_id,purchase_order_id,id),
  foreign key (tenant_id,original_receipt_item_id) references public.purchase_receipt_items(tenant_id,id),
  foreign key (tenant_id,warehouse_id) references public.inventory_warehouses(tenant_id,id)
);
-- Receipt-based trade payables, separate from Empresia subscription billing.
-- No RPC in this migration records a payment or modifies real bank balances.
create table public.supplier_payables (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  purchase_order_id uuid not null,
  supplier_id uuid not null,
  currency text not null check (currency in ('DOP','USD','EUR')),
  amount_due numeric(24,2) not null default 0 check (amount_due >= 0 and amount_due <> 'NaN'::numeric),
  updated_at timestamptz not null default now(),
  unique (tenant_id,purchase_order_id),
  foreign key (tenant_id,purchase_order_id) references public.purchase_orders(tenant_id,id),
  foreign key (tenant_id,supplier_id) references public.suppliers(tenant_id,id)
);
create table private.erp_purchase_requests (
  tenant_id uuid not null references public.tenants(id),
  idempotency_key text not null,
  request jsonb not null,
  response jsonb,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (tenant_id,idempotency_key)
);
alter table private.erp_purchase_requests enable row level security;
revoke all on private.erp_purchase_requests from public,anon,authenticated;

do $policies$
declare t text;
begin
  foreach t in array array['suppliers','purchase_orders','purchase_order_items',
    'purchase_receipts','purchase_receipt_items','supplier_payables'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy %I on public.%I for select to authenticated using
      (auth.uid() is not null and private.has_tenant_access(tenant_id)
       and private.crm_active_tenant_matches(tenant_id))',t || '_tenant_read',t);
  end loop;
end $policies$;
create index purchase_orders_tenant_supplier on public.purchase_orders(tenant_id,supplier_id);
create index purchase_order_items_order on public.purchase_order_items(tenant_id,purchase_order_id);
create index purchase_receipts_order on public.purchase_receipts(tenant_id,purchase_order_id,created_at desc);
create index purchase_receipt_items_receipt on public.purchase_receipt_items(tenant_id,receipt_id);
create index purchase_receipt_items_original on public.purchase_receipt_items(tenant_id,original_receipt_item_id)
  where original_receipt_item_id is not null;
create index supplier_payables_supplier on public.supplier_payables(tenant_id,supplier_id);

create function private.erp_purchase_command(
  p_tenant_id uuid,p_action text,p_payload jsonb,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
  v_request jsonb := jsonb_build_object('action',p_action,'payload',p_payload);
  v_saved private.erp_purchase_requests%rowtype;
  v_result jsonb;
  v_supplier public.suppliers%rowtype;
  v_order public.purchase_orders%rowtype;
  v_line public.purchase_order_items%rowtype;
  v_original public.purchase_receipt_items%rowtype;
  v_receipt public.purchase_receipts%rowtype;
  v_row jsonb; v_stock jsonb;
  v_id uuid; v_item_id uuid; v_warehouse uuid; v_original_id uuid;
  v_qty numeric; v_cost numeric; v_amount numeric; v_total numeric := 0;
  v_returned numeric; v_refunded numeric;
begin
  if auth.uid() is null or not coalesce(private.has_tenant_access(p_tenant_id),false)
    or not coalesce(private.can_manage_crm(p_tenant_id),false)
    or not coalesce(private.crm_active_tenant_matches(p_tenant_id),false) then
    raise exception 'purchase_forbidden' using errcode='42501';
  end if;
  if p_action is null or p_action not in ('supplier_save','order_create','order_approve','receive','return')
    or p_payload is null or jsonb_typeof(p_payload)<>'object' then
    raise exception 'invalid_purchase_command' using errcode='22023';
  end if;
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) not between 1 and 160 then
    raise exception 'invalid_idempotency_key' using errcode='22023';
  end if;
  insert into private.erp_purchase_requests(tenant_id,idempotency_key,request,created_by)
    values(p_tenant_id,p_idempotency_key,v_request,auth.uid()) on conflict do nothing;
  select * into strict v_saved from private.erp_purchase_requests
    where tenant_id=p_tenant_id and idempotency_key=p_idempotency_key for update;
  if v_saved.request <> v_request then
    raise exception 'idempotency_payload_mismatch' using errcode='22023';
  end if;
  if v_saved.response is not null then return v_saved.response; end if;

  if p_action='supplier_save' then
    if length(btrim(coalesce(p_payload->>'name',''))) not between 1 and 200 then
      raise exception 'invalid_supplier_name' using errcode='22023';
    end if;
    v_id := nullif(p_payload->>'id','')::uuid;
    if v_id is null then
      insert into public.suppliers(tenant_id,name,tax_identifier,email,phone,address,created_by)
      values(p_tenant_id,btrim(p_payload->>'name'),nullif(p_payload->>'tax_identifier',''),
        nullif(p_payload->>'email',''),nullif(p_payload->>'phone',''),nullif(p_payload->>'address',''),auth.uid())
      returning * into v_supplier;
    else
      update public.suppliers set name=btrim(p_payload->>'name'),
        tax_identifier=nullif(p_payload->>'tax_identifier',''),email=nullif(p_payload->>'email',''),
        phone=nullif(p_payload->>'phone',''),address=nullif(p_payload->>'address',''),
        active=coalesce((p_payload->>'active')::boolean,true),updated_at=now()
      where tenant_id=p_tenant_id and id=v_id returning * into v_supplier;
      if not found then raise exception 'supplier_not_found' using errcode='P0002'; end if;
    end if;
    v_result:=jsonb_build_object('supplier',to_jsonb(v_supplier));
  elsif p_action='order_create' then
    select * into v_supplier from public.suppliers
      where tenant_id=p_tenant_id and id=(p_payload->>'supplier_id')::uuid and active for share;
    if not found then raise exception 'supplier_not_found' using errcode='P0002'; end if;
    if coalesce(p_payload->>'currency','') not in ('DOP','USD','EUR') then
      raise exception 'invalid_currency' using errcode='22023';
    end if;
    if jsonb_typeof(p_payload->'lines') is distinct from 'array'
      or jsonb_array_length(p_payload->'lines') not between 1 and 200 then
      raise exception 'invalid_purchase_lines' using errcode='22023';
    end if;
    v_id:=gen_random_uuid();
    insert into public.purchase_orders(id,tenant_id,supplier_id,order_number,currency,notes,created_by)
    values(v_id,p_tenant_id,v_supplier.id,'OC-' || upper(replace(v_id::text,'-','')),
      p_payload->>'currency',p_payload->>'notes',auth.uid()) returning * into v_order;
    -- The same UUID order as receipt/return and order fulfillment, independent
    -- of the order in which browser clients submitted their lines.
    for v_row in select value from jsonb_array_elements(p_payload->'lines')
      order by (value->>'inventory_item_id')::uuid loop
      if coalesce(v_row->>'quantity','') !~ '^[0-9]+(\.[0-9]{1,6})?$'
        or coalesce(v_row->>'unit_cost','') !~ '^[0-9]+(\.[0-9]{1,4})?$' then
        raise exception 'invalid_purchase_decimal' using errcode='22023';
      end if;
      v_qty:=(v_row->>'quantity')::numeric; v_cost:=(v_row->>'unit_cost')::numeric;
      if v_qty<=0 or v_qty>=1e12 or v_cost>=1e12 then
        raise exception 'invalid_purchase_decimal' using errcode='22023';
      end if;
      v_item_id:=(v_row->>'inventory_item_id')::uuid;
      perform 1 from public.inventory_items where tenant_id=p_tenant_id and id=v_item_id and active for share;
      if not found then raise exception 'inventory_item_not_found' using errcode='P0002'; end if;
      insert into public.purchase_order_items(tenant_id,purchase_order_id,inventory_item_id,quantity,unit_cost)
        values(p_tenant_id,v_order.id,v_item_id,v_qty,v_cost);
    end loop;
    v_result:=jsonb_build_object('order',to_jsonb(v_order),'lines',
      (select jsonb_agg(to_jsonb(i) order by i.id) from public.purchase_order_items i
        where i.tenant_id=p_tenant_id and i.purchase_order_id=v_order.id));
  else
    select * into v_order from public.purchase_orders
      where tenant_id=p_tenant_id and id=(p_payload->>'order_id')::uuid for update;
    if not found then raise exception 'purchase_order_not_found' using errcode='P0002'; end if;
    if p_action='order_approve' then
      if v_order.status<>'draft' then raise exception 'purchase_not_draft' using errcode='22023'; end if;
      update public.purchase_orders set status='approved',approved_by=auth.uid(),approved_at=now()
        where tenant_id=p_tenant_id and id=v_order.id returning * into v_order;
      v_result:=jsonb_build_object('order',to_jsonb(v_order));
    else
      if v_order.status not in ('approved','partial','received') then
        raise exception 'purchase_not_approved' using errcode='22023';
      end if;
      if length(btrim(coalesce(p_payload->>'reference',''))) not between 1 and 200 then
        raise exception 'missing_supplier_document_reference' using errcode='22023';
      end if;
      if jsonb_typeof(p_payload->'lines') is distinct from 'array'
        or jsonb_array_length(p_payload->'lines') not between 1 and 200 then
        raise exception 'invalid_purchase_lines' using errcode='22023';
      end if;
      insert into public.purchase_receipts(tenant_id,purchase_order_id,kind,reference,notes,created_by)
      values(p_tenant_id,v_order.id,case when p_action='receive' then 'receipt' else 'return' end,
        btrim(p_payload->>'reference'),p_payload->>'notes',auth.uid()) returning * into v_receipt;
      -- All receipts for this PO serialize on its row. Inventory rows lock in UUID
      -- order to avoid transfer/receipt deadlocks for overlapping item sets.
      for v_row in select j.value from jsonb_array_elements(p_payload->'lines') j
        join public.purchase_order_items i on i.id=(j.value->>'order_item_id')::uuid
          and i.tenant_id=p_tenant_id and i.purchase_order_id=v_order.id
        order by i.inventory_item_id,i.id loop
        if coalesce(v_row->>'quantity','') !~ '^[0-9]+(\.[0-9]{1,6})?$' then
          raise exception 'invalid_purchase_quantity' using errcode='22023';
        end if;
        v_qty:=(v_row->>'quantity')::numeric;
        if v_qty<=0 or v_qty>=1e12 then raise exception 'invalid_purchase_quantity' using errcode='22023'; end if;
        select * into strict v_line from public.purchase_order_items
          where tenant_id=p_tenant_id and purchase_order_id=v_order.id
            and id=(v_row->>'order_item_id')::uuid for update;
        v_warehouse:=nullif(v_row->>'warehouse_id','')::uuid;
        v_original_id:=null;
        if p_action='receive' then
          if v_line.received_quantity+v_qty>v_line.quantity then
            raise exception 'purchase_over_receipt' using errcode='22023';
          end if;
          v_amount:=round(v_qty*v_line.unit_cost,2);
        else
          v_original_id:=(v_row->>'original_receipt_item_id')::uuid;
          select ri.* into v_original from public.purchase_receipt_items ri
            join public.purchase_receipts r on r.tenant_id=ri.tenant_id and r.id=ri.receipt_id
            where ri.tenant_id=p_tenant_id and ri.id=v_original_id and r.kind='receipt'
              and ri.purchase_order_item_id=v_line.id and ri.purchase_order_id=v_order.id;
          if not found then raise exception 'original_receipt_not_found' using errcode='P0002'; end if;
          if v_warehouse is distinct from v_original.warehouse_id then
            raise exception 'return_warehouse_mismatch' using errcode='22023';
          end if;
          select coalesce(sum(quantity),0),coalesce(sum(amount),0) into v_returned,v_refunded
            from public.purchase_receipt_items where tenant_id=p_tenant_id
              and original_receipt_item_id=v_original.id;
          if v_qty+v_returned>v_original.quantity or v_qty>v_line.received_quantity then
            raise exception 'purchase_over_return' using errcode='22023';
          end if;
          -- Cumulative proportional rounding prevents partial returns refunding
          -- more than the original receipt value; full return refunds exactly it.
          v_amount:=round(v_original.amount*(v_qty+v_returned)/v_original.quantity,2)-v_refunded;
        end if;
        v_id:=gen_random_uuid();
        v_stock:=public.erp_inventory_move(p_tenant_id,v_line.inventory_item_id,
          case when p_action='receive' then 'entry' else 'exit' end,v_qty,
          'purchase:' || v_receipt.id::text || ':' || v_id::text,v_warehouse,null,null,
          v_line.unit_cost,'Compra ' || v_order.order_number || ' / ' || v_receipt.reference);
        insert into public.purchase_receipt_items(id,tenant_id,receipt_id,purchase_order_id,
          purchase_order_item_id,original_receipt_item_id,warehouse_id,quantity,amount,inventory_operation_id)
        values(v_id,p_tenant_id,v_receipt.id,v_order.id,v_line.id,v_original_id,v_warehouse,
          v_qty,v_amount,(v_stock->>'operation_id')::uuid);
        update public.purchase_order_items set received_quantity=received_quantity+
          case when p_action='receive' then v_qty else -v_qty end
          where tenant_id=p_tenant_id and id=v_line.id;
        v_total:=v_total+v_amount;
      end loop;
      -- A joined loop must not silently discard foreign or nonexistent lines.
      if (select count(*) from public.purchase_receipt_items
          where tenant_id=p_tenant_id and receipt_id=v_receipt.id)
          <>jsonb_array_length(p_payload->'lines') then
        raise exception 'purchase_line_not_found' using errcode='P0002';
      end if;
      insert into public.supplier_payables(tenant_id,purchase_order_id,supplier_id,currency,amount_due)
        values(p_tenant_id,v_order.id,v_order.supplier_id,v_order.currency,0)
        on conflict (tenant_id,purchase_order_id) do nothing;
      update public.supplier_payables set amount_due=amount_due+
        case when p_action='receive' then v_total else -v_total end,updated_at=now()
        where tenant_id=p_tenant_id and purchase_order_id=v_order.id;
      update public.purchase_orders set status=case
        when not exists(select 1 from public.purchase_order_items where tenant_id=p_tenant_id
          and purchase_order_id=v_order.id and received_quantity<quantity) then 'received'
        when exists(select 1 from public.purchase_order_items where tenant_id=p_tenant_id
          and purchase_order_id=v_order.id and received_quantity>0) then 'partial' else 'approved' end
        where tenant_id=p_tenant_id and id=v_order.id returning * into v_order;
      v_result:=jsonb_build_object('order',to_jsonb(v_order),'receipt',to_jsonb(v_receipt),
        'lines',(select jsonb_agg(to_jsonb(i) order by i.id) from public.purchase_receipt_items i
          where i.tenant_id=p_tenant_id and i.receipt_id=v_receipt.id),
        'payable',(select to_jsonb(p) from public.supplier_payables p
          where p.tenant_id=p_tenant_id and p.purchase_order_id=v_order.id));
    end if;
  end if;
  update private.erp_purchase_requests set response=v_result
    where tenant_id=p_tenant_id and idempotency_key=p_idempotency_key;
  return v_result;
end $fn$;
revoke all on function private.erp_purchase_command(uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function private.erp_purchase_command(uuid,text,jsonb,text) to authenticated;

create function public.erp_purchase_command(
  p_tenant_id uuid,p_action text,p_payload jsonb,p_idempotency_key text
) returns jsonb language sql security invoker set search_path = '' as $fn$
  select private.erp_purchase_command(p_tenant_id,p_action,p_payload,p_idempotency_key);
$fn$;
revoke all on function public.erp_purchase_command(uuid,text,jsonb,text) from public,anon;
grant execute on function public.erp_purchase_command(uuid,text,jsonb,text) to authenticated;

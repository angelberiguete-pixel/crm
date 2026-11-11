-- Synthetic fixtures only. Execute after baseline + native inventory/purchasing
-- migrations in a disposable PostgreSQL database. Every change is rolled back.
begin;
insert into auth.users(id) values
 ('aa110000-0000-0000-0000-000000000001'),
 ('aa110000-0000-0000-0000-000000000002');
insert into public.tenants(id,name,slug,owner_user_id) values
 ('bb110000-0000-0000-0000-000000000001','Purchasing test A','erp-purchase-test-a','aa110000-0000-0000-0000-000000000001'),
 ('bb110000-0000-0000-0000-000000000002','Purchasing test B','erp-purchase-test-b','aa110000-0000-0000-0000-000000000002');
insert into public.memberships(tenant_id,user_id,role,status) values
 ('bb110000-0000-0000-0000-000000000001','aa110000-0000-0000-0000-000000000001','manager','active'),
 ('bb110000-0000-0000-0000-000000000002','aa110000-0000-0000-0000-000000000002','manager','active');
insert into public.inventory_items(id,tenant_id,sku,name) values
 ('cc110000-0000-0000-0000-000000000001','bb110000-0000-0000-0000-000000000001','PURCHASE-TEST','Synthetic item');
insert into public.suppliers(tenant_id,name) values
 ('bb110000-0000-0000-0000-000000000002','Other tenant supplier');
select set_config('request.jwt.claims','{"sub":"aa110000-0000-0000-0000-000000000001","role":"authenticated"}',true);
set local role authenticated;

do $test$
declare
  t uuid := 'bb110000-0000-0000-0000-000000000001';
  item uuid := 'cc110000-0000-0000-0000-000000000001';
  s uuid; o uuid; line uuid; original uuid;
  r jsonb; again jsonb; payload jsonb;
  before_receipts bigint; before_operations bigint; before_requests bigint;
begin
  if (select count(*) from public.suppliers) <> 0 then raise exception 'RLS exposed supplier'; end if;
  begin
    perform public.erp_purchase_command('bb110000-0000-0000-0000-000000000002',
      'supplier_save','{"name":"Forbidden"}','forbidden');
    raise exception 'Cross tenant write allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.suppliers(tenant_id,name) values(t,'Direct write');
    raise exception 'Direct supplier write allowed';
  exception when insufficient_privilege then null; end;
  r:=public.erp_purchase_command(t,'supplier_save','{"name":"Synthetic Supplier"}','supplier-1');
  s:=(r->'supplier'->>'id')::uuid;
  again:=public.erp_purchase_command(t,'supplier_save','{"name":"Synthetic Supplier"}','supplier-1');
  if again<>r or (select count(*) from public.suppliers)<>1 then raise exception 'Supplier replay duplicated'; end if;
  begin
    perform public.erp_purchase_command(t,'supplier_save','{"name":"Changed payload"}','supplier-1');
    raise exception 'Idempotency mismatch accepted';
  exception when invalid_parameter_value then null; end;
  payload:=jsonb_build_object('supplier_id',s,'currency','DOP','lines',jsonb_build_array(
    jsonb_build_object('inventory_item_id',item,'quantity','10','unit_cost','2.2550')));
  r:=public.erp_purchase_command(t,'order_create',payload,'order-1');
  o:=(r->'order'->>'id')::uuid; line:=(r->'lines'->0->>'id')::uuid;
  if r->'order'->>'status'<>'draft' then raise exception 'Order not draft'; end if;
  payload:=jsonb_build_object('order_id',o,'reference','SYNTHETIC-RECEIPT','lines',
    jsonb_build_array(jsonb_build_object('order_item_id',line,'quantity','4')));
  begin
    perform public.erp_purchase_command(t,'receive',payload,'draft-receipt');
    raise exception 'Draft received';
  exception when invalid_parameter_value then null; end;
  perform public.erp_purchase_command(t,'order_approve',jsonb_build_object('order_id',o),'approve-1');
  r:=public.erp_purchase_command(t,'receive',payload,'receipt-1');
  original:=(r->'lines'->0->>'id')::uuid;
  if (r->'payable'->>'amount_due')::numeric<>9.02 or
    (select on_hand from public.inventory_items where id=item)<>4 then
    raise exception 'Receipt stock/AP mismatch';
  end if;
  again:=public.erp_purchase_command(t,'receive',payload,'receipt-1');
  if r<>again or (select on_hand from public.inventory_items where id=item)<>4
    or (select count(*) from public.purchase_receipts)<>1 then
    raise exception 'Receipt replay changed inventory';
  end if;
  before_receipts:=(select count(*) from public.purchase_receipts);
  before_operations:=(select count(*) from public.inventory_operations);
  begin
    perform public.erp_purchase_command(t,'receive',jsonb_set(payload,'{lines,0,quantity}','"7"'),'over-receipt');
    raise exception 'Over receipt accepted';
  exception when invalid_parameter_value then null; end;
  -- Valid first line followed by an unknown line must undo its stock operation.
  begin
    perform public.erp_purchase_command(t,'receive',jsonb_set(payload,'{lines}',
      jsonb_build_array(jsonb_build_object('order_item_id',line,'quantity','1'),
        jsonb_build_object('order_item_id','cc110000-0000-0000-0000-000000000099','quantity','1'))),'mixed-tenant-receipt');
    raise exception 'Unknown receipt line accepted';
  exception when no_data_found then null; end;
  if (select count(*) from public.purchase_receipts)<>before_receipts or
    (select count(*) from public.inventory_operations)<>before_operations or
    (select on_hand from public.inventory_items where id=item)<>4 then
    raise exception 'Failed receipt leaked partial stock/ledger';
  end if;
  payload:=jsonb_build_object('order_id',o,'reference','SYNTHETIC-RETURN','lines',
    jsonb_build_array(jsonb_build_object('order_item_id',line,'original_receipt_item_id',original,'quantity','2')));
  r:=public.erp_purchase_command(t,'return',payload,'return-1');
  if (r->'payable'->>'amount_due')::numeric<>4.51 or
    (select on_hand from public.inventory_items where id=item)<>2 then
    raise exception 'Return stock/AP mismatch';
  end if;
  again:=public.erp_purchase_command(t,'return',payload,'return-1');
  if again<>r or (select on_hand from public.inventory_items where id=item)<>2 then
    raise exception 'Return replay duplicated';
  end if;
  begin
    perform public.erp_purchase_command(t,'return',jsonb_set(payload,'{lines,0,quantity}','"3"'),'over-return');
    raise exception 'Over return accepted';
  exception when invalid_parameter_value then null; end;
  perform public.erp_inventory_move(t,item,'exit',2,'synthetic-exhaustion');
  before_receipts:=(select count(*) from public.purchase_receipts);
  begin
    perform public.erp_purchase_command(t,'return',jsonb_set(payload,'{lines,0,quantity}','"1"'),'no-stock-return');
    raise exception 'Negative inventory return accepted';
  exception when check_violation then null; end;
  if (select count(*) from public.purchase_receipts)<>before_receipts or
    (select amount_due from public.supplier_payables where purchase_order_id=o)<>4.51 then
    raise exception 'Failed return changed AP or receipts';
  end if;
  begin
    update public.supplier_payables set amount_due=0 where purchase_order_id=o;
    raise exception 'Direct payable write allowed';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.purchase_receipts where purchase_order_id=o;
    raise exception 'Receipt history mutable';
  exception when insufficient_privilege then null; end;
  raise notice 'Purchasing: tenant isolation, supplier/order replay, approval, atomic receipt/return, decimal AP, rollback and write protection passed';
end $test$;
reset role;
rollback;

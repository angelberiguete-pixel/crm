-- Staging fixture: verify canonical single-writer policy and double-entry isolation.
insert into private.erp_dual_tenant_enrollments(tenant_id,enabled,enabled_at)
 values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true,now());
insert into public.erp_dual_domain_policy(tenant_id,domain,canonical_system,sync_mode)
 values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','inventory','empresia','disabled'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','orders','empresia','disabled'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','accounting','empresia','disabled');

insert into public.orders(id,tenant_id) values
 ('aaaaaaaa-0000-4000-8000-000000000011','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
 ('bbbbbbbb-0000-4000-8000-000000000011','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
do $qa$
declare a uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
begin
 if (select count(*) from public.erp_dual_outbox)<>1 then
  raise exception 'Expected one event for enrolled Empresia only';end if;
 update public.orders
  set updated_at=updated_at+interval '1 second'
  where tenant_id=a and id='aaaaaaaa-0000-4000-8000-000000000011';
 if (select count(*) from public.erp_dual_outbox)<>2 then
  raise exception 'Order status changes were not observed';end if;
 update public.orders set updated_at=updated_at
 where tenant_id=a and id='aaaaaaaa-0000-4000-8000-000000000011';
 if (select count(*) from public.erp_dual_outbox)<>2 then
  raise exception 'Duplicate retry generated a second event';end if;
end;
$qa$;

insert into public.inventory_movements(tenant_id) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
insert into public.customer_payments(tenant_id) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

do $qa$
declare a uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
begin
 if (select count(*) from public.erp_dual_outbox where tenant_id=a)<>4 then
  raise exception 'Expected exactly four canonical events for three domains';end if;
 if exists (select 1 from public.erp_dual_outbox where tenant_id<>a) then
  raise exception 'Disabled Family Power emitted events';end if;
 if exists (select 1 from public.erp_dual_outbox where metadata ?| array['price','customer_name','amount','api_key']) then
  raise exception 'Sensitive data leaked into outbox';end if;
end;
$qa$;

insert into public.erp_dual_external_ids(
 tenant_id,connection_id,provider,domain,canonical_id,external_model,external_id,status)
 values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-0000-4000-8000-000000000001','odoo','orders',
 'aaaaaaaa-0000-4000-8000-000000000011','sale.order','42','verified'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-0000-4000-8000-000000000002','dolibarr','orders',
 'aaaaaaaa-0000-4000-8000-000000000011','commande','21','observed');
do $qa$
declare a uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
begin
 if (select count(*) from public.erp_dual_external_ids where tenant_id=a)<>2 then
  raise exception 'One canonical ID should be mapped separately to each engine';end if;
 begin
  insert into public.erp_dual_external_ids(
    tenant_id,connection_id,provider,domain,canonical_id,external_model,external_id)
  values(a,'aaaaaaaa-0000-4000-8000-000000000001','odoo','orders',
    'aaaaaaaa-0000-4000-8000-000000000011','sale.order','duplicate');
  raise exception 'Duplicate canonical mapping incorrectly succeeded';
 exception when unique_violation then null;
 end;
 begin
  insert into public.erp_dual_external_ids(
    tenant_id,connection_id,provider,domain,canonical_id,external_model,external_id)
  values(a,'bbbbbbbb-0000-4000-8000-000000000001','odoo','orders',
    gen_random_uuid(),'sale.order','other-tenant');
  raise exception 'Cross-tenant external ID incorrectly succeeded';
 exception when insufficient_privilege then null;
 end;
 begin
  insert into public.erp_sync_jobs(
    tenant_id,connection_id,job_type,entity_type)
  values(a,'aaaaaaaa-0000-4000-8000-000000000001','push','order');
  raise exception 'Legacy bidirectional canonical push was allowed';
 exception when insufficient_privilege then null;
 end;
 insert into public.erp_sync_jobs(
  tenant_id,connection_id,job_type,entity_type)
 values(a,'aaaaaaaa-0000-4000-8000-000000000001','healthcheck',null);
 insert into public.erp_sync_jobs(
  tenant_id,connection_id,job_type,entity_type)
 values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'bbbbbbbb-0000-4000-8000-000000000001','push','order');
end;
$qa$;

-- Browser role is never the privileged writer, even for owners.
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select set_config('request.active_tenant','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
set role authenticated;
do $qa$
begin
 if (select count(*) from public.erp_dual_external_ids)<>2 then
  raise exception 'Owner cannot inspect own ERP mappings';end if;
 if (select count(*) from public.erp_dual_connection_status)<>2 then
  raise exception 'Provider status view leaked or hid a tenant connection';end if;
 if (select count(*) from public.erp_dual_outbox)<>4 then
  raise exception 'Outbox tenant isolation incorrect';end if;
 begin
  update public.erp_dual_domain_policy set sync_mode='mirror';
  raise exception 'Browser wrongly gained write permission';
 exception when insufficient_privilege then null;
 end;
end;
$qa$;
reset role;
select set_config('request.active_tenant','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);
set role authenticated;
do $qa$
begin
 if exists(select 1 from public.erp_dual_external_ids) then raise exception 'Family Power leaked mappings';end if;
 if exists(select 1 from public.erp_dual_outbox) then raise exception 'Family Power leaked outbox';end if;
 if (select count(*) from public.erp_dual_connection_status)<>0 then
  raise exception 'Owner of Empresia could see Family Power connections';end if;
end;
$qa$;
reset role;

-- Kill switch: future operations must stop generating canonical outbox events.
update private.erp_dual_tenant_enrollments set enabled=false
where tenant_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
insert into public.orders(tenant_id) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
do $qa$
begin
 if (select count(*) from public.erp_dual_outbox)<>4 then
  raise exception 'Kill switch did not stop event emission';end if;
end;
$qa$;

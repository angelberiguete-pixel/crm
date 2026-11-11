-- Isolated integration test. Must run only against disposable PostgreSQL service.
insert into public.tenants(id,slug) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','energy-test'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','clinic-test');
-- Only explicitly enrolled test tenants activate their event capture.
insert into private.empresia_brain_tenant_pilots(tenant_id,enabled,activated_at) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true,now()),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true,now());
insert into public.memberships(tenant_id,user_id,role) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','owner'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','owner');

insert into public.products(id,tenant_id,name,sku,status,sale_price,currency,metadata)
values('33333333-3333-4333-8333-333333333333','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'Inversor 3.6 kW de prueba','INV-3.6','active',18000,'DOP','{"price_verified":false}');
insert into public.contacts(id,tenant_id,display_name) values
 ('aaaaaaaa-0000-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Cliente A'),
 ('bbbbbbbb-0000-4000-8000-000000000001','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Cliente B');
insert into public.conversations(id,tenant_id,contact_id) values
 ('aaaaaaaa-0000-4000-8000-000000000002','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-0000-4000-8000-000000000001'),
 ('bbbbbbbb-0000-4000-8000-000000000002','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','bbbbbbbb-0000-4000-8000-000000000001');
insert into public.messages(id,tenant_id,conversation_id,direction,body) values
 ('aaaaaaaa-0000-4000-8000-000000000003','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-0000-4000-8000-000000000002','inbound',
 'Buenas, tienen inversores de 3.6 kW y cuanto cuestan?'),
 ('aaaaaaaa-0000-4000-8000-000000000004','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-0000-4000-8000-000000000002','outbound',
 'Respuesta de ejemplo no real'),
 ('bbbbbbbb-0000-4000-8000-000000000003','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','bbbbbbbb-0000-4000-8000-000000000002','inbound',
 'Consulta de prueba de clinica');

do $test$
declare
 a uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 b uuid:='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 d_id uuid;
 price_verified boolean;
begin
 if (select count(*) from public.empresia_brain_events where tenant_id=a)<>2
 then raise exception 'Expected two A events (contact + inbound)'; end if;
 if (select count(*) from public.empresia_brain_events where tenant_id=b)<>2
 then raise exception 'Expected two B events (contact + inbound)'; end if;
 if (select count(*) from public.empresia_brain_events where tenant_id=a and event_type='message.inbound')<>1
 then raise exception 'Outbound message should not generate inbound proposal'; end if;
 select d.id,(d.evidence->'context'->>'price_verified')::boolean
 into d_id,price_verified
 from public.empresia_brain_decisions d
 join public.empresia_brain_events e on e.tenant_id=d.tenant_id and e.id=d.event_id
 where d.tenant_id=a and e.source_id='aaaaaaaa-0000-4000-8000-000000000003';
 if d_id is null or price_verified is distinct from false then
   raise exception 'Unverified price was treated as verified'; end if;
 if exists(select 1 from public.empresia_brain_decisions where evidence::text like '%Buenas%')
 then raise exception 'Raw message leaked into decision evidence'; end if;
 perform set_config('qa.a_decision',d_id::text,false);
 perform set_config('qa.b_decision',(
  select d.id::text from public.empresia_brain_decisions d
  where d.tenant_id=b order by d.created_at limit 1
 ),false);
end;
$test$;

-- A non-enrolled company must remain invisible to the brain.
insert into public.tenants(id,slug) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','family-power');
insert into public.contacts(id,tenant_id,display_name) values
 ('cccccccc-0000-4000-8000-000000000001','cccccccc-cccc-4ccc-8ccc-cccccccccccc','Protected customer');
do $test$
begin
 if exists(select 1 from public.empresia_brain_events where tenant_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc')
 then raise exception 'Non-enrolled Family Power generated brain event'; end if;
end;
$test$;

-- Real authenticated permissions, not service-role browser data.
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select set_config('request.active_tenant','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
set role authenticated;
do $test$
declare
 a uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 b uuid:='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 d_id uuid:=current_setting('qa.a_decision')::uuid;
 b_id uuid:=current_setting('qa.b_decision')::uuid;
 task_id uuid;
 second_id uuid;
begin
 if (select count(*) from public.empresia_brain_events)<>2
 then raise exception 'Cross-tenant event leak'; end if;
 if (select count(*) from public.empresia_brain_decisions)<>2
 then raise exception 'Cross-tenant decision leak'; end if;
 if (select count(*) from public.empresia_brain_events where tenant_id=b)<>0
 then raise exception 'Tenant B is visible to tenant A'; end if;
 begin
   perform public.empresia_brain_review(b,b_id,true);
   raise exception 'Cross-tenant review unexpectedly succeeded';
 exception when insufficient_privilege then null;
 end;

 begin
   perform public.empresia_brain_execute_task(a,d_id);
   raise exception 'Execution without approval unexpectedly succeeded';
 exception when insufficient_privilege then null;
 end;
 if public.empresia_brain_review(a,d_id,true)<>'approved' then
   raise exception 'Authorized approval failed'; end if;
 task_id:=public.empresia_brain_execute_task(a,d_id);
 second_id:=public.empresia_brain_execute_task(a,d_id);
 if task_id is null or second_id is distinct from task_id
 then raise exception 'Internal task was not idempotent'; end if;
 if (select count(*) from public.tasks where tenant_id=a)<>1
 then raise exception 'Unexpected task duplication'; end if;
 if (select count(*) from public.tasks where tenant_id=b)<>0
 then raise exception 'Task crossed tenant boundary'; end if;
 update public.tasks set status='done',completed_at=now() where id=task_id and tenant_id=a;
 if (select count(*) from public.empresia_brain_outcomes where tenant_id=a and outcome_key='task_completed')<>1
 then raise exception 'Real task completion not recorded'; end if;
 if (select count(*) from public.empresia_brain_learning where tenant_id=a and task_completed_count=1)<>1
 then raise exception 'Learning report did not reflect observed outcome'; end if;
end;
$test$;
reset role;
do $test$
begin
 if (select count(*) from public.customer_payments)<>0
 then raise exception 'Unexpected payment mutation'; end if;
end;
$test$;

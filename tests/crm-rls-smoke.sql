begin;
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('e29e61bf-3ea9-4a4e-872c-0b49030e5101','authenticated','authenticated','crm-test-rollback-a@example.invalid','{}','{}',now(),now()),('e29e61bf-3ea9-4a4e-872c-0b49030e5102','authenticated','authenticated','crm-test-rollback-b@example.invalid','{}','{}',now(),now());
set local role authenticated;
select set_config('request.jwt.claim.sub','e29e61bf-3ea9-4a4e-872c-0b49030e5101',true);
do $test$
declare a uuid; b uuid; co uuid; ct uuid; pi uuid; st uuid; op uuid; visible integer;
begin
a:=public.create_tenant('CRM rollback test A','crm-rollback-a-'||substr(gen_random_uuid()::text,1,8));
pi:=public.initialize_revenue_command_center(a);
insert into public.companies(tenant_id,name,city,sector) values(a,'Fixture company','Santo Domingo','Solar') returning id into co;
insert into public.contacts(tenant_id,company_id,display_name,status) values(a,co,'Fixture contact','prospect') returning id into ct;
update public.contacts set job_title='Director' where id=ct and tenant_id=a;
select id into st from public.pipeline_stages where tenant_id=a and pipeline_id=pi and stage_type='open' order by position limit 1;
insert into public.opportunities(tenant_id,pipeline_id,stage_id,company_id,contact_id,title,value,setup_value,mrr_value,total_contract_value,probability,status,currency) values(a,pi,st,co,ct,'Fixture opportunity',210000,75000,45000,210000,0.05,'open','DOP') returning id into op;
insert into public.tasks(tenant_id,title,status,priority,opportunity_id,due_at) values(a,'Fixture follow-up','todo','normal',op,now());
select count(*) into visible from public.revenue_command_center_opportunities where id=op;
if visible<>1 then raise exception 'Opportunity view failed'; end if;
perform set_config('request.jwt.claim.sub','e29e61bf-3ea9-4a4e-872c-0b49030e5102',true);
b:=public.create_tenant('CRM rollback test B','crm-rollback-b-'||substr(gen_random_uuid()::text,1,8));
select count(*) into visible from public.contacts where id=ct;
if visible<>0 then raise exception 'Cross-tenant read allowed'; end if;
update public.contacts set display_name='Forbidden' where id=ct;
get diagnostics visible=row_count;
if visible<>0 then raise exception 'Cross-tenant update allowed'; end if;
begin
insert into public.companies(tenant_id,name) values(a,'Forbidden');
raise exception 'Cross-tenant insert allowed';
exception when insufficient_privilege then null;
end;
end $test$;
rollback;
select 'PASS: onboarding, pipeline, company/contact/opportunity/task writes and cross-tenant read/update/insert isolation; fixtures rolled back' as result;

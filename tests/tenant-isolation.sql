-- Run with the administrative test connection. Every fixture rolls back.
-- These are SQL authorization tests, not browser/session tests.
begin;
create temporary table qa_ids(k text primary key, id uuid not null);
insert into qa_ids select k,gen_random_uuid() from unnest(array['owner_a','owner_b','agent_a','viewer_a','tenant_a','tenant_b','company_a','company_b','contact_a','contact_b']) k;
create temporary table qa_results(check_name text, passed boolean, detail text);
grant select on qa_ids to authenticated;
grant insert,select on qa_results to authenticated;
insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
select id,'qa-'||id::text||'@example.invalid','{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb from qa_ids where k in ('owner_a','owner_b','agent_a','viewer_a');
insert into public.tenants(id,name,slug,owner_user_id)
select t.id,'QA Isolation '||t.k,'qa-'||t.id::text,u.id from qa_ids t join qa_ids u on u.k=case t.k when 'tenant_a' then 'owner_a' else 'owner_b' end where t.k in ('tenant_a','tenant_b');
insert into public.tenant_subscriptions(tenant_id,plan_id,status)
select id,(select id from public.plans where code='enterprise'),'active' from qa_ids where k in ('tenant_a','tenant_b');
insert into public.memberships(tenant_id,user_id,role,status)
select t.id,u.id,case when u.k like 'owner_%' then 'owner' when u.k='viewer_a' then 'viewer' else 'agent' end,'active'
from qa_ids u join qa_ids t on t.k=case when u.k='owner_b' then 'tenant_b' else 'tenant_a' end where u.k in ('owner_a','owner_b','agent_a','viewer_a');
insert into public.companies(id,tenant_id,name)
select c.id,t.id,'QA Company '||c.k from qa_ids c join qa_ids t on t.k=case c.k when 'company_a' then 'tenant_a' else 'tenant_b' end where c.k in ('company_a','company_b');
insert into public.contacts(id,tenant_id,company_id,display_name)
select c.id,t.id,co.id,'QA Contact '||c.k from qa_ids c join qa_ids t on t.k=case c.k when 'contact_a' then 'tenant_a' else 'tenant_b' end join qa_ids co on co.k=case c.k when 'contact_a' then 'company_a' else 'company_b' end where c.k in ('contact_a','contact_b');

do $$ begin perform set_config('request.jwt.claims',jsonb_build_object('sub',(select id from qa_ids where k='owner_a'),'role','authenticated')::text,true); end $$;
set local role authenticated;
do $$ declare a uuid := (select id from qa_ids where k='tenant_a'); b uuid := (select id from qa_ids where k='tenant_b'); n integer; denied boolean;
begin
 insert into qa_results values('A reads own contacts',exists(select 1 from public.contacts where tenant_id=a),null);
 insert into qa_results values('A cannot read B contacts',not exists(select 1 from public.contacts where tenant_id=b),null);
 denied:=false; begin insert into public.contacts(tenant_id,display_name) values(b,'QA forbidden'); exception when insufficient_privilege then denied:=true; end;
 insert into qa_results values('A cannot insert B contacts',denied,null);
 update public.contacts set display_name='QA forbidden' where tenant_id=b; get diagnostics n=row_count;
 insert into qa_results values('A cannot update B contacts',n=0,null);
 delete from public.contacts where tenant_id=b; get diagnostics n=row_count;
 insert into qa_results values('A cannot delete B contacts',n=0,null);
 denied:=false; begin insert into public.contacts(tenant_id,company_id,display_name) values(a,(select id from qa_ids where k='company_b'),'QA cross relation'); exception when foreign_key_violation then denied:=true; end;
 insert into qa_results values('Cross-tenant contact/company relation rejected',denied,null);
 denied:=false; begin insert into public.tasks(tenant_id,title,assigned_user_id) values(a,'QA cross assignee',(select id from qa_ids where k='owner_b')); exception when foreign_key_violation then denied:=true; end;
 insert into qa_results values('Cross-tenant task assignee rejected',denied,null);
 insert into public.contacts(tenant_id,display_name) values(a,'QA allowed') returning id into a;
 update public.contacts set display_name='QA updated' where id=a; get diagnostics n=row_count;
 insert into qa_results values('Owner can create and update own contact',n=1,null);
 delete from public.contacts where id=a; get diagnostics n=row_count;
 insert into qa_results values('Owner can delete own contact',n=1,null);
 denied:=false; begin perform public.set_active_tenant(b); exception when others then denied:=sqlerrm like '%membership%'; end;
 insert into qa_results values('Tenant-switch RPC rejects non-member',denied,null);
 denied:=false; begin perform public.platform_create_client_tenant('QA denied','qa-denied','essential','services',null); exception when others then denied:=sqlerrm ilike '%admin%' or sqlerrm ilike '%permission%'; end;
 insert into qa_results values('Platform create RPC rejects tenant owner',denied,null);
end $$;
reset role;
do $$ begin perform set_config('request.jwt.claims',jsonb_build_object('sub',(select id from qa_ids where k='owner_b'),'role','authenticated')::text,true); end $$;
set local role authenticated;
insert into qa_results select 'B reads own and cannot read A',exists(select 1 from public.contacts where tenant_id=(select id from qa_ids where k='tenant_b')) and not exists(select 1 from public.contacts where tenant_id=(select id from qa_ids where k='tenant_a')),null;
reset role;
do $$ begin perform set_config('request.jwt.claims',jsonb_build_object('sub',(select id from qa_ids where k='viewer_a'),'role','authenticated')::text,true); end $$;
set local role authenticated;
do $$ declare denied boolean:=false; begin
 insert into qa_results values('Viewer can read own contacts',exists(select 1 from public.contacts where tenant_id=(select id from qa_ids where k='tenant_a')),null);
 begin insert into public.contacts(tenant_id,display_name) values((select id from qa_ids where k='tenant_a'),'QA forbidden viewer'); exception when insufficient_privilege then denied:=true; end;
 insert into qa_results values('Viewer cannot create contact',denied,null);
end $$;
reset role;
update public.memberships set status='suspended' where user_id=(select id from qa_ids where k='agent_a');
do $$ begin perform set_config('request.jwt.claims',jsonb_build_object('sub',(select id from qa_ids where k='agent_a'),'role','authenticated')::text,true); end $$;
set local role authenticated;
insert into qa_results select 'Suspended membership cannot read contacts',not exists(select 1 from public.contacts where tenant_id=(select id from qa_ids where k='tenant_a')),null;
reset role;
update public.tenants set status='suspended' where id=(select id from qa_ids where k='tenant_a');
do $$ begin perform set_config('request.jwt.claims',jsonb_build_object('sub',(select id from qa_ids where k='owner_a'),'role','authenticated')::text,true); end $$;
set local role authenticated;
insert into qa_results select 'Suspended tenant cannot read contacts',not exists(select 1 from public.contacts where tenant_id=(select id from qa_ids where k='tenant_a')),null;
do $$ declare denied boolean:=false; begin
 begin insert into public.contacts(tenant_id,display_name) values((select id from qa_ids where k='tenant_a'),'QA forbidden suspended tenant'); exception when insufficient_privilege then denied:=true; end;
 insert into qa_results values('Suspended tenant cannot write contacts',denied,null);
end $$;
reset role;
do $$ begin if exists(select 1 from qa_results where not passed) then raise exception 'Tenant isolation regression failed'; end if; end $$;
select jsonb_build_object('total',count(*),'passed',count(*) filter(where passed),'failed',coalesce(jsonb_agg(check_name) filter(where not passed),'[]'::jsonb)) as isolation_results from qa_results;
rollback;

begin;
create temporary table qa_invite_ids(k text primary key,id uuid not null);
insert into qa_invite_ids select k,gen_random_uuid() from unnest(array['user','owner','tenant_a','tenant_b']) k;
create temporary table qa_invite_results(check_name text,passed boolean);
grant select on qa_invite_ids to authenticated;
grant insert,select on qa_invite_results to authenticated;
insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
select id,'qa-invite-'||id::text||'@example.invalid','{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb from qa_invite_ids where k in ('user','owner');
insert into public.tenants(id,name,slug,owner_user_id)
select id,'QA Invitation '||k,'qa-invite-'||id::text,(select id from qa_invite_ids where k='owner') from qa_invite_ids where k in ('tenant_a','tenant_b');
insert into public.tenant_subscriptions(tenant_id,plan_id,status)
select id,(select id from public.plans where code='enterprise'),'active' from qa_invite_ids where k in ('tenant_a','tenant_b');
insert into public.memberships(tenant_id,user_id,role,status)
select id,(select id from qa_invite_ids where k='user'),'agent','invited' from qa_invite_ids where k in ('tenant_a','tenant_b');
do $$ begin perform set_config('request.jwt.claims',jsonb_build_object('sub',(select id from qa_invite_ids where k='user'),'role','authenticated')::text,true);end $$;
set local role authenticated;
do $$ declare r jsonb;begin
  r:=public.accept_my_tenant_invites();
  insert into qa_invite_results values('Two invitations activated',r->>'activated'='2');
  insert into qa_invite_results values('Several memberships require explicit selection',r->>'needs_selection'='true' and r->>'tenant_id' is null);
  perform public.set_active_tenant((select id from qa_invite_ids where k='tenant_b'));
  r:=public.accept_my_tenant_invites();
  insert into qa_invite_results values('Existing explicit company preserved',r->>'tenant_id'=(select id::text from qa_invite_ids where k='tenant_b'));
  insert into qa_invite_results values('Acceptance is idempotent',r->>'activated'='0');
end $$;
reset role;
update public.tenants set status='suspended' where id=(select id from qa_invite_ids where k='tenant_b');
set local role authenticated;
do $$ declare r jsonb;begin
  r:=public.accept_my_tenant_invites();
  insert into qa_invite_results values('Suspended selection replaced by sole operational membership',r->>'tenant_id'=(select id::text from qa_invite_ids where k='tenant_a'));
end $$;
reset role;
update public.memberships set status='invited' where tenant_id=(select id from qa_invite_ids where k='tenant_b');
set local role authenticated;
do $$ declare r jsonb;begin
  r:=public.accept_my_tenant_invites();
  insert into qa_invite_results values('Invitation to suspended tenant is not activated',r->>'activated'='0' and r->>'membership_count'='1');
end $$;
reset role;
do $$ begin if exists(select 1 from qa_invite_results where not passed) then raise exception 'Invitation regression failed';end if;end $$;
select jsonb_build_object('total',count(*),'passed',count(*) filter(where passed),'failed',coalesce(jsonb_agg(check_name) filter(where not passed),'[]'::jsonb)) as invitation_results from qa_invite_results;
rollback;

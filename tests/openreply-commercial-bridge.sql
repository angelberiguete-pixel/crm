-- Real PostgreSQL verification. All fixtures, memberships, approvals and effects
-- are rolled back. No real Instagram account, messages or paid services.
create temporary table qa_or_ids(k text primary key,id uuid not null);
insert into qa_or_ids select k,gen_random_uuid() from unnest(array['owner_a','owner_b','tenant_a','tenant_b','channel_a','channel_b','route_a','route_b','product_a','product_b']) k;
create temporary table qa_or_results(check_name text primary key,passed boolean not null);
grant select on qa_or_ids to authenticated,service_role;
grant select,insert on qa_or_results to authenticated,service_role;
insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
select id,'qa-openreply-'||id::text||'@example.invalid','{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb
from qa_or_ids where k in ('owner_a','owner_b');
insert into public.tenants(id,name,slug,owner_user_id)
select t.id,'QA OpenReply '||t.k,'qa-openreply-'||t.id::text,u.id from qa_or_ids t join qa_or_ids u
on u.k=case t.k when 'tenant_a' then 'owner_a' else 'owner_b' end where t.k in ('tenant_a','tenant_b');
insert into public.tenant_subscriptions(tenant_id,plan_id,status)
select id,(select id from public.plans where code='enterprise'),'active' from qa_or_ids where k in ('tenant_a','tenant_b');
insert into public.memberships(tenant_id,user_id,role,status)
select t.id,u.id,'owner','active' from qa_or_ids t join qa_or_ids u on u.k=case t.k when 'tenant_a' then 'owner_a' else 'owner_b' end
where t.k in ('tenant_a','tenant_b') on conflict(tenant_id,user_id) do update set role='owner',status='active';
insert into public.channels(id,tenant_id,provider,name,status,external_account_id)
select c.id,t.id,'instagram','QA OpenReply','connected',case c.k when 'channel_a' then '178400000000001' else '178400000000002' end
from qa_or_ids c join qa_or_ids t on t.k=case c.k when 'channel_a' then 'tenant_a' else 'tenant_b' end where c.k in ('channel_a','channel_b');
insert into public.products(id,tenant_id,sku,name,sale_price,currency,tax_rate,stock_snapshot,stock_synced_at)
select p.id,t.id,'QA-OR-'||p.id::text,'Producto ficticio de prueba',1000,'DOP',18,10,now()
from qa_or_ids p join qa_or_ids t on t.k=case p.k when 'product_a' then 'tenant_a' else 'tenant_b' end where p.k in ('product_a','product_b');
insert into public.openreply_account_routes(id,tenant_id,channel_id,workspace_id,instagram_account_id,verified_at,verified_reference,is_enabled)
select r.id,t.id,c.id,case r.k when 'route_a' then 'workspace_a' else 'workspace_b' end,
case r.k when 'route_a' then '178400000000001' else '178400000000002' end,now()-interval '1 minute','QA simulation only',true
from qa_or_ids r join qa_or_ids t on t.k=case r.k when 'route_a' then 'tenant_a' else 'tenant_b' end
join qa_or_ids c on c.k=case r.k when 'route_a' then 'channel_a' else 'channel_b' end where r.k in ('route_a','route_b');

select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from qa_or_ids where k='owner_a'),'role','authenticated')::text,true);
set local role authenticated;
select public.set_active_tenant((select id from qa_or_ids where k='tenant_a'));
select public.openreply_approve_campaign_product((select id from qa_or_ids where k='tenant_a'),(select id from qa_or_ids where k='route_a'),'campaign_a',(select id from qa_or_ids where k='product_a'),1,false);
insert into qa_or_results values('approval_snapshots_real_product_price',
 (select approved_price=1000 and approved_tax_rate=18 and approved_currency='DOP' from public.openreply_campaign_products where campaign_id='campaign_a'));
do $$ begin
 begin
  perform public.openreply_approve_campaign_product((select id from qa_or_ids where k='tenant_a'),(select id from qa_or_ids where k='route_a'),'foreign_product',(select id from qa_or_ids where k='product_b'),1,false);
  raise exception 'foreign product approval succeeded';
 exception when sqlstate '22023' then insert into qa_or_results values('foreign_product_rejected',true); end;
 begin
  perform public.ingest_verified_openreply_event('{}'::jsonb,repeat('a',64));
  raise exception 'browser could call ingest';
 exception when insufficient_privilege then insert into qa_or_results values('browser_cannot_ingest',true); end;
 begin
  insert into public.openreply_campaign_products select * from public.openreply_campaign_products;
  raise exception 'browser could forge approval';
 exception when insufficient_privilege then insert into qa_or_results values('browser_cannot_forge_approval',true); end;
end $$;
reset role;

create temporary table qa_or_event(event jsonb);
insert into qa_or_event values(jsonb_build_object('version',1,'eventId','comment_1','type','instagram.comment_received',
 'workspaceId','workspace_a','instagramAccountId','178400000000001','campaignId','campaign_a','occurredAt',to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
 'data',jsonb_build_object('externalId','comment.1','personId','555000000000001','text','COTIZAR')));
grant select on qa_or_event to service_role;
set local role service_role;
insert into qa_or_results select 'comment_stored',public.ingest_verified_openreply_event(event,repeat('a',64))='stored' from qa_or_event;
insert into qa_or_results select 'comment_is_not_a_lead',not exists(select 1 from public.contacts where tenant_id=(select id from qa_or_ids where k='tenant_a'));
insert into qa_or_results select 'provider_acceptance_stored',public.ingest_verified_openreply_event(event||jsonb_build_object('eventId','reply_1','type','instagram.reply_accepted','data',jsonb_build_object('externalId','reply.1','personId','555000000000001','text','')),repeat('b',64))='stored' from qa_or_event;
insert into qa_or_results select 'acceptance_does_not_invent_delivery_or_lead',not exists(select 1 from public.contacts where tenant_id=(select id from qa_or_ids where k='tenant_a'));
reset role;
update qa_or_event set event=event||jsonb_build_object('eventId','message_1','type','instagram.message_received','data',jsonb_build_object('externalId','mid.1','personId','555000000000001','text','COTIZACIÓN'));
set local role service_role;
insert into qa_or_results select 'inbound_message_stored',public.ingest_verified_openreply_event(event,repeat('c',64))='stored' from qa_or_event;
insert into qa_or_results select 'duplicate_event_no_second_effect',public.ingest_verified_openreply_event(event,repeat('c',64))='duplicate' from qa_or_event;
insert into qa_or_results select 'payload_conflict_rejected',public.ingest_verified_openreply_event(event,repeat('d',64))='event_conflict' from qa_or_event;
insert into qa_or_results select 'cross_account_route_rejected',public.ingest_verified_openreply_event(event||'{"instagramAccountId":"178400000000002"}'::jsonb,repeat('e',64))='unverified_route' from qa_or_event;
insert into qa_or_results select 'payload_cannot_set_tenant',public.ingest_verified_openreply_event(event||jsonb_build_object('tenantId',(select id from qa_or_ids where k='tenant_b')),repeat('f',64))='invalid_event' from qa_or_event;
insert into qa_or_results select 'exactly_one_contact_conversation_quote_task',
 (select count(*)=1 from public.contacts where tenant_id=(select id from qa_or_ids where k='tenant_a'))
 and (select count(*)=1 from public.conversations where tenant_id=(select id from qa_or_ids where k='tenant_a'))
 and (select count(*)=1 from public.quotations where tenant_id=(select id from qa_or_ids where k='tenant_a'))
 and (select count(*)=1 from public.tasks where tenant_id=(select id from qa_or_ids where k='tenant_a'));
insert into qa_or_results select 'quote_is_draft_with_approved_totals',status='draft' and subtotal=1000 and tax_total=180 and total=1180 and metadata->>'requires_human_review'='true'
from public.quotations where tenant_id=(select id from qa_or_ids where k='tenant_a');
insert into qa_or_results select 'no_cross_tenant_effects',not exists(select 1 from public.contacts where tenant_id=(select id from qa_or_ids where k='tenant_b'))
and not exists(select 1 from public.quotations where tenant_id=(select id from qa_or_ids where k='tenant_b'));
reset role;
update public.products set sale_price=1200 where id=(select id from qa_or_ids where k='product_a');
set local role service_role;
insert into qa_or_results select 'changed_price_stores_message_without_quote',public.ingest_verified_openreply_event(event||jsonb_build_object('eventId','message_2','data',jsonb_build_object('externalId','mid.2','personId','555000000000001','text','cotizar')),repeat('1',64))='stored' from qa_or_event;
insert into qa_or_results select 'changed_price_blocks_quote',
 (select count(*)=1 from public.quotations where tenant_id=(select id from qa_or_ids where k='tenant_a'))
 and exists(select 1 from public.openreply_event_receipts where event_id='message_2' and action_code='quote_blocked_product_changed');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from qa_or_ids where k='owner_b'),'role','authenticated')::text,true);
set local role authenticated;
select public.set_active_tenant((select id from qa_or_ids where k='tenant_b'));
insert into qa_or_results select 'other_owner_cannot_read_approval',count(*)=0 from public.openreply_campaign_products;
insert into qa_or_results select 'other_owner_cannot_read_contacts',count(*)=0 from public.contacts where tenant_id=(select id from qa_or_ids where k='tenant_a');
insert into qa_or_results select 'other_owner_cannot_read_conversations_quotes_tasks',
 not exists(select 1 from public.conversations where tenant_id=(select id from qa_or_ids where k='tenant_a'))
 and not exists(select 1 from public.messages where tenant_id=(select id from qa_or_ids where k='tenant_a'))
 and not exists(select 1 from public.quotations where tenant_id=(select id from qa_or_ids where k='tenant_a'))
 and not exists(select 1 from public.tasks where tenant_id=(select id from qa_or_ids where k='tenant_a'));
with changed as (update public.contacts set display_name='Forbidden change' where tenant_id=(select id from qa_or_ids where k='tenant_a') returning id)
insert into qa_or_results select 'other_owner_cannot_modify_contacts',count(*)=0 from changed;
with changed as (update public.conversations set subject='Forbidden change' where tenant_id=(select id from qa_or_ids where k='tenant_a') returning id)
insert into qa_or_results select 'other_owner_cannot_modify_conversations',count(*)=0 from changed;
with changed as (update public.quotations set notes='Forbidden change' where tenant_id=(select id from qa_or_ids where k='tenant_a') returning id)
insert into qa_or_results select 'other_owner_cannot_modify_quotes',count(*)=0 from changed;
with changed as (update public.tasks set title='Forbidden change' where tenant_id=(select id from qa_or_ids where k='tenant_a') returning id)
insert into qa_or_results select 'other_owner_cannot_modify_tasks',count(*)=0 from changed;
do $$ begin
 begin
  perform public.openreply_bridge_status((select id from qa_or_ids where k='tenant_a'));
  raise exception 'foreign bridge status readable';
 exception when insufficient_privilege then insert into qa_or_results values('other_owner_cannot_read_bridge_status',true); end;
end $$;
reset role;
do $$ begin
 if exists(select 1 from qa_or_results where not passed) then raise exception 'OpenReply database regression failed'; end if;
end $$;
select count(*) as passed_checks,bool_and(passed) as all_passed,jsonb_agg(check_name order by check_name) as checks from qa_or_results;

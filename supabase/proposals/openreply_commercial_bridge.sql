-- Receive-only OpenReply integration. No routes, campaign approvals, sends or AI
-- spending are enabled by this migration. Family Power is explicitly excluded.
create table public.openreply_account_routes (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id) on delete cascade,
 channel_id uuid not null,
 workspace_id text not null check(workspace_id ~ '^[A-Za-z0-9_-]{1,100}$'),
 instagram_account_id text not null unique check(instagram_account_id ~ '^[0-9]{5,30}$'),
 verified_at timestamptz,
 verified_reference text check(length(verified_reference) between 8 and 200),
 is_enabled boolean not null default false,
 created_at timestamptz not null default now(),
 unique(workspace_id,instagram_account_id), unique(tenant_id,id),
 foreign key(tenant_id,channel_id) references public.channels(tenant_id,id) on delete cascade,
 check(not is_enabled or (verified_at is not null and verified_reference is not null))
);
create table public.openreply_campaign_products (
 tenant_id uuid not null,
 route_id uuid not null,
 campaign_id text not null check(campaign_id ~ '^[A-Za-z0-9_-]{1,100}$'),
 product_id uuid not null,
 quantity numeric not null check(quantity>0 and quantity<=1000),
 approved_price numeric not null check(approved_price>0),
 approved_tax_rate numeric not null check(approved_tax_rate between 0 and 100),
 approved_currency text not null check(approved_currency ~ '^[A-Z]{3}$'),
 product_updated_at timestamptz not null,
 quote_phrases text[] not null default array['cotizar','cotizacion','quiero cotizacion'],
 allow_untracked_stock boolean not null default false,
 approved_by uuid not null references auth.users(id),
 approved_at timestamptz not null default now(),
 is_enabled boolean not null default true,
 primary key(route_id,campaign_id),
 foreign key(tenant_id,route_id) references public.openreply_account_routes(tenant_id,id) on delete cascade,
 foreign key(tenant_id,product_id) references public.products(tenant_id,id) on delete cascade
);
create table public.openreply_external_contacts (
 tenant_id uuid not null,
 route_id uuid not null,
 person_id text not null check(person_id ~ '^[0-9]{5,30}$'),
 contact_id uuid not null,
 primary key(route_id,person_id),
 foreign key(tenant_id,route_id) references public.openreply_account_routes(tenant_id,id) on delete cascade,
 foreign key(tenant_id,contact_id) references public.contacts(tenant_id,id) on delete cascade
);
create table public.openreply_event_receipts (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null,
 route_id uuid not null,
 event_id text not null check(event_id ~ '^[A-Za-z0-9_-]{1,100}$'),
 event_type text not null check(event_type in ('instagram.comment_received','instagram.reply_accepted','instagram.message_received')),
 external_id text not null check(length(external_id) between 1 and 256),
 payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
 occurred_at timestamptz not null,
 received_at timestamptz not null default now(),
 action_code text not null default 'recorded',
 contact_id uuid, conversation_id uuid, quotation_id uuid, task_id uuid,
 unique(route_id,event_id), unique(route_id,event_type,external_id),
 foreign key(tenant_id,route_id) references public.openreply_account_routes(tenant_id,id) on delete cascade,
 foreign key(tenant_id,contact_id) references public.contacts(tenant_id,id) on delete set null(contact_id),
 foreign key(tenant_id,conversation_id) references public.conversations(tenant_id,id) on delete set null(conversation_id),
 foreign key(tenant_id,quotation_id) references public.quotations(tenant_id,id) on delete set null(quotation_id),
 foreign key(tenant_id,task_id) references public.tasks(tenant_id,id) on delete set null(task_id)
);
create index openreply_receipts_recent on public.openreply_event_receipts(tenant_id,received_at desc);
create index openreply_campaign_product_fk on public.openreply_campaign_products(tenant_id,product_id);
create index openreply_contact_fk on public.openreply_external_contacts(tenant_id,contact_id);

alter table public.openreply_account_routes enable row level security;
alter table public.openreply_campaign_products enable row level security;
alter table public.openreply_external_contacts enable row level security;
alter table public.openreply_event_receipts enable row level security;
revoke all on public.openreply_account_routes,public.openreply_campaign_products,
 public.openreply_external_contacts,public.openreply_event_receipts from PUBLIC,anon,authenticated;
grant select,insert,update,delete on public.openreply_account_routes,public.openreply_campaign_products,
 public.openreply_external_contacts,public.openreply_event_receipts to service_role;
-- Owners can inspect approvals, but cannot forge prices or approval provenance.
grant select on public.openreply_campaign_products to authenticated;
create policy openreply_approvals_admin_read on public.openreply_campaign_products
 for select to authenticated using(private.is_tenant_admin(tenant_id));

create function private.openreply_approve_campaign_product(
 p_tenant_id uuid,p_route_id uuid,p_campaign_id text,p_product_id uuid,
 p_quantity numeric,p_allow_untracked_stock boolean
) returns void language plpgsql security definer set search_path=''
as $$
declare v_product public.products%rowtype;
begin
 if auth.uid() is null or not private.is_tenant_admin(p_tenant_id) then
   raise exception 'tenant_admin_required' using errcode='42501';
 end if;
 if not exists(select 1 from public.tenants where id=p_tenant_id and status='active' and slug<>'family-power')
   or not exists(select 1 from public.openreply_account_routes where tenant_id=p_tenant_id and id=p_route_id and is_enabled and verified_at is not null)
   or p_campaign_id is null or p_campaign_id !~ '^[A-Za-z0-9_-]{1,100}$'
   or p_quantity is null or p_quantity<=0 or p_quantity>1000 or p_allow_untracked_stock is null then
   raise exception 'invalid_campaign_approval' using errcode='22023';
 end if;
 select * into v_product from public.products where tenant_id=p_tenant_id and id=p_product_id and status='active' for share;
 if v_product.id is null or v_product.sale_price<=0 or length(btrim(v_product.sku))=0 or v_product.currency !~ '^[A-Z]{3}$' then
   raise exception 'approved_product_required' using errcode='22023';
 end if;
 insert into public.openreply_campaign_products(tenant_id,route_id,campaign_id,product_id,quantity,
   approved_price,approved_tax_rate,approved_currency,product_updated_at,allow_untracked_stock,approved_by)
 values(p_tenant_id,p_route_id,p_campaign_id,p_product_id,p_quantity,v_product.sale_price,
   v_product.tax_rate,v_product.currency,v_product.updated_at,p_allow_untracked_stock,auth.uid())
 on conflict(route_id,campaign_id) do update set product_id=excluded.product_id,quantity=excluded.quantity,
   approved_price=excluded.approved_price,approved_tax_rate=excluded.approved_tax_rate,
   approved_currency=excluded.approved_currency,product_updated_at=excluded.product_updated_at,
   allow_untracked_stock=excluded.allow_untracked_stock,approved_by=auth.uid(),approved_at=now(),is_enabled=true;
end;
$$;
revoke all on function private.openreply_approve_campaign_product(uuid,uuid,text,uuid,numeric,boolean) from PUBLIC,anon;
grant execute on function private.openreply_approve_campaign_product(uuid,uuid,text,uuid,numeric,boolean) to authenticated;
create function public.openreply_approve_campaign_product(
 p_tenant_id uuid,p_route_id uuid,p_campaign_id text,p_product_id uuid,
 p_quantity numeric default 1,p_allow_untracked_stock boolean default false
) returns void language sql security invoker set search_path=''
as $$ select private.openreply_approve_campaign_product(p_tenant_id,p_route_id,p_campaign_id,p_product_id,p_quantity,p_allow_untracked_stock); $$;
revoke all on function public.openreply_approve_campaign_product(uuid,uuid,text,uuid,numeric,boolean) from PUBLIC,anon;
grant execute on function public.openreply_approve_campaign_product(uuid,uuid,text,uuid,numeric,boolean) to authenticated;

create function public.ingest_verified_openreply_event(p_event jsonb,p_payload_hash text)
returns text language plpgsql security invoker set search_path=''
as $$
#variable_conflict use_variable
declare
 r public.openreply_account_routes%rowtype;
 mapping public.openreply_campaign_products%rowtype;
 product public.products%rowtype;
 receipt_id uuid; existing_hash text; contact_id uuid; new_contact_id uuid; conversation_id uuid; message_id uuid; quote_id uuid; task_id uuid; assignee uuid;
 event_id text; event_type text; external_id text; person_id text; campaign_id text; body text; at_time timestamptz;
 action_code text := 'lead_received'; normalized text;
begin
 if p_event is null or jsonb_typeof(p_event)<>'object' or octet_length(p_event::text)>65536
   or p_payload_hash is null or p_payload_hash !~ '^[a-f0-9]{64}$'
   or p_event->'version' is distinct from '1'::jsonb
   or exists(select 1 from jsonb_object_keys(p_event) k where k not in ('version','eventId','type','workspaceId','instagramAccountId','campaignId','occurredAt','data'))
   or jsonb_typeof(p_event->'data') is distinct from 'object'
 then return 'invalid_event'; end if;
 event_id:=p_event->>'eventId'; event_type:=p_event->>'type';
 external_id:=p_event#>>'{data,externalId}'; person_id:=p_event#>>'{data,personId}';
 campaign_id:=p_event->>'campaignId'; body:=p_event#>>'{data,text}';
 if event_id is null or event_id !~ '^[A-Za-z0-9_-]{1,100}$'
   or event_type is null or event_type not in ('instagram.comment_received','instagram.reply_accepted','instagram.message_received')
   or p_event->>'workspaceId' is null or p_event->>'workspaceId' !~ '^[A-Za-z0-9_-]{1,100}$'
   or p_event->>'instagramAccountId' is null or p_event->>'instagramAccountId' !~ '^[0-9]{5,30}$'
   or external_id is null or length(external_id) not between 1 and 256
   or person_id is null or person_id !~ '^[0-9]{5,30}$'
   or (campaign_id is not null and campaign_id !~ '^[A-Za-z0-9_-]{1,100}$')
   or body is null or length(body)>1600 or (event_type<>'instagram.reply_accepted' and length(btrim(body))=0)
   or exists(select 1 from jsonb_object_keys(p_event->'data') k where k not in ('externalId','personId','text','displayName'))
 then return 'invalid_event'; end if;
 begin at_time:=(p_event->>'occurredAt')::timestamptz; exception when others then return 'invalid_event'; end;
 if at_time is null or at_time>now()+interval '5 minutes' then return 'invalid_event'; end if;
 -- The source account resolves the tenant. A payload cannot nominate one.
 select rt.* into r from public.openreply_account_routes rt
 join public.channels ch on ch.tenant_id=rt.tenant_id and ch.id=rt.channel_id
 join public.tenants t on t.id=rt.tenant_id
 where rt.workspace_id=p_event->>'workspaceId' and rt.instagram_account_id=p_event->>'instagramAccountId'
   and rt.is_enabled and rt.verified_at is not null and t.status='active' and t.slug<>'family-power'
   and ch.provider='instagram' and ch.status='connected' and ch.external_account_id=rt.instagram_account_id
 for share of rt;
 if r.id is null or at_time<r.verified_at-interval '5 minutes' then return 'unverified_route'; end if;
 insert into public.openreply_event_receipts(tenant_id,route_id,event_id,event_type,external_id,payload_hash,occurred_at)
 values(r.tenant_id,r.id,event_id,event_type,external_id,p_payload_hash,at_time)
 on conflict do nothing returning id into receipt_id;
 if receipt_id is null then
   select er.payload_hash into existing_hash from public.openreply_event_receipts er
   where er.route_id=r.id and (er.event_id=event_id or (er.event_type=event_type and er.external_id=external_id)) limit 1;
   return case when existing_hash=p_payload_hash then 'duplicate' else 'event_conflict' end;
 end if;
 -- Comments and provider acceptance are evidence, not customer consent or leads.
 if event_type<>'instagram.message_received' then return 'stored'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(r.id::text||':'||person_id,0));
 select ec.contact_id into contact_id from public.openreply_external_contacts ec where ec.route_id=r.id and ec.person_id=person_id;
 if contact_id is null then
   insert into public.contacts(tenant_id,display_name,source,status,metadata)
   values(r.tenant_id,coalesce(nullif(left(btrim(p_event#>>'{data,displayName}'),120),''),'Contacto Instagram'),'instagram','lead',
     jsonb_build_object('origin','openreply','instagram_account_id',r.instagram_account_id,'instagram_person_id',person_id,'name_verification','provider_display_only'))
   returning id into contact_id;
   new_contact_id:=contact_id;
   insert into public.openreply_external_contacts values(r.tenant_id,r.id,person_id,contact_id);
 end if;
 insert into public.conversations(tenant_id,channel_id,contact_id,external_thread_id,status,subject,last_message_at,unread_count,metadata)
 values(r.tenant_id,r.channel_id,contact_id,'openreply:'||person_id,'open','Instagram',at_time,1,
   jsonb_build_object('origin','openreply','requires_human',true,'openreply_route_id',r.id))
 on conflict(tenant_id,channel_id,external_thread_id) do update set
   last_message_at=greatest(public.conversations.last_message_at,excluded.last_message_at),
   unread_count=public.conversations.unread_count+1,status='open'
 returning id into conversation_id;
 insert into public.messages(tenant_id,conversation_id,direction,sender_type,sender_contact_id,external_message_id,message_type,body,status,metadata)
 values(r.tenant_id,conversation_id,'inbound','contact',contact_id,external_id,'text',body,'received',
   jsonb_build_object('origin','openreply','openreply_event_id',event_id,'campaign_id',campaign_id)) returning id into message_id;
 select cp.* into mapping from public.openreply_campaign_products cp
 where cp.route_id=r.id and cp.campaign_id=campaign_id and cp.is_enabled;
 normalized:=btrim(regexp_replace(translate(lower(body),'áéíóúü','aeiouu'),'[^a-z0-9]+',' ','g'));
 if mapping.product_id is not null and normalized=any(mapping.quote_phrases) then
   select * into product from public.products p where p.tenant_id=r.tenant_id and p.id=mapping.product_id for share;
   if product.id is null or product.status<>'active' or product.sale_price<>mapping.approved_price
     or product.tax_rate<>mapping.approved_tax_rate or product.currency<>mapping.approved_currency
     or product.updated_at<>mapping.product_updated_at then action_code:='quote_blocked_product_changed';
   elsif not mapping.allow_untracked_stock and (product.stock_snapshot is null or product.stock_snapshot<mapping.quantity
     or product.stock_synced_at is null or product.stock_synced_at<now()-interval '48 hours') then action_code:='quote_blocked_stock';
   else
     quote_id:=gen_random_uuid();
     insert into public.quotations(id,tenant_id,quote_number,contact_id,status,currency,notes,metadata)
     values(quote_id,r.tenant_id,'IG-'||replace(quote_id::text,'-',''),contact_id,'draft',product.currency,
       'Borrador de Instagram. Requiere revisión humana antes de enviar.',
       jsonb_build_object('origin','openreply','requires_human_review',true,'openreply_event_id',event_id,'campaign_id',campaign_id));
     insert into public.quotation_items(tenant_id,quotation_id,product_id,position,sku_snapshot,description,quantity,unit_price,tax_rate)
     values(r.tenant_id,quote_id,product.id,0,product.sku,product.name,mapping.quantity,mapping.approved_price,mapping.approved_tax_rate);
     action_code:='quote_draft_created';
   end if;
 elsif campaign_id is not null and mapping.product_id is null then action_code:='quote_mapping_pending';
 end if;
 select m.user_id into assignee from public.memberships m where m.tenant_id=r.tenant_id and m.status='active' and m.role in ('owner','admin')
 order by case m.role when 'owner' then 0 else 1 end,m.created_at limit 1;
 if quote_id is null then
   select t.id into task_id from public.tasks t where t.tenant_id=r.tenant_id and t.contact_id=contact_id
     and t.status in ('todo','in_progress') and t.metadata->>'openreply_route_id'=r.id::text order by t.created_at limit 1;
 end if;
 if task_id is null then
   insert into public.tasks(tenant_id,title,description,status,priority,due_at,assigned_user_id,contact_id,source,metadata)
   values(r.tenant_id,case when quote_id is null then 'Dar seguimiento a conversación de Instagram' else 'Revisar cotización de Instagram y dar seguimiento' end,
     'Solicitud recibida por OpenReply. Revisar la conversación y los datos aprobados antes de responder.',
     'todo','normal',now()+interval '1 day',assignee,contact_id,'import',
     jsonb_build_object('origin','openreply','openreply_route_id',r.id,'conversation_id',conversation_id,'quotation_id',quote_id,'requires_human',true))
   returning id into task_id;
 end if;
 -- Existing CRM triggers enqueue live automations. Hold only the events from
 -- these new records before committing, so ingestion cannot invoke paid AI,
 -- external sends or another quote without a separate human decision.
 update public.automation_events ae set status='skipped',processed_at=now(),last_error='openreply_human_review_required'
 where ae.tenant_id=r.tenant_id and ae.status='queued' and
   ((ae.entity_type='contact' and ae.entity_id=new_contact_id)
     or (ae.entity_type='message' and ae.entity_id=message_id)
     or (ae.entity_type='quotation' and ae.entity_id=quote_id));
 update public.openreply_event_receipts er set contact_id=contact_id,conversation_id=conversation_id,
   quotation_id=quote_id,task_id=task_id,action_code=action_code where er.id=receipt_id;
 return 'stored';
end;
$$;
revoke all on function public.ingest_verified_openreply_event(jsonb,text) from PUBLIC,anon,authenticated;
grant execute on function public.ingest_verified_openreply_event(jsonb,text) to service_role;

create function private.openreply_bridge_status(p_tenant_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
begin
 if auth.uid() is null or not private.is_tenant_admin(p_tenant_id)
   or not exists(select 1 from public.tenants where id=p_tenant_id and status='active' and slug<>'family-power') then
   raise exception 'tenant_admin_required' using errcode='42501';
 end if;
 return jsonb_build_object('tenant_id',p_tenant_id,'routes',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'channel_id',r.channel_id,
   'is_enabled',r.is_enabled,'verified_at',r.verified_at)) from public.openreply_account_routes r where r.tenant_id=p_tenant_id),'[]'::jsonb),
   'received_events',(select count(*) from public.openreply_event_receipts where tenant_id=p_tenant_id),
   'draft_quotes',(select count(*) from public.openreply_event_receipts where tenant_id=p_tenant_id and action_code='quote_draft_created'),
   'last_received_at',(select max(received_at) from public.openreply_event_receipts where tenant_id=p_tenant_id));
end;
$$;
revoke all on function private.openreply_bridge_status(uuid) from PUBLIC,anon;
grant execute on function private.openreply_bridge_status(uuid) to authenticated;
create function public.openreply_bridge_status(p_tenant_id uuid)
returns jsonb language sql security invoker set search_path=''
as $$ select private.openreply_bridge_status(p_tenant_id); $$;
revoke all on function public.openreply_bridge_status(uuid) from PUBLIC,anon;
grant execute on function public.openreply_bridge_status(uuid) to authenticated;

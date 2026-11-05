-- OpenWA (unofficial WhatsApp Web): fail-closed, receive-only tenant routing.
-- No route is created by a webhook. Operator verifies ownership and approves
-- a named OpenWA session + existing tenant channel before enabling traffic.
create table if not exists public.openwa_whatsapp_routes(
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id) on delete cascade,
 channel_id uuid not null,
 session_id text not null unique check(session_id ~ '^[a-zA-Z0-9_-]{1,80}$'),
 business_phone_e164 text not null unique check(business_phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
 verified_at timestamptz not null,
 verified_reference text not null check(length(verified_reference) between 8 and 200),
 is_enabled boolean not null default false,
 created_at timestamptz not null default now(),
 foreign key(tenant_id,channel_id) references public.channels(tenant_id,id) on delete cascade,
 unique(tenant_id,channel_id)
);
alter table public.openwa_whatsapp_routes enable row level security;
revoke all on public.openwa_whatsapp_routes from public,anon,authenticated;
grant select,insert,update on public.openwa_whatsapp_routes to service_role;
comment on table public.openwa_whatsapp_routes is
 'Operator-controlled mapping from one trusted OpenWA runtime session to an existing CRM tenant and WhatsApp channel.';

create table if not exists public.openwa_whatsapp_inbound_receipts(
 id bigint generated always as identity primary key,
 tenant_id uuid not null,
 channel_id uuid not null,
 session_id text not null,
 external_message_id text not null check(length(external_message_id) between 3 and 256),
 created_at timestamptz not null default now(),
 foreign key(tenant_id,channel_id) references public.channels(tenant_id,id) on delete cascade,
 unique(session_id,external_message_id)
);
create index if not exists openwa_wa_receipts_tenant_recent
 on public.openwa_whatsapp_inbound_receipts(tenant_id,created_at desc);
alter table public.openwa_whatsapp_inbound_receipts enable row level security;
revoke all on public.openwa_whatsapp_inbound_receipts from public,anon,authenticated;
grant select,insert on public.openwa_whatsapp_inbound_receipts to service_role;

-- Callable only by the service_role Edge receiver after webhook authentication.
-- Session identity comes from a manually verified SERVER-side route, never
-- tenant identifiers or phone numbers embedded in external payloads.
create or replace function public.ingest_verified_openwa_whatsapp_text(
 p_session_id text,p_message_id text,p_from text,p_contact_name text,p_body text
) returns text language plpgsql security invoker set search_path = ''
as $$
declare
 v_route record;
 v_receipt bigint;
 v_contact_id uuid;
 v_conversation_id uuid;
begin
 if p_session_id is null or p_session_id !~ '^[a-zA-Z0-9_-]{1,80}$'
  or p_from is null or p_from !~ '^\+[1-9][0-9]{7,14}$'
  or p_message_id is null or length(p_message_id) not between 3 and 256
  or p_body is null or length(btrim(p_body)) not between 1 and 1600
 then return 'invalid_message'; end if;

 select r.tenant_id,r.channel_id into v_route
 from public.openwa_whatsapp_routes r
 join public.channels ch on ch.tenant_id=r.tenant_id and ch.id=r.channel_id
 join public.tenants t on t.id=r.tenant_id
 where r.session_id=p_session_id and r.is_enabled and r.verified_at is not null
   and ch.provider='whatsapp' and ch.status='connected' and t.status='active'
   -- One channel cannot silently receive from multiple transport providers.
   and not exists(
     select 1 from public.ycloud_whatsapp_routes y
     where y.tenant_id=r.tenant_id and y.channel_id=r.channel_id and y.is_enabled
   )
   and not exists(
     select 1 from public.meta_whatsapp_routes m
     where m.tenant_id=r.tenant_id and m.channel_id=r.channel_id and m.is_enabled
   )
 limit 1;
 if v_route.tenant_id is null then return 'unverified_route'; end if;

 insert into public.openwa_whatsapp_inbound_receipts(
   tenant_id,channel_id,session_id,external_message_id)
 values(v_route.tenant_id,v_route.channel_id,p_session_id,p_message_id)
 on conflict(session_id,external_message_id) do nothing
 returning id into v_receipt;
 if v_receipt is null then return 'duplicate'; end if;

 perform pg_catalog.pg_advisory_xact_lock(
   pg_catalog.hashtextextended(v_route.tenant_id::text||':'||p_from,0));
 select c.id into v_contact_id from public.contacts c
 where c.tenant_id=v_route.tenant_id
   and (c.phone=p_from or c.whatsapp_phone=p_from)
 order by c.created_at limit 1;
 if v_contact_id is null then
   insert into public.contacts(tenant_id,display_name,phone,whatsapp_phone,source,status,metadata)
   values(v_route.tenant_id,
     coalesce(nullif(left(btrim(p_contact_name),120),''),'Contacto WhatsApp'),
     p_from,p_from,'whatsapp','lead',
     pg_catalog.jsonb_build_object('source','openwa_verified_webhook',
       'consent','not_verified'))
   returning id into v_contact_id;
 end if;

 insert into public.conversations(
   tenant_id,channel_id,contact_id,external_thread_id,status,subject,
   last_message_at,metadata)
 values(v_route.tenant_id,v_route.channel_id,v_contact_id,p_from,'open',
   'WhatsApp',now(),
   pg_catalog.jsonb_build_object('origin','openwa_webhook','requires_human',true))
 on conflict(tenant_id,channel_id,external_thread_id) do update set
   last_message_at=now(),status='open',
   contact_id=coalesce(public.conversations.contact_id,excluded.contact_id)
 returning id into v_conversation_id;

 insert into public.messages(
   tenant_id,conversation_id,direction,sender_type,sender_contact_id,
   external_message_id,message_type,body,status,metadata)
 values(v_route.tenant_id,v_conversation_id,'inbound','contact',v_contact_id,
   p_message_id,'text',btrim(p_body),'received',
   pg_catalog.jsonb_build_object('provider','whatsapp',
     'provider_adapter','openwa','session_id',p_session_id))
 on conflict(tenant_id,conversation_id,external_message_id) do nothing;

 insert into public.tasks(
   tenant_id,contact_id,title,description,status,priority,due_at,source,metadata)
 values(v_route.tenant_id,v_contact_id,'Responder mensaje recibido por WhatsApp',
   'Revisar mensaje de OpenWA; respuesta humana antes de automatizar.',
   'todo','normal',now()+interval '2 hours','automation',
   pg_catalog.jsonb_build_object('origin','verified_whatsapp_inbound',
      'source_conversation_id',v_conversation_id::text,
      'provider','openwa','requires_human',true));
 return 'stored';
end;
$$;
revoke all on function public.ingest_verified_openwa_whatsapp_text(
 text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.ingest_verified_openwa_whatsapp_text(
 text,text,text,text,text) to service_role;
comment on function public.ingest_verified_openwa_whatsapp_text(
 text,text,text,text,text) is
 'Authenticated OpenWA v5 webhook only: trusted session->tenant route, deduplicated inbound text, manual review; no sends.';

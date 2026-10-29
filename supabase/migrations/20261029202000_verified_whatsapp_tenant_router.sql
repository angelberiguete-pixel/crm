-- Verified WhatsApp phone_number_id -> tenant router.
-- No route is provisioned automatically. No OAuth, credits or outbound messages.
create table if not exists public.meta_whatsapp_routes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  channel_id uuid not null,
  phone_number_id text not null unique check(phone_number_id ~ '^[0-9]{6,30}$'),
  waba_id text not null check(waba_id ~ '^[0-9]{6,30}$'),
  verified_at timestamptz not null,
  verified_reference text not null check(length(verified_reference) between 8 and 200),
  is_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  constraint meta_whatsapp_route_channel_fk foreign key(tenant_id,channel_id)
    references public.channels(tenant_id,id) on delete cascade,
  unique(tenant_id,channel_id)
);
alter table public.meta_whatsapp_routes enable row level security;
revoke all on public.meta_whatsapp_routes from public,anon,authenticated;
grant select,insert,update on public.meta_whatsapp_routes to service_role;
comment on table public.meta_whatsapp_routes is 'Server-verified Meta phone number mapping. Never activate through client input.';

create table if not exists public.meta_whatsapp_inbound_receipts (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  channel_id uuid not null,
  phone_number_id text not null,
  external_message_id text not null check(length(external_message_id) between 3 and 256),
  created_at timestamptz not null default now(),
  foreign key (tenant_id,channel_id) references public.channels(tenant_id,id) on delete cascade,
  unique(phone_number_id,external_message_id)
);
create index if not exists meta_wa_receipts_recent on public.meta_whatsapp_inbound_receipts(tenant_id,created_at desc);
alter table public.meta_whatsapp_inbound_receipts enable row level security;
revoke all on public.meta_whatsapp_inbound_receipts from public,anon,authenticated;
grant select,insert on public.meta_whatsapp_inbound_receipts to service_role;

-- The only entrypoint for verified text webhooks, invoked after app-secret HMAC.
-- One transaction for route lookup, dedupe, contact, conversation and message.
-- Service role only; normal browsers cannot impersonate signed Meta events.
create or replace function public.ingest_verified_whatsapp_text(
 p_phone_number_id text,p_waba_id text,p_message_id text,p_from text,
 p_contact_name text,p_body text
) returns text language plpgsql security invoker set search_path = ''
as $$
declare
 v_route record;
 v_contact_id uuid;
 v_conversation_id uuid;
 v_agent_id uuid;
 v_inserted bigint;
begin
 if p_phone_number_id !~ '^[0-9]{6,30}$'
   or p_waba_id !~ '^[0-9]{6,30}$'
   or p_from !~ '^[0-9]{8,20}$'
   or p_message_id is null or length(p_message_id) not between 3 and 256
   or p_body is null or length(btrim(p_body)) not between 1 and 1600
 then return 'invalid_message'; end if;

 select r.tenant_id,r.channel_id into v_route
 from public.meta_whatsapp_routes r
 join public.channels ch on ch.id=r.channel_id and ch.tenant_id=r.tenant_id
 join public.tenants t on t.id=r.tenant_id
 where r.phone_number_id=p_phone_number_id and r.waba_id=p_waba_id
   and r.is_enabled=true and r.verified_at is not null
   and ch.provider='whatsapp' and ch.status='connected'
   and t.status='active'
 limit 1;
 if v_route.tenant_id is null then return 'unverified_route'; end if;

 -- The receipt INSERT is the idempotency gate. Its unique key also prevents
 -- the same WhatsApp message from ever being routed to two businesses.
 insert into public.meta_whatsapp_inbound_receipts(
   tenant_id,channel_id,phone_number_id,external_message_id)
 values(v_route.tenant_id,v_route.channel_id,p_phone_number_id,p_message_id)
 on conflict(phone_number_id,external_message_id) do nothing
 returning id into v_inserted;
 if v_inserted is null then return 'duplicate'; end if;

 -- Serialize contact creation for this tenant+phone, no cross-business merges.
 perform pg_catalog.pg_advisory_xact_lock(
   pg_catalog.hashtextextended(v_route.tenant_id::text||':'||p_from,0));
 select c.id into v_contact_id from public.contacts c
 where c.tenant_id=v_route.tenant_id
   and (c.whatsapp_phone=p_from or c.phone=p_from)
 order by c.created_at limit 1;
 if v_contact_id is null then
   insert into public.contacts(tenant_id,display_name,phone,whatsapp_phone,source,status,metadata)
   values(v_route.tenant_id,
     coalesce(nullif(left(btrim(p_contact_name),120),''),'Contacto WhatsApp'),
     p_from,p_from,'whatsapp','lead',
     pg_catalog.jsonb_build_object('source','meta_cloud_api','consent','not_verified'))
   returning id into v_contact_id;
 end if;

 -- Identify a configured assistant but never trigger paid inference or auto-send.
 select b.agent_id into v_agent_id from public.ai_agent_bindings b
 join public.ai_agents a on a.id=b.agent_id and a.tenant_id=b.tenant_id
 where b.tenant_id=v_route.tenant_id and b.channel_id=v_route.channel_id
   and b.is_enabled=true and b.trigger_mode in ('manual','inbound')
   and a.status in ('draft','active')
 order by b.priority,b.created_at limit 1;

 insert into public.conversations(
   tenant_id,channel_id,contact_id,external_thread_id,status,subject,
   last_message_at,metadata)
 values(v_route.tenant_id,v_route.channel_id,v_contact_id,p_from,'open',
   'WhatsApp',now(),
   pg_catalog.jsonb_build_object('origin','whatsapp_cloud_api',
     'suggested_agent_id',v_agent_id,'requires_human',true))
 on conflict(tenant_id,channel_id,external_thread_id)
 do update set
   last_message_at=now(),status='open',
   contact_id=coalesce(public.conversations.contact_id,excluded.contact_id),
   metadata=public.conversations.metadata || excluded.metadata
 returning id into v_conversation_id;

 insert into public.messages(
   tenant_id,conversation_id,direction,sender_type,sender_contact_id,
   external_message_id,message_type,body,status,metadata)
 values(v_route.tenant_id,v_conversation_id,'inbound','contact',v_contact_id,
   p_message_id,'text',p_body,'received',
   pg_catalog.jsonb_build_object('provider','whatsapp','phone_number_id',p_phone_number_id))
 on conflict(tenant_id,conversation_id,external_message_id) do nothing;
 return 'stored';
end;
$$;
revoke all on function public.ingest_verified_whatsapp_text(text,text,text,text,text,text)
 from PUBLIC,anon,authenticated;
grant execute on function public.ingest_verified_whatsapp_text(text,text,text,text,text,text)
 to service_role;
comment on function public.ingest_verified_whatsapp_text(text,text,text,text,text,text) is
 'Only server after Meta HMAC: route by verified phone, dedupe, create contact/conversation and suggest nonexecuting agent.';

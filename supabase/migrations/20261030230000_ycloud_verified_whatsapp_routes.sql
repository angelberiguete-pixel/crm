-- YCloud WhatsApp provider, isolated per tenant. Not active until verified externally.
-- Zero OAuth, keys, billing or outbound messages. Never provision client routes from an untrusted webhook.
create table if not exists public.ycloud_whatsapp_routes(
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id) on delete cascade,
 channel_id uuid not null,
 waba_id text not null check (waba_id ~ '^[0-9]{6,30}$'),
 business_phone_e164 text not null unique check (business_phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
 verified_at timestamptz not null,
 verified_reference text not null check(length(verified_reference) between 8 and 200),
 is_enabled boolean not null default false,
 created_at timestamptz not null default now(),
 foreign key(tenant_id,channel_id) references public.channels(tenant_id,id) on delete cascade,
 unique(tenant_id,channel_id)
);
alter table public.ycloud_whatsapp_routes enable row level security;
revoke all on public.ycloud_whatsapp_routes from PUBLIC,anon,authenticated;
grant select,insert,update on public.ycloud_whatsapp_routes to service_role;
comment on table public.ycloud_whatsapp_routes is 'Only platform-controlled verified YCloud WABA+business phone can be enabled for CRM ingestion.';

create table if not exists public.ycloud_whatsapp_inbound_receipts(
 id bigint generated always as identity primary key,
 tenant_id uuid not null,
 channel_id uuid not null,
 business_phone_e164 text not null,
 external_message_id text not null check (length(external_message_id) between 3 and 256),
 created_at timestamptz not null default now(),
 foreign key(tenant_id,channel_id) references public.channels(tenant_id,id) on delete cascade,
 unique(business_phone_e164,external_message_id)
);
create index if not exists ycloud_wa_receipts_tenant_recent on public.ycloud_whatsapp_inbound_receipts(tenant_id,created_at desc);
alter table public.ycloud_whatsapp_inbound_receipts enable row level security;
revoke all on public.ycloud_whatsapp_inbound_receipts from PUBLIC,anon,authenticated;
grant select,insert on public.ycloud_whatsapp_inbound_receipts to service_role;

create or replace function public.ingest_verified_ycloud_whatsapp_text(
 p_waba_id text,p_business_phone text,p_message_id text,p_from text,
 p_contact_name text,p_body text
) returns text language plpgsql security invoker set search_path = ''
as $$
declare
 v_route record;
 v_receipt bigint;
 v_contact_id uuid;
 v_conversation_id uuid;
begin
 if p_waba_id !~ '^[0-9]{6,30}$'
    or p_business_phone !~ '^\+[1-9][0-9]{7,14}$'
    or p_from !~ '^\+[1-9][0-9]{7,14}$'
    or p_message_id is null or length(p_message_id) not between 3 and 256
    or p_body is null or length(btrim(p_body)) not between 1 and 1600
 then return 'invalid_message'; end if;

 select r.tenant_id,r.channel_id into v_route
 from public.ycloud_whatsapp_routes r
 join public.channels ch on ch.tenant_id=r.tenant_id and ch.id=r.channel_id
 join public.tenants t on t.id=r.tenant_id
 where r.waba_id=p_waba_id and r.business_phone_e164=p_business_phone
   and r.is_enabled and r.verified_at is not null
   and ch.provider='whatsapp' and ch.status='connected'
   and t.status='active'
 limit 1;
 if v_route.tenant_id is null then return 'unverified_route'; end if;

 insert into public.ycloud_whatsapp_inbound_receipts(
   tenant_id,channel_id,business_phone_e164,external_message_id)
 values(v_route.tenant_id,v_route.channel_id,p_business_phone,p_message_id)
 on conflict(business_phone_e164,external_message_id) do nothing
 returning id into v_receipt;
 if v_receipt is null then return 'duplicate'; end if;

 perform pg_catalog.pg_advisory_xact_lock(
   pg_catalog.hashtextextended(v_route.tenant_id::text||':'||p_from,0));
 select c.id into v_contact_id from public.contacts c
 where c.tenant_id=v_route.tenant_id
   and (c.phone=p_from or c.whatsapp_phone=p_from)
 order by c.created_at limit 1;
 if v_contact_id is null then
   insert into public.contacts(tenant_id,display_name,phone,whatsapp_phone,
       source,status,metadata)
   values(v_route.tenant_id,
     coalesce(nullif(left(btrim(p_contact_name),120),''),'Contacto WhatsApp'),
     p_from,p_from,'whatsapp','lead',
     pg_catalog.jsonb_build_object('source','ycloud_verified_webhook','consent','not_verified'))
   returning id into v_contact_id;
 end if;

 insert into public.conversations(
   tenant_id,channel_id,contact_id,external_thread_id,status,subject,last_message_at,metadata)
 values(v_route.tenant_id,v_route.channel_id,v_contact_id,p_from,'open','WhatsApp',
   now(),pg_catalog.jsonb_build_object('origin','ycloud_webhook','requires_human',true))
 on conflict(tenant_id,channel_id,external_thread_id) do update set
   status='open',last_message_at=now(),
   contact_id=coalesce(public.conversations.contact_id,excluded.contact_id)
 returning id into v_conversation_id;

 insert into public.messages(tenant_id,conversation_id,direction,sender_type,
   sender_contact_id,external_message_id,message_type,body,status,metadata)
 values(v_route.tenant_id,v_conversation_id,'inbound','contact',v_contact_id,
   p_message_id,'text',btrim(p_body),'received',
   pg_catalog.jsonb_build_object('provider','whatsapp','provider_adapter','ycloud',
      'business_phone_e164',p_business_phone))
 on conflict(tenant_id,conversation_id,external_message_id) do nothing;

 -- The existing first-response trigger only accepts receipts from Meta.
 -- This separate entry schedules one INTERNAL task and never sends a reply.
 insert into public.tasks(tenant_id,contact_id,title,description,
     status,priority,due_at,source,metadata)
 values(v_route.tenant_id,v_contact_id,
     'Responder consulta recibida por WhatsApp',
     'Revisar el mensaje entrante de YCloud; respuesta humana antes de automatizar.',
     'todo','normal',now()+interval '2 hours','automation',
     pg_catalog.jsonb_build_object('origin','verified_whatsapp_inbound',
       'source_conversation_id',v_conversation_id::text,'provider','ycloud',
       'requires_human',true))
 on conflict do nothing;
 return 'stored';
end;
$$;
revoke all on function public.ingest_verified_ycloud_whatsapp_text(
 text,text,text,text,text,text) from PUBLIC,anon,authenticated;
grant execute on function public.ingest_verified_ycloud_whatsapp_text(
 text,text,text,text,text,text) to service_role;
comment on function public.ingest_verified_ycloud_whatsapp_text(text,text,text,text,text,text)
 is 'Called only by signature-verified YCloud Edge receiver; transactionally routes by WABA+business phone; no sends.';


-- A retry with the same clientRequestId cannot bill the provider twice,
-- even after the pending external_message_id is replaced by the YCloud ID.
create unique index if not exists ycloud_wa_human_send_once
 on public.messages(tenant_id,conversation_id,((metadata ->> 'client_request_id')))
 where direction='outbound' and metadata->>'provider'='ycloud'
   and metadata ? 'client_request_id';

-- YCloud interactive attribution and outbound delivery status.
-- Strictly server-only; verified provider receipt + previously enabled WABA route.
-- Records no sale/payment without separately verified business evidence.

create table if not exists public.marketing_whatsapp_click_attribution (
 id bigint generated always as identity primary key,
 tenant_id uuid not null references public.tenants(id) on delete cascade,
 conversation_id uuid not null,
 contact_id uuid not null,
 source_message_id uuid not null,
 ctwa_click_id text not null check (length(ctwa_click_id) between 12 and 512),
 captured_at timestamptz not null default now(),
 unique(tenant_id,source_message_id)
);
create index if not exists marketing_ctwa_by_contact on public.marketing_whatsapp_click_attribution(tenant_id,contact_id,captured_at desc);
alter table public.marketing_whatsapp_click_attribution enable row level security;
revoke all on public.marketing_whatsapp_click_attribution from public,anon,authenticated;
grant select,insert on public.marketing_whatsapp_click_attribution to service_role;

create or replace function public.marketing_record_verified_ycloud_attribution(
 p_waba_id text,p_business_phone text,p_message_id text,p_ctwa_click_id text)
returns text language plpgsql security invoker set search_path=''
as $$
declare v_msg record;
begin
 if auth.role() is distinct from 'service_role'
 then raise exception 'Server-only event' using errcode='42501'; end if;
 if p_ctwa_click_id !~ '^[a-zA-Z0-9_-]{12,512}$'
 then return 'invalid'; end if;
 select m.id,m.tenant_id,m.conversation_id,c.contact_id
 into v_msg from public.ycloud_whatsapp_routes r
 join public.ycloud_whatsapp_inbound_receipts rec
   on rec.tenant_id=r.tenant_id and rec.channel_id=r.channel_id
   and rec.business_phone_e164=r.business_phone_e164
 join public.conversations c
   on c.tenant_id=rec.tenant_id and c.channel_id=rec.channel_id
 join public.messages m
   on m.tenant_id=c.tenant_id and m.conversation_id=c.id
   and m.external_message_id=rec.external_message_id
 where r.waba_id=p_waba_id and r.business_phone_e164=p_business_phone
   and r.is_enabled and rec.external_message_id=p_message_id
   and m.direction='inbound' and m.sender_type='contact'
 order by rec.created_at desc limit 1;
 if v_msg.id is null or v_msg.contact_id is null then return 'unverified';end if;
 insert into public.marketing_whatsapp_click_attribution
 (tenant_id,conversation_id,contact_id,source_message_id,ctwa_click_id)
 values(v_msg.tenant_id,v_msg.conversation_id,v_msg.contact_id,v_msg.id,p_ctwa_click_id)
 on conflict(tenant_id,source_message_id) do nothing;
 return 'recorded';
end;
$$;
revoke all on function public.marketing_record_verified_ycloud_attribution(text,text,text,text) from public,anon,authenticated;
grant execute on function public.marketing_record_verified_ycloud_attribution(text,text,text,text) to service_role;

create or replace function public.marketing_record_verified_ycloud_quote_reply(
 p_waba_id text,p_business_phone text,p_message_id text,p_reply_id text)
returns text language plpgsql security invoker set search_path=''
as $$
declare v_msg record;v_quote_id uuid;v_action text;v_rows bigint;
begin
 if auth.role() is distinct from 'service_role'
 then raise exception 'Server-only event' using errcode='42501';end if;
 if p_reply_id is null or p_reply_id !~* '^q:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}:(approve_request|request_changes|talk_to_advisor)$'
 then return 'invalid';end if;
 v_quote_id:=split_part(p_reply_id,':',2)::uuid;
 v_action:=split_part(p_reply_id,':',3);
 select m.id,m.tenant_id,m.conversation_id,c.contact_id
 into v_msg from public.ycloud_whatsapp_routes r
 join public.ycloud_whatsapp_inbound_receipts rec on rec.tenant_id=r.tenant_id
   and rec.channel_id=r.channel_id and rec.business_phone_e164=r.business_phone_e164
 join public.conversations c on c.tenant_id=rec.tenant_id and c.channel_id=rec.channel_id
 join public.messages m on m.tenant_id=c.tenant_id and m.conversation_id=c.id
    and m.external_message_id=rec.external_message_id
 where r.waba_id=p_waba_id and r.business_phone_e164=p_business_phone and r.is_enabled
   and rec.external_message_id=p_message_id and m.direction='inbound' and m.sender_type='contact'
 limit 1;
 if v_msg.id is null or v_msg.contact_id is null then return 'unverified';end if;
 if not exists(select 1 from public.quotations q where q.id=v_quote_id
   and q.tenant_id=v_msg.tenant_id and q.contact_id=v_msg.contact_id
   and q.status in ('sent','accepted'))then return 'quote_not_matched';end if;

 update public.messages m
 set message_type='event',
   metadata=coalesce(m.metadata,'{}'::jsonb)||
    jsonb_build_object('interactive_action',v_action,'quotation_id',v_quote_id::text,
    'approval_effect','requires_human_confirmation')
 where m.tenant_id=v_msg.tenant_id and m.id=v_msg.id;
 insert into public.marketing_event_ledger(tenant_id,conversation_id,contact_id,
    event_name,source_table,source_id,occurred_at,evidence_status,quotation_id,interactive_action)
 values(v_msg.tenant_id,v_msg.conversation_id,v_msg.contact_id,'interactive_reply',
    'messages',v_msg.id,now(),'provider_verified',v_quote_id,v_action)
 on conflict(tenant_id,source_table,source_id,event_name) do nothing;
 get diagnostics v_rows=row_count;
 return case when v_rows=1 then 'recorded' else 'duplicate' end;
end;
$$;
revoke all on function public.marketing_record_verified_ycloud_quote_reply(text,text,text,text) from public,anon,authenticated;
grant execute on function public.marketing_record_verified_ycloud_quote_reply(text,text,text,text) to service_role;

create or replace function public.ycloud_mark_verified_message_status(
 p_waba_id text,p_business_phone text,p_external_message_id text,p_new_status text)
returns text language plpgsql security invoker set search_path=''
as $$
declare v_row record;
begin
 if auth.role() is distinct from 'service_role'
 then raise exception 'Server-only status' using errcode='42501';end if;
 if p_new_status not in ('sent','delivered','read','failed') then return 'invalid';end if;
 select m.id,m.status,m.tenant_id into v_row
 from public.ycloud_whatsapp_routes r
 join public.messages m on m.tenant_id=r.tenant_id and m.external_message_id=p_external_message_id
 join public.conversations c on c.id=m.conversation_id and c.tenant_id=r.tenant_id
   and c.channel_id=r.channel_id
 where r.waba_id=p_waba_id and r.business_phone_e164=p_business_phone
  and r.is_enabled and m.direction='outbound'
  and m.metadata->>'provider'='ycloud'
 limit 1 for update of m;
 if v_row.id is null then return 'unverified';end if;
 if (case v_row.status when 'created' then 0 when 'queued' then 1
      when 'sent' then 2 when 'delivered' then 3 when 'read' then 4 else 5 end)
   > (case p_new_status when 'sent' then 2 when 'delivered' then 3
      when 'read' then 4 else 1 end)
 then return 'stale';end if;
 if v_row.status='failed' then return 'stale';end if;
 update public.messages
 set status=p_new_status,
     sent_at=case when p_new_status in ('sent','delivered','read')
       then coalesce(sent_at,now()) else sent_at end,
     delivered_at=case when p_new_status in ('delivered','read')
       then coalesce(delivered_at,now()) else delivered_at end,
     read_at=case when p_new_status='read' then coalesce(read_at,now()) else read_at end
 where id=v_row.id and tenant_id=v_row.tenant_id;
 return 'updated';
end;
$$;
revoke all on function public.ycloud_mark_verified_message_status(text,text,text,text) from public,anon,authenticated;
grant execute on function public.ycloud_mark_verified_message_status(text,text,text,text) to service_role;

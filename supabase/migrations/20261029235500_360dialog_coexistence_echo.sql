-- 360dialog Coexistence: business-app sent TEXT echoes only.
-- Added to existing CRM: no new tenant, channel, agent, provider token or payment.
-- Uses an already server-verified WABA+phone route. Service-role-only.
create or replace function public.ingest_verified_whatsapp_echo(
 p_phone_number_id text,p_waba_id text,p_message_id text,
 p_recipient text,p_body text
) returns text language plpgsql security invoker set search_path = ''
as $$
declare
 v_route record;
 v_contact_id uuid;
 v_conversation_id uuid;
 v_message_id uuid;
begin
 if p_phone_number_id !~ '^[0-9]{6,30}$'
    or p_waba_id !~ '^[0-9]{6,30}$'
    or p_recipient !~ '^[0-9]{8,20}$'
    or p_message_id is null or length(p_message_id) not between 3 and 256
    or p_body is null or length(btrim(p_body)) not between 1 and 1600
 then return 'invalid_message'; end if;

 select r.tenant_id,r.channel_id into v_route
 from public.meta_whatsapp_routes r
 join public.channels ch on ch.id=r.channel_id and ch.tenant_id=r.tenant_id
 join public.tenants t on t.id=r.tenant_id
 where r.phone_number_id=p_phone_number_id and r.waba_id=p_waba_id
   and r.is_enabled and r.verified_at is not null
   and ch.provider='whatsapp' and ch.status='connected' and t.status='active'
 limit 1;
 if v_route.tenant_id is null then return 'unverified_route'; end if;

 perform pg_catalog.pg_advisory_xact_lock(
   pg_catalog.hashtextextended(v_route.tenant_id::text||':'||p_recipient,0));
 select c.id into v_contact_id from public.contacts c
 where c.tenant_id=v_route.tenant_id
   and (c.whatsapp_phone=p_recipient or c.phone=p_recipient)
 order by c.created_at limit 1;
 if v_contact_id is null then
  insert into public.contacts(tenant_id,display_name,phone,whatsapp_phone,
    source,status,metadata)
  values(v_route.tenant_id,'Contacto WhatsApp',p_recipient,p_recipient,
    'whatsapp','lead',
    pg_catalog.jsonb_build_object('source','360dialog_coexistence_echo','consent','not_verified'))
  returning id into v_contact_id;
 end if;

 insert into public.conversations(
  tenant_id,channel_id,contact_id,external_thread_id,status,subject,last_message_at,metadata)
 values(v_route.tenant_id,v_route.channel_id,v_contact_id,p_recipient,
   'open','WhatsApp',now(),
   pg_catalog.jsonb_build_object('origin','360dialog_coexistence','requires_human',true))
 on conflict(tenant_id,channel_id,external_thread_id) do update set
   last_message_at=now(),
   contact_id=coalesce(public.conversations.contact_id,excluded.contact_id)
 returning id into v_conversation_id;

 -- Echo is outbound FROM the Doctor's WhatsApp Business App.
 -- Do not label as a customer inbound or infer that AI/API sent it.
 insert into public.messages(
  tenant_id,conversation_id,direction,sender_type,external_message_id,
  message_type,body,status,sent_at,metadata)
 values(v_route.tenant_id,v_conversation_id,'outbound','external',
   p_message_id,'text',p_body,'sent',now(),
   pg_catalog.jsonb_build_object('provider','whatsapp','phone_number_id',p_phone_number_id,
     'origin','business_app_echo','sent_by','external_business_app'))
 on conflict(tenant_id,conversation_id,external_message_id) do nothing
 returning id into v_message_id;
 if v_message_id is null then return 'duplicate'; end if;
 return 'stored';
end;
$$;
revoke all on function public.ingest_verified_whatsapp_echo(
 text,text,text,text,text) from PUBLIC,anon,authenticated;
grant execute on function public.ingest_verified_whatsapp_echo(
 text,text,text,text,text) to service_role;
comment on function public.ingest_verified_whatsapp_echo(text,text,text,text,text)
is 'Ingest authenticated 360dialog outbound app TEXT echo only after verified WABA+phone route. No AI or send.';

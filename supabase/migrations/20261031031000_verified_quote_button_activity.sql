-- Record CTA clicks only after the signed Meta webhook has generated
-- a verified inbound message receipt and the quoted contact/tenant match.
-- Never approve/charge based on a button click; it is a request for review.
alter table public.marketing_event_ledger
  add column if not exists quotation_id uuid,
  add column if not exists interactive_action text
    check (interactive_action in ('approve_request','request_changes','talk_to_advisor'));

create or replace function public.marketing_record_verified_quote_reply(
  p_tenant_id uuid,p_message_id uuid,p_reply_id text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_quote_id uuid; v_action text; v_contact_id uuid; v_message_contact uuid;
begin
  -- Only backend webhook processing holding the server-side service key.
  if auth.role() is distinct from 'service_role'
    then raise exception 'Server-only interaction' using errcode='42501'; end if;
  if p_reply_id is null or p_reply_id !~* '^q:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}:(approve_request|request_changes|talk_to_advisor)$'
    then return jsonb_build_object('recorded',false,'reason','invalid_reply_id'); end if;
  v_quote_id:=split_part(p_reply_id,':',2)::uuid;
  v_action:=split_part(p_reply_id,':',3);

  -- The reply must be a REAL inbound message from a verified Meta phone route.
  -- A browser write to messages.metadata alone cannot generate this receipt.
  select c.contact_id into v_message_contact
    from public.messages m
    join public.conversations c on c.id=m.conversation_id and c.tenant_id=m.tenant_id
    join public.meta_whatsapp_inbound_receipts r
      on r.tenant_id=m.tenant_id and r.channel_id=c.channel_id
       and r.external_message_id=m.external_message_id
    where m.id=p_message_id and m.tenant_id=p_tenant_id
      and m.direction='inbound' and m.sender_type in ('contact','external')
    limit 1;
  if v_message_contact is null
    then return jsonb_build_object('recorded',false,'reason','unverified_inbound'); end if;

  select q.contact_id into v_contact_id from public.quotations q
    where q.id=v_quote_id and q.tenant_id=p_tenant_id
      and q.contact_id=v_message_contact and q.status in ('sent','accepted')
    limit 1;
  if v_contact_id is null
    then return jsonb_build_object('recorded',false,'reason','quote_not_matched'); end if;

  insert into public.marketing_event_ledger
    (tenant_id,contact_id,event_name,source_table,source_id,
     quotation_id,interactive_action,occurred_at,evidence_status)
  values(p_tenant_id,v_contact_id,'interactive_reply','messages',p_message_id,
    v_quote_id,v_action,now(),'provider_verified')
  on conflict(tenant_id,source_table,source_id,event_name) do nothing;
  return jsonb_build_object('recorded',true,'action',v_action,'quote_id',v_quote_id,
    'effect','request_logged_no_automatic_approval');
end;
$$;
revoke all on function public.marketing_record_verified_quote_reply(uuid,uuid,text)
 from public,anon,authenticated;
grant execute on function public.marketing_record_verified_quote_reply(uuid,uuid,text)
 to service_role;

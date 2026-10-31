-- YCloud: signed image/PDF intake only. No network download or billing.
-- API-visible service-role RPC invoked exclusively after verified HMAC event.
-- The existing verified WABA+number router resolves the tenant on the server.
create or replace function public.ingest_verified_ycloud_whatsapp_media(
 p_waba_id text,p_business_phone text,p_message_id text,p_from text,
 p_contact_name text,p_kind text,p_media_id text,p_mime_type text,
 p_sha256 text,p_filename text,p_caption text
) returns text language plpgsql security invoker set search_path=''
as $$
declare v_ingest text; v_message uuid;v_tenant uuid;
begin
 if auth.role() is distinct from 'service_role'
 then raise exception 'Server-only media intake' using errcode='42501';end if;
 if p_kind not in ('image','document')
  or p_media_id !~ '^[a-zA-Z0-9_-]{4,128}$'
  or not (
    (p_kind='image' and p_mime_type in ('image/jpeg','image/png','image/webp'))
    or (p_kind='document' and p_mime_type='application/pdf')
  )
  or p_caption is null or length(p_caption)>250
  or (p_sha256 is not null and p_sha256 !~ '^[a-zA-Z0-9+/]{43}=$')
  or (p_filename is not null and
    (length(p_filename)>128 or p_filename !~* '^[a-zA-Z0-9 _().-]+[.]pdf$'))
 then return 'invalid_media';end if;
 -- Incoming URL (including signed temporary downloads) is deliberately ignored.
 -- Reuse verified-route, dedupe, CRM contact and human-review task from text path.
 select public.ingest_verified_ycloud_whatsapp_text(
   p_waba_id,p_business_phone,p_message_id,p_from,p_contact_name,
   case when p_kind='image'
    then '[Fotografía recibida: descarga privada pendiente de verificación]'
    else '[Documento PDF recibido: descarga privada pendiente de verificación]' end
 ) into v_ingest;
 if v_ingest not in ('stored','duplicate') then
   return case when v_ingest='invalid_message' then 'invalid_media' else v_ingest end;
 end if;
 select m.id,m.tenant_id into v_message,v_tenant
 from public.ycloud_whatsapp_routes r
 join public.ycloud_whatsapp_inbound_receipts rec
  on rec.tenant_id=r.tenant_id and rec.channel_id=r.channel_id
   and rec.business_phone_e164=r.business_phone_e164
 join public.conversations c on c.tenant_id=rec.tenant_id
   and c.channel_id=rec.channel_id
 join public.messages m on m.tenant_id=c.tenant_id
   and m.conversation_id=c.id and m.external_message_id=rec.external_message_id
 where r.waba_id=p_waba_id and r.business_phone_e164=p_business_phone and r.is_enabled
  and rec.external_message_id=p_message_id and m.direction='inbound' and m.sender_type='contact'
 limit 1;
 if v_message is null then raise exception 'Verified media message not found' using errcode='P0002';end if;
 update public.messages m set
   message_type=p_kind,
   metadata=coalesce(m.metadata,'{}'::jsonb)||jsonb_build_object(
     'provider_media_id',p_media_id,
     'provider_media_type',p_mime_type,
     'provider_media_hash',p_sha256,
     'filename',p_filename,
     'caption',p_caption,
     'file_review','pending_private_download',
     'payment_verification','not_verified',
     'ai_review','human_only',
     'media_storage','not_downloaded'
   )
 where m.id=v_message and m.tenant_id=v_tenant and
   (m.message_type='text' or m.message_type=p_kind);
 return v_ingest;
end; $$;
revoke all on function public.ingest_verified_ycloud_whatsapp_media(
 text,text,text,text,text,text,text,text,text,text,text
) from public,anon,authenticated;
grant execute on function public.ingest_verified_ycloud_whatsapp_media(
 text,text,text,text,text,text,text,text,text,text,text
) to service_role;
comment on function public.ingest_verified_ycloud_whatsapp_media(
 text,text,text,text,text,text,text,text,text,text,text
) is 'Server-only signed YCloud image/PDF metadata; no binary download, client payment approval, quote acceptance or AI.';

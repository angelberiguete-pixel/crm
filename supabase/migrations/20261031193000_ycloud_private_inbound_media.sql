-- Staged only: private YCloud media, tied to the verified conversation.
-- Do not apply until the Edge media handler and cross-tenant QA are reviewed.
create unique index if not exists crm_wa_media_attachment_idempotent
  on public.message_attachments(tenant_id,message_id,storage_path)
  where storage_bucket='crm-documents' and storage_path is not null;

-- Existing broad tenant SELECT allows seeing attachment metadata for an
-- assigned private conversation. Limit it to the same RLS conversation rule.
drop policy if exists message_attachments_select on public.message_attachments;
create policy message_attachments_select on public.message_attachments
 for select to authenticated
 using (
  private.has_tenant_access(tenant_id)
  and exists(select 1 from public.messages m where m.tenant_id=message_attachments.tenant_id
   and m.id=message_attachments.message_id
   and private.crm_can_view_conversation(m.tenant_id,m.conversation_id))
 );

-- Grant short-lived signed URL creation only for an attachment whose message
-- belongs to a conversation actually visible to the requesting user.
drop policy if exists crm_whatsapp_inbound_media_select on storage.objects;
create policy crm_whatsapp_inbound_media_select on storage.objects
 for select to authenticated
 using (
  bucket_id='crm-documents' and
  exists(
   select 1 from public.message_attachments a
   join public.messages m on m.tenant_id=a.tenant_id and m.id=a.message_id
   where a.storage_bucket='crm-documents'
    and a.storage_path=objects.name
    and a.storage_path like a.tenant_id::text||'/whatsapp-inbound/%'
    and private.crm_can_view_conversation(a.tenant_id,m.conversation_id)
  )
 );

-- Deletion privilege must agree with crm_cancel_tenant_file: uploader or tenant admin.
drop policy if exists crm_documents_delete on storage.objects;
create policy crm_documents_delete on storage.objects for delete to authenticated
using (bucket_id='crm-documents' and exists (
  select 1 from public.tenant_files f where f.object_path=name
    and (f.uploaded_by=auth.uid() or private.crm_is_tenant_admin(f.tenant_id))
    and private.crm_file_allowed(f.tenant_id,f.module_key,true)
));
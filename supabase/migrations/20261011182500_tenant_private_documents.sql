-- Tenant-private documents: fail closed on membership, active workspace and suspension.
create table public.tenant_files (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id) on delete restrict,
 uploaded_by uuid not null references auth.users(id) on delete restrict,
 filename text not null check(length(trim(filename)) between 1 and 255),
 module_key text not null check(module_key in ('general','sales','contacts','orders','production','finance')),
 mime_type text not null check(mime_type in ('application/pdf','image/png','image/jpeg','image/webp','text/csv')),
 byte_size bigint not null check(byte_size between 1 and 10485760),
 object_path text generated always as (tenant_id::text || '/' || id::text) stored,
 status text not null default 'reserved' check(status in ('reserved','ready')),
 created_at timestamptz not null default now(),
 finalized_at timestamptz,
 unique(tenant_id,id),
 unique(object_path)
);
create index tenant_files_tenant_created on public.tenant_files(tenant_id,created_at desc);
alter table public.tenant_files enable row level security;
revoke all on public.tenant_files from anon,authenticated;
grant select,insert,delete on public.tenant_files to authenticated;
create policy tenant_files_read on public.tenant_files for select to authenticated
 using(private.crm_is_tenant_member(tenant_id) and private.crm_active_tenant_matches(tenant_id)
 and status='ready');
create policy tenant_files_reserve on public.tenant_files for insert to authenticated
 with check(uploaded_by=auth.uid() and status='reserved' and private.crm_is_tenant_admin(tenant_id)
 and private.crm_active_tenant_matches(tenant_id));
create policy tenant_files_delete on public.tenant_files for delete to authenticated
 using(private.crm_is_tenant_admin(tenant_id) and private.crm_active_tenant_matches(tenant_id));
-- Reserve/finalize are separate so unverified objects are never publicly listed.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('crm-documents','crm-documents',false,10485760,
 array['application/pdf','image/png','image/jpeg','image/webp','text/csv'])
on conflict(id) do nothing;
create policy crm_document_upload on storage.objects for insert to authenticated
 with check(bucket_id='crm-documents' and exists(
 select 1 from public.tenant_files f where f.object_path=name and f.status='reserved'
 and f.uploaded_by=auth.uid() and private.crm_is_tenant_admin(f.tenant_id)
 and private.crm_active_tenant_matches(f.tenant_id)));
create policy crm_document_read on storage.objects for select to authenticated
 using(bucket_id='crm-documents' and exists(
 select 1 from public.tenant_files f where f.object_path=name and f.status='ready'
 and private.crm_is_tenant_member(f.tenant_id) and private.crm_active_tenant_matches(f.tenant_id)));
create policy crm_document_delete on storage.objects for delete to authenticated
 using(bucket_id='crm-documents' and exists(
 select 1 from public.tenant_files f where f.object_path=name
 and private.crm_is_tenant_admin(f.tenant_id) and private.crm_active_tenant_matches(f.tenant_id)));
-- Deliberately no UPDATE policy on files or objects.
create or replace function public.crm_finalize_tenant_file(p_file_id uuid)
returns public.tenant_files language plpgsql security definer
set search_path = '' as $$
declare f public.tenant_files; obj storage.objects; measured_size bigint; measured_mime text;
begin
 select * into f from public.tenant_files where id=p_file_id for update;
 if not found or f.status<>'reserved' or f.uploaded_by<>auth.uid()
 or not private.crm_is_tenant_admin(f.tenant_id)
 or not private.crm_active_tenant_matches(f.tenant_id) then
 raise exception 'Document reservation unavailable' using errcode='42501'; end if;
 select * into obj from storage.objects where bucket_id='crm-documents' and name=f.object_path;
 if not found or obj.owner_id is distinct from auth.uid()::text then
 raise exception 'Uploaded object not owned by uploader' using errcode='42501'; end if;
 measured_size:=nullif(obj.metadata->>'size','')::bigint;
 measured_mime:=obj.metadata->>'mimetype';
 if measured_size is distinct from f.byte_size or measured_mime is distinct from f.mime_type
 or measured_size > 10485760 then
 raise exception 'Uploaded object does not match reservation' using errcode='22023'; end if;
 update public.tenant_files set status='ready',finalized_at=now() where id=f.id returning * into f;
 return f;
end $$;
revoke all on function public.crm_finalize_tenant_file(uuid) from public,anon;
grant execute on function public.crm_finalize_tenant_file(uuid) to authenticated;

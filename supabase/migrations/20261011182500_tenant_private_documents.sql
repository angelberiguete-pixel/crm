-- Tenant-scoped, private Storage objects. No existing customer tables are changed.
-- Access is checked in PostgreSQL, not inferred from the browser's selected workspace.
create table public.tenant_files (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  filename text not null check (length(btrim(filename)) between 1 and 255),
  module_key text not null check (module_key in ('general','sales','contacts','orders','production','finance')),
  mime_type text not null check (mime_type in ('application/pdf','image/png','image/jpeg','image/webp','text/csv')),
  byte_size bigint not null check (byte_size between 1 and 10485760),
  company_id uuid,
  contact_id uuid,
  opportunity_id uuid,
  order_id uuid,
  object_path text generated always as (
    tenant_id::text || '/' || id::text || (
      case mime_type when 'application/pdf' then '.pdf'
                     when 'image/png' then '.png'
                     when 'image/jpeg' then '.jpg'
                     when 'image/webp' then '.webp'
                     when 'text/csv' then '.csv' end
    )
  ) stored,
  status text not null default 'reserved' check (status in ('reserved','ready')),
  created_at timestamptz not null default now(),
  finalized_at timestamptz,
  constraint tenant_files_company_fk foreign key (tenant_id,company_id) references public.companies(tenant_id,id),
  constraint tenant_files_contact_fk foreign key (tenant_id,contact_id) references public.contacts(tenant_id,id),
  constraint tenant_files_opportunity_fk foreign key (tenant_id,opportunity_id) references public.opportunities(tenant_id,id),
  constraint tenant_files_order_fk foreign key (tenant_id,order_id) references public.orders(tenant_id,id),
  unique (tenant_id,id),
  unique (object_path)
);
create index tenant_files_by_tenant on public.tenant_files (tenant_id, created_at desc);
create index tenant_files_by_owner on public.tenant_files (uploaded_by, created_at);
alter table public.tenant_files enable row level security;
revoke all on table public.tenant_files from anon, authenticated;
grant select, insert on table public.tenant_files to authenticated;

-- Map each document category to existing RBAC and the installed module catalogue.
-- Platform support gets access only after choosing an active, operational tenant.
create function private.crm_file_allowed(p_tenant_id uuid,p_module text,p_write boolean)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_perm text; v_module text; v_permissions jsonb;
begin
  if auth.uid() is null or not private.crm_tenant_is_operational(p_tenant_id)
    or private.crm_active_tenant_id() is distinct from p_tenant_id
    or not private.has_tenant_access(p_tenant_id) then return false; end if;
  v_perm := case p_module when 'general' then 'dashboard'
    when 'sales' then 'pipeline' when 'contacts' then 'contacts'
    when 'orders' then 'orders' when 'production' then 'production'
    when 'finance' then 'finance' else null end;
  v_module := case p_module when 'general' then 'dashboard'
    when 'sales' then 'pipeline' when 'contacts' then 'contacts'
    when 'orders' then 'operations' when 'production' then 'operations'
    when 'finance' then 'operations' else null end;
  if v_perm is null or not exists (
    select 1 from public.tenant_effective_modules(p_tenant_id) em
    where em.module_key=v_module and em.enabled=true) then return false; end if;
  v_permissions := public.tenant_current_permissions(p_tenant_id);
  if not (coalesce((v_permissions->>'all')::boolean,false)
    or coalesce((v_permissions->>v_perm)::boolean,false)
    or (p_module='orders' and coalesce((v_permissions->>'operations')::boolean,false))
    or (p_module='production' and coalesce((v_permissions->>'operations')::boolean,false)))
  then return false; end if;
  if p_write and not (
    coalesce((v_permissions->>'all')::boolean,false)
    or coalesce((v_permissions->>'write')::boolean,false)
  ) then return false; end if;
  return true;
end $$;
revoke all on function private.crm_file_allowed(uuid,text,boolean) from public;
grant execute on function private.crm_file_allowed(uuid,text,boolean) to authenticated;

create policy tenant_files_select on public.tenant_files for select to authenticated
using (private.crm_file_allowed(tenant_id,module_key,false)
  and (status='ready' or uploaded_by=auth.uid()));
create policy tenant_files_reserve on public.tenant_files for insert to authenticated
with check (uploaded_by=auth.uid() and status='reserved' and finalized_at is null
  and private.crm_file_allowed(tenant_id,module_key,true));

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('crm-documents','crm-documents',false,10485760,
  array['application/pdf','image/png','image/jpeg','image/webp','text/csv'])
on conflict(id) do nothing;
create policy crm_documents_insert on storage.objects for insert to authenticated
with check (bucket_id='crm-documents' and exists (
  select 1 from public.tenant_files f where f.object_path=name
  and f.status='reserved' and f.uploaded_by=auth.uid()
  and private.crm_file_allowed(f.tenant_id,f.module_key,true)));
create policy crm_documents_select on storage.objects for select to authenticated
using (bucket_id='crm-documents' and exists (
  select 1 from public.tenant_files f where f.object_path=name
  and (f.status='ready' or f.uploaded_by=auth.uid())
  and private.crm_file_allowed(f.tenant_id,f.module_key,false)));
create policy crm_documents_delete on storage.objects for delete to authenticated
using (bucket_id='crm-documents' and exists (
  select 1 from public.tenant_files f where f.object_path=name
  and private.crm_file_allowed(f.tenant_id,f.module_key,true)));
-- No UPDATE storage.objects policy: object replacement and moves are forbidden.

create function public.crm_finalize_tenant_file(p_file_id uuid)
returns public.tenant_files language plpgsql security definer set search_path='' as $$
declare f public.tenant_files; obj storage.objects; measured_size bigint; measured_mime text;
begin
  select * into f from public.tenant_files where id=p_file_id for update;
  if not found or f.status<>'reserved' or f.uploaded_by<>auth.uid()
     or not private.crm_file_allowed(f.tenant_id,f.module_key,true)
  then raise exception 'Document reservation unavailable' using errcode='42501'; end if;
  select * into obj from storage.objects
    where bucket_id='crm-documents' and name=f.object_path;
  if not found or obj.owner_id is distinct from auth.uid()::text
  then raise exception 'Uploaded object ownership not verified' using errcode='42501'; end if;
  measured_size := nullif(obj.metadata->>'size','')::bigint;
  measured_mime := obj.metadata->>'mimetype';
  if measured_size is distinct from f.byte_size or measured_mime is distinct from f.mime_type
     or measured_size>10485760
  then raise exception 'Uploaded object does not match reservation' using errcode='22023'; end if;
  update public.tenant_files set status='ready',finalized_at=now() where id=f.id returning * into f;
  insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
    values(f.tenant_id,auth.uid(),'tenant_file.finalized','tenant_file',f.id,
           jsonb_build_object('module',f.module_key,'size',f.byte_size));
  return f;
end $$;
revoke all on function public.crm_finalize_tenant_file(uuid) from public,anon;
grant execute on function public.crm_finalize_tenant_file(uuid) to authenticated;

-- Safe metadata cleanup only after Storage API has removed the object.
create function public.crm_cancel_tenant_file(p_file_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare f public.tenant_files;
begin
  select * into f from public.tenant_files where id=p_file_id for update;
  if not found or not private.crm_file_allowed(f.tenant_id,f.module_key,true)
    or (f.uploaded_by<>auth.uid() and not private.crm_is_tenant_admin(f.tenant_id))
  then raise exception 'Document unavailable' using errcode='42501'; end if;
  if exists (select 1 from storage.objects o
             where o.bucket_id='crm-documents' and o.name=f.object_path)
  then raise exception 'Remove object through Storage API before deleting metadata' using errcode='23514'; end if;
  delete from public.tenant_files where id=f.id;
  insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
    values(f.tenant_id,auth.uid(),'tenant_file.cancelled','tenant_file',f.id,
           jsonb_build_object('module',f.module_key,'previous_status',f.status));
  return true;
end $$;
revoke all on function public.crm_cancel_tenant_file(uuid) from public,anon;
grant execute on function public.crm_cancel_tenant_file(uuid) to authenticated;

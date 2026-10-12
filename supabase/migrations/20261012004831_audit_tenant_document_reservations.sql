-- Auditable reservation and immutable finalization state; applied 20261012004831.
alter table public.tenant_files
  add constraint tenant_files_finalize_state_check
  check ((status='reserved' and finalized_at is null)
      or (status='ready' and finalized_at is not null));

create function private.crm_audit_file_reservation()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
  values(new.tenant_id,auth.uid(),'tenant_file.reserved','tenant_file',new.id,
         jsonb_build_object('module',new.module_key,'mime_type',new.mime_type,'size',new.byte_size));
  return new;
end $$;
revoke all on function private.crm_audit_file_reservation() from public,anon,authenticated;
create trigger tenant_file_reservation_audit after insert on public.tenant_files
  for each row execute function private.crm_audit_file_reservation();

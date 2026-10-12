-- Repeatable QA regression; uses only the named E2E fixtures. ALL changes roll back.
-- Run manually as a single transaction against the canonical Supabase project.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','e88091da-a83a-452f-8add-6611d0f648df',true);
do $qa$
declare
  a constant uuid:='25139e2a-b099-4786-b768-b496ea986595';
  b constant uuid:='db62e704-47b1-4df0-86ed-9481e2ac14d3';
  ua constant uuid:='e88091da-a83a-452f-8add-6611d0f648df';
  ub constant uuid:='af6cb320-757f-445c-8f24-30dc580776c7';
  b_company constant uuid:='1e7d59f0-c0dc-4d74-a3e2-649a5cb4feda';
  a_id uuid:=gen_random_uuid();
  b_id uuid:=gen_random_uuid();
  cancelled_id uuid:=gen_random_uuid();
begin
  if not private.crm_file_allowed(a,'general',true) or private.crm_file_allowed(b,'general',true)
  then raise exception 'QA A authorization does not match tenant A'; end if;
  insert into public.tenant_files(id,tenant_id,uploaded_by,filename,module_key,mime_type,byte_size)
    values(a_id,a,ua,'qa-a.pdf','general','application/pdf',128);
  if (select count(*) from public.tenant_files where id=a_id)<>1
  then raise exception 'QA A cannot see own pending upload'; end if;
  begin
    insert into public.tenant_files(tenant_id,uploaded_by,filename,module_key,mime_type,byte_size)
      values(b,ua,'wrong-tenant.pdf','general','application/pdf',128);
    raise exception 'Cross tenant insertion unexpectedly allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.tenant_files(tenant_id,uploaded_by,filename,module_key,mime_type,byte_size,company_id)
      values(a,ua,'wrong-company.pdf','general','application/pdf',128,b_company);
    raise exception 'Cross tenant company reference unexpectedly allowed';
  exception when foreign_key_violation then null; end;
  begin
    insert into public.tenant_files(tenant_id,uploaded_by,filename,module_key,mime_type,byte_size)
      values(a,ua,'bad.exe','general','application/octet-stream',128);
    raise exception 'Executable file unexpectedly permitted';
  exception when check_violation then null; end;
  begin
    insert into public.tenant_files(tenant_id,uploaded_by,filename,module_key,mime_type,byte_size)
      values(a,ua,'huge.pdf','general','application/pdf',10485761);
    raise exception 'Oversize file unexpectedly permitted';
  exception when check_violation then null; end;
  begin
    perform public.crm_finalize_tenant_file(a_id);
    raise exception 'Finalization without actual upload unexpectedly allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.tenant_files set module_key='finance' where id=a_id;
    raise exception 'Direct metadata update unexpectedly allowed';
  exception when insufficient_privilege then null; end;

  perform set_config('request.jwt.claim.sub',ub::text,true);
  if (select count(*) from public.tenant_files where id=a_id)<>0
  then raise exception 'QA B can read QA A metadata'; end if;
  begin
    perform public.crm_cancel_tenant_file(a_id);
    raise exception 'QA B can cancel QA A reservation';
  exception when insufficient_privilege then null; end;
  insert into public.tenant_files(id,tenant_id,uploaded_by,filename,module_key,mime_type,byte_size)
    values(b_id,b,ub,'qa-b.pdf','general','application/pdf',128);
  if (select count(*) from public.tenant_files where id=b_id)<>1
  then raise exception 'QA B cannot see own metadata'; end if;

  perform set_config('request.jwt.claim.sub',ua::text,true);
  if (select count(*) from public.tenant_files where id=b_id)<>0
  then raise exception 'QA A can read QA B metadata'; end if;
  insert into public.tenant_files(id,tenant_id,uploaded_by,filename,module_key,mime_type,byte_size)
    values(cancelled_id,a,ua,'to-cancel.pdf','general','application/pdf',100);
  if not public.crm_cancel_tenant_file(cancelled_id)
  then raise exception 'QA A cannot cancel own orphaned reservation'; end if;
  if exists(select 1 from public.tenant_files where id=cancelled_id)
  then raise exception 'Cancelled metadata still exists'; end if;
  if not exists(select 1 from public.audit_logs where entity_id=cancelled_id and action='tenant_file.cancelled')
  then raise exception 'Cancelled reservation not audited'; end if;
end $qa$;
select 'PASS: 12+ tenant file security regression assertions; transaction rolls back' as result;
rollback;
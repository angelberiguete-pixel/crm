-- SQL regression for the Family Power / shared CRM conversation inbox.
-- Run against a database where the accompanying migration has been applied.
-- Read-only; rolls back the simulated session and writes no business records.
begin;

do $$
begin
  if not has_schema_privilege('authenticated', 'private', 'USAGE') then
    raise exception 'Authenticated role needs private schema USAGE for RLS helper';
  end if;
  if not has_function_privilege(
    'authenticated', 'private.crm_can_view_conversation(uuid,uuid)', 'EXECUTE'
  ) then
    raise exception 'Authenticated role cannot evaluate inbox SELECT RLS policy';
  end if;
  if has_function_privilege(
    'anon', 'private.crm_can_view_conversation(uuid,uuid)', 'EXECUTE'
  ) then
    raise exception 'Anonymous role must not execute private inbox helper';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='conversations'
      and policyname='conversations_select'
      and qual like '%private.crm_can_view_conversation%'
  ) or not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='messages'
      and policyname='messages_select'
      and qual like '%private.crm_can_view_conversation%'
  ) then
    raise exception 'Inbox RLS policies no longer use the guarded helper';
  end if;
end $$;

-- An authenticated user WITHOUT tenant membership must still be denied.
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text,
  true
);
set local role authenticated;
do $$
begin
  if private.crm_can_view_conversation(gen_random_uuid(), gen_random_uuid()) then
    raise exception 'Nonmember unexpectedly gained conversation access';
  end if;
end $$;
reset role;

rollback;

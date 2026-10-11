-- Run with a database administrative test connection. No persistent mutations.
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
  if exists(select 1 from public.memberships) or exists(select 1 from public.contacts) or exists(select 1 from public.opportunities) or exists(select 1 from public.quotations) then
    raise exception 'Unrelated authenticated user can access CRM data';
  end if;
end $$;
rollback;

create or replace function private.enforce_automation_runs_quota()
returns trigger
language plpgsql
security definer
set search_path='public','private'
as $$
declare
  v_usage bigint;
begin
  select count(*) into v_usage
  from public.automation_runs
  where tenant_id = new.tenant_id
    and created_at >= date_trunc('month', now());

  perform private.assert_feature_quota(new.tenant_id, 'automation_runs', v_usage);
  return new;
end;
$$;

revoke all on function private.enforce_automation_runs_quota() from public,anon,authenticated;

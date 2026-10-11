create or replace function private.dispatch_automation_worker()
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare
  v_key text;
  v_request bigint;
begin
  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name='look_social_automation_worker'
  order by created_at desc
  limit 1;

  if v_key is null then
    raise exception 'Automation worker key missing';
  end if;

  select net.http_post(
    url := 'https://ygipjqgyreeahslzorik.supabase.co/functions/v1/automation-engine',
    body := jsonb_build_object('limit',20),
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-automation-worker-key',v_key
    ),
    timeout_milliseconds := 10000
  ) into v_request;

  return v_request;
end;
$$;

revoke all on function private.dispatch_automation_worker() from public,anon,authenticated;

do $$
begin
  if exists(select 1 from cron.job where jobname='look-social-automation-worker') then
    perform cron.unschedule('look-social-automation-worker');
  end if;
  perform cron.schedule(
    'look-social-automation-worker',
    '* * * * *',
    'select private.dispatch_automation_worker();'
  );
end $$;

comment on function private.dispatch_automation_worker() is 'Dispatches the automation engine using a worker key stored encrypted in Supabase Vault.';

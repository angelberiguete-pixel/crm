-- Look Digital Staff: review audit + atomic daily trial allocation.
-- This migration is versioned ONLY. Do not run on production without authorization.
--
-- Preserve the existing ai_agents, ai_agent_runs and memberships structures.
-- Only a service-role client may reserve paid model trials.
create table if not exists public.ai_agent_trial_usage (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  usage_day date not null,
  used_count integer not null default 0 check (used_count between 0 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id,usage_day)
);
alter table public.ai_agent_trial_usage enable row level security;
revoke all on public.ai_agent_trial_usage from public,anon,authenticated;
grant select,insert,update on public.ai_agent_trial_usage to service_role;

create or replace function public.reserve_ai_employee_trial(
  p_request_id uuid,
  p_tenant_id uuid,
  p_agent_id uuid,
  p_question text,
  p_role text
)
returns text
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_count integer;
begin
  if p_request_id is null or p_tenant_id is null or p_agent_id is null then
    return 'invalid_request';
  end if;
  if p_question is null or length(btrim(p_question)) < 3 or length(p_question)>1200
    or p_role not in ('recepcionista','vendedor','secretaria','cobros') then
    return 'invalid_request';
  end if;
  if not exists (
    select 1 from public.ai_agents a
    where a.id=p_agent_id and a.tenant_id=p_tenant_id
      and a.status='draft' and a.model_provider='openai'
      and a.approval_mode='human_approval'
      and a.allowed_tools='[]'::jsonb
  ) then
    return 'agent_not_in_safe_draft_mode';
  end if;
  if exists (select 1 from public.ai_agent_runs r where r.id=p_request_id) then
    return 'request_already_submitted';
  end if;
  -- Atomic upsert: concurrency cannot exceed the daily 20-trial ceiling.
  insert into public.ai_agent_trial_usage as q
    (tenant_id,usage_day,used_count)
  values (p_tenant_id,(now() at time zone 'utc')::date,1)
  on conflict (tenant_id,usage_day) do update
    set used_count=q.used_count+1,updated_at=now()
    where q.used_count<20
  returning used_count into v_count;

  if v_count is null then return 'daily_trial_limit'; end if;

  -- If a duplicate request ID races here, PostgreSQL aborts the transaction
  -- and rolls back the quota reservation as well.
  insert into public.ai_agent_runs(
    id,tenant_id,agent_id,status,input,started_at
  ) values (
    p_request_id,p_tenant_id,p_agent_id,'running',
    jsonb_build_object('source','manual_sandbox','question',btrim(p_question),'role',p_role),
    now()
  );
  return 'reserved';
end;
$$;
revoke all on function public.reserve_ai_employee_trial(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.reserve_ai_employee_trial(uuid,uuid,uuid,text,text) to service_role;

-- Explicit manual review, append-only: approving a draft NEVER sends it.
create table if not exists public.ai_agent_reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  run_id uuid not null,
  reviewed_by uuid not null default auth.uid() references auth.users(id),
  decision text not null check (decision in ('approved','rejected')),
  reviewed_text text,
  note text,
  created_at timestamptz not null default now(),
  unique(tenant_id,run_id),
  constraint ai_agent_reviews_run_tenant_fk
    foreign key (tenant_id,run_id)
    references public.ai_agent_runs(tenant_id,id) on delete cascade,
  constraint ai_agent_reviews_valid_text check (
    (decision='approved' and length(btrim(coalesce(reviewed_text,''))) between 1 and 5000)
    or (decision='rejected' and reviewed_text is null)
  ),
  constraint ai_agent_reviews_note_check check(length(coalesce(note,''))<=1000)
);
create index if not exists ai_agent_reviews_recent
  on public.ai_agent_reviews(tenant_id,created_at desc);
alter table public.ai_agent_reviews enable row level security;
revoke all on public.ai_agent_reviews from public,anon,authenticated;
grant select,insert on public.ai_agent_reviews to authenticated;
grant all on public.ai_agent_reviews to service_role;

create policy ai_agent_reviews_select on public.ai_agent_reviews
  for select to authenticated using (
    private.is_tenant_admin(tenant_id)
  );
create policy ai_agent_reviews_insert on public.ai_agent_reviews
  for insert to authenticated with check (
    private.is_tenant_admin(tenant_id)
    and reviewed_by = (select auth.uid())
    and exists (
      select 1 from public.ai_agent_runs r
      where r.id=run_id and r.tenant_id=tenant_id
        and r.status='awaiting_approval'
    )
  );
comment on table public.ai_agent_reviews is
  'Immutable human decisions on AI-generated draft text; no external messages are sent here.';

-- Look Digital Staff — transactional monetary reservations, UTC calendar month.
-- VERSIONED ONLY: no live deployment without authorized spend limit and test credentials.
-- Follow-up to 20261028235000_ai_employee_atomic_trials_and_reviews.sql.
create table if not exists public.ai_employee_monthly_budget (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  month_start date not null,
  reserved_micros bigint not null default 0 check(reserved_micros >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id,month_start)
);
create table if not exists public.ai_employee_global_monthly_budget (
  month_start date primary key,
  reserved_micros bigint not null default 0 check(reserved_micros >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ai_employee_monthly_budget enable row level security;
alter table public.ai_employee_global_monthly_budget enable row level security;
revoke all on public.ai_employee_monthly_budget from public, anon, authenticated;
revoke all on public.ai_employee_global_monthly_budget from public, anon, authenticated;
grant select,insert,update on public.ai_employee_monthly_budget to service_role;
grant select,insert,update on public.ai_employee_global_monthly_budget to service_role;

-- Replace prior *service-only* reservation with a budget-aware version.
-- No browser role can call either RPC. Exceptions abort all partial reservations.
drop function if exists public.reserve_ai_employee_trial(uuid,uuid,uuid,text,text);
create or replace function public.reserve_ai_employee_budgeted_trial(
  p_request_id uuid, p_tenant_id uuid, p_agent_id uuid,
  p_question text, p_role text, p_max_cost_micros bigint,
  p_tenant_month_limit_micros bigint, p_global_month_limit_micros bigint
)
returns text
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_day date := (now() at time zone 'UTC')::date;
  v_month date := date_trunc('month', now() at time zone 'UTC')::date;
  v_reserved bigint;
  v_count integer;
begin
  if p_request_id is null or p_tenant_id is null or p_agent_id is null
    or p_question is null or length(btrim(p_question)) < 3 or length(p_question) > 1200
    or p_role not in ('recepcionista','vendedor','secretaria','cobros') then
    return 'invalid_request';
  end if;
  -- Always fail closed. The caller is a validated service-role worker.
  if p_max_cost_micros is null or p_max_cost_micros < 1 or p_max_cost_micros > 1000000
    or p_tenant_month_limit_micros is null
    or p_global_month_limit_micros is null
    or p_tenant_month_limit_micros < p_max_cost_micros
    or p_global_month_limit_micros < p_tenant_month_limit_micros
    or p_global_month_limit_micros > 10000000000 then
    return 'budget_configuration_invalid';
  end if;
  if not exists (
    select 1 from public.ai_agents a
    where a.id=p_agent_id and a.tenant_id=p_tenant_id
      and a.status='draft' and a.model_provider='openai'
      and a.approval_mode='human_approval'
      and a.allowed_tools='[]'::jsonb
  ) then return 'agent_not_in_safe_draft_mode'; end if;
  if exists(select 1 from public.ai_agent_runs r where r.id=p_request_id) then
    return 'request_already_submitted';
  end if;

  -- Lock one global calendar-month row first. All concurrent tenant requests
  -- serialize at this budget boundary before they can reserve tenant usage.
  insert into public.ai_employee_global_monthly_budget as b
    (month_start,reserved_micros)
  values(v_month,p_max_cost_micros)
  on conflict(month_start) do update
    set reserved_micros=b.reserved_micros+excluded.reserved_micros,
        updated_at=now()
    where b.reserved_micros <= p_global_month_limit_micros-excluded.reserved_micros
  returning reserved_micros into v_reserved;
  if v_reserved is null then
    raise exception 'global_budget_exhausted' using errcode='P0001';
  end if;

  v_reserved := null;
  insert into public.ai_employee_monthly_budget as b
    (tenant_id,month_start,reserved_micros)
  values(p_tenant_id,v_month,p_max_cost_micros)
  on conflict(tenant_id,month_start) do update
    set reserved_micros=b.reserved_micros+excluded.reserved_micros,
        updated_at=now()
    where b.reserved_micros <= p_tenant_month_limit_micros-excluded.reserved_micros
  returning reserved_micros into v_reserved;
  if v_reserved is null then
    raise exception 'tenant_budget_exhausted' using errcode='P0001';
  end if;

  -- Preserve the initial sandbox safety gate of at most 20 trials/day/tenant.
  insert into public.ai_agent_trial_usage as q (tenant_id,usage_day,used_count)
  values(p_tenant_id,v_day,1)
  on conflict (tenant_id,usage_day) do update
    set used_count=q.used_count+1,updated_at=now()
    where q.used_count<20
  returning used_count into v_count;
  if v_count is null then
    raise exception 'daily_trial_limit' using errcode='P0001';
  end if;
  -- Unique run ID protects against retries; a conflict rolls back ALL budgets.
  insert into public.ai_agent_runs (
    id,tenant_id,agent_id,status,input,estimated_cost_micros,started_at
  ) values (
    p_request_id,p_tenant_id,p_agent_id,'running',
    jsonb_build_object('source','manual_sandbox','question',btrim(p_question),'role',p_role,
      'reserved_cost_micros',p_max_cost_micros),
    p_max_cost_micros,now()
  );
  return 'reserved';
end;
$$;
revoke all on function public.reserve_ai_employee_budgeted_trial(uuid,uuid,uuid,text,text,bigint,bigint,bigint)
  from public,anon,authenticated;
grant execute on function public.reserve_ai_employee_budgeted_trial(uuid,uuid,uuid,text,text,bigint,bigint,bigint)
  to service_role;
comment on table public.ai_employee_monthly_budget is
  'Conservative per-tenant monthly USD micro reservations; unused maximum is not released during pilot.';
comment on table public.ai_employee_global_monthly_budget is
  'Conservative project-wide monthly USD micro reservations; verified provider cost must be monitored separately.';

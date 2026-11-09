-- Applied directly to Empresia Supabase (migration 20261109110350).
-- Cita-24 portal, patient request inbox and limited AI trials. Disabled by default.
create table if not exists public.cita24_portal_configs (
 tenant_id uuid primary key references public.tenants(id) on delete cascade,
 slug text not null unique check(slug ~ '^[a-z0-9][a-z0-9-]{2,55}$'),
 clinic_name text not null check(char_length(clinic_name) between 3 and 100),
 services text[] not null default array['Evaluación inicial']::text[],
 enabled boolean not null default false,
 ai_enabled boolean not null default false,
 whatsapp_reminders_enabled boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint cita24_portal_services_bounds check(cardinality(services) between 1 and 12 and array_to_string(services,'') !~ '[<>]')
);
alter table public.cita24_portal_configs enable row level security;
revoke all on public.cita24_portal_configs from anon;
grant select,insert,update on public.cita24_portal_configs to authenticated;
create policy cita24_configs_select on public.cita24_portal_configs for select to authenticated using(private.has_tenant_access(tenant_id));
create policy cita24_configs_insert on public.cita24_portal_configs for insert to authenticated with check(
 private.is_tenant_admin(tenant_id) and exists(select 1 from public.tenants t where t.id=tenant_id and t.slug<>'family-power' and t.status='active')
);
create policy cita24_configs_update on public.cita24_portal_configs for update to authenticated using(private.is_tenant_admin(tenant_id))
 with check(private.is_tenant_admin(tenant_id) and exists(select 1 from public.tenants t where t.id=tenant_id and t.slug<>'family-power' and t.status='active'));

create table if not exists public.cita24_visit_requests (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id) on delete cascade,
 full_name text not null check(char_length(full_name) between 2 and 100),
 phone text not null check(phone ~ '^\+[1-9][0-9]{7,14}$'),
 email text check(email is null or char_length(email)<=180),
 service text not null check(char_length(service) between 2 and 80),
 preferred_day date not null,
 preferred_window text not null check(preferred_window in ('morning','afternoon','evening')),
 privacy_accepted boolean not null check(privacy_accepted=true),
 whatsapp_opt_in boolean not null default false,
 status text not null default 'pending' check(status in ('pending','contacted','scheduled','declined')),
 source text not null default 'public_form' check(source='public_form'),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint cita24_request_tenant_identity unique(tenant_id,id)
);
create index if not exists cita24_requests_tenant_recent on public.cita24_visit_requests(tenant_id,status,created_at desc);
alter table public.cita24_visit_requests enable row level security;
revoke all on public.cita24_visit_requests from anon;
grant select,update on public.cita24_visit_requests to authenticated;
create policy cita24_requests_select on public.cita24_visit_requests for select to authenticated using(private.has_tenant_access(tenant_id));
create policy cita24_requests_update on public.cita24_visit_requests for update to authenticated
 using(private.can_operate_crm(tenant_id)) with check(private.can_operate_crm(tenant_id));

create table if not exists public.cita24_request_quota (
 tenant_id uuid not null references public.tenants(id) on delete cascade,
 key_digest text not null check(char_length(key_digest)=64),
 period date not null, attempts integer not null default 0 check(attempts>=0),
 primary key(tenant_id,key_digest,period)
);
alter table public.cita24_request_quota enable row level security;
revoke all on public.cita24_request_quota from public,anon,authenticated;
create or replace function public.cita24_claim_request_quota(p_tenant_id uuid,p_key_digest text,p_day date)
returns boolean language plpgsql security invoker set search_path=''
as $$
declare v_tries integer;
begin
 if p_tenant_id is null or p_key_digest !~ '^[a-f0-9]{64}$' or p_day<>(now() at time zone 'UTC')::date then return false; end if;
 insert into public.cita24_request_quota(tenant_id,key_digest,period,attempts) values(p_tenant_id,p_key_digest,p_day,1)
 on conflict(tenant_id,key_digest,period) do update set attempts=cita24_request_quota.attempts+1
 where cita24_request_quota.attempts<4 returning attempts into v_tries;
 return v_tries is not null;
end $$;
revoke all on function public.cita24_claim_request_quota(uuid,text,date) from public,anon,authenticated;
grant execute on function public.cita24_claim_request_quota(uuid,text,date) to service_role;

create table if not exists public.cita24_ai_daily_quotas (
 tenant_id uuid not null references public.tenants(id) on delete cascade,
 period date not null,attempts integer not null default 0 check(attempts>=0),
 primary key(tenant_id,period)
);
alter table public.cita24_ai_daily_quotas enable row level security;
revoke all on public.cita24_ai_daily_quotas from public,anon,authenticated;
create or replace function public.cita24_claim_ai_daily_quota(p_tenant_id uuid)
returns boolean language plpgsql security invoker set search_path=''
as $$
declare v_count integer;
begin
 if p_tenant_id is null then return false; end if;
 insert into public.cita24_ai_daily_quotas(tenant_id,period,attempts)
 values(p_tenant_id,(now() at time zone 'UTC')::date,1)
 on conflict(tenant_id,period) do update set attempts=cita24_ai_daily_quotas.attempts+1
 where cita24_ai_daily_quotas.attempts<10 returning attempts into v_count;
 return v_count is not null;
end $$;
revoke all on function public.cita24_claim_ai_daily_quota(uuid) from public,anon,authenticated;
grant execute on function public.cita24_claim_ai_daily_quota(uuid) to service_role;

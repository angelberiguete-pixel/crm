-- Per-company access sessions, sourced from actual Supabase JWT session_id.
-- No IP, device fingerprint or message text. Duration is approximate active
-- browser time based on heartbeats; it is not payroll or guaranteed presence.
create table if not exists public.tenant_access_sessions(
 id bigint generated always as identity primary key,
 tenant_id uuid not null references public.tenants(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 session_id text not null check(length(session_id) between 20 and 160),
 started_at timestamptz not null default now(),
 last_seen_at timestamptz not null default now(),
 ended_at timestamptz,
 is_support_access boolean not null default false,
 unique(tenant_id,user_id,session_id)
);
create index if not exists tenant_access_sessions_recent
 on public.tenant_access_sessions(tenant_id,last_seen_at desc);
alter table public.tenant_access_sessions enable row level security;
revoke all on public.tenant_access_sessions from public,anon,authenticated;
-- All writes via narrowly authorized security-definer RPCs.

create or replace function public.tenant_session_heartbeat(p_tenant_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_session text;v_support boolean;
begin
 v_session:=auth.jwt()->>'session_id';
 if auth.uid() is null or length(coalesce(v_session,'')) not between 20 and 160
    or not private.crm_active_tenant_matches(p_tenant_id)
    or not private.has_tenant_access(p_tenant_id)
 then raise exception 'Verified active tenant session required' using errcode='42501';end if;
 v_support:=private.platform_client_view_tenant()=p_tenant_id;
 insert into public.tenant_access_sessions as s
  (tenant_id,user_id,session_id,is_support_access)
 values(p_tenant_id,auth.uid(),v_session,coalesce(v_support,false))
 on conflict (tenant_id,user_id,session_id) do update
 set last_seen_at=now(),ended_at=null,
     is_support_access=s.is_support_access or excluded.is_support_access;
 return jsonb_build_object('recorded',true,'tenant_id',p_tenant_id);
end;
$$;
revoke all on function public.tenant_session_heartbeat(uuid) from public,anon;
grant execute on function public.tenant_session_heartbeat(uuid) to authenticated;

create or replace function public.tenant_session_end(p_tenant_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $$
begin
 if auth.uid() is null or (auth.jwt()->>'session_id') is null
 then return false;end if;
 update public.tenant_access_sessions
 set ended_at=now(),last_seen_at=now()
 where tenant_id=p_tenant_id and user_id=auth.uid()
   and session_id=auth.jwt()->>'session_id' and ended_at is null;
 return found;
end;
$$;
revoke all on function public.tenant_session_end(uuid) from public,anon;
grant execute on function public.tenant_session_end(uuid) to authenticated;

create or replace function public.tenant_session_activity_overview(p_tenant_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_entries jsonb;
begin
 if auth.uid() is null or not private.crm_active_tenant_matches(p_tenant_id)
  or not private.has_tenant_role(p_tenant_id,array['owner','admin']::text[])
 then raise exception 'Company administration required' using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'user_id',s.user_id,'user_email',u.email,
   'role',m.role,'started_at',s.started_at,
   'last_seen_at',s.last_seen_at,'ended_at',s.ended_at,
   'recently_active',s.ended_at is null and s.last_seen_at>now()-interval '3 minutes',
   'active_seconds',greatest(0,extract(epoch from coalesce(s.ended_at,s.last_seen_at)-s.started_at)),
   'support_access',s.is_support_access)
   order by s.last_seen_at desc),'[]'::jsonb)
 into v_entries from (
   select * from public.tenant_access_sessions
   where tenant_id=p_tenant_id order by last_seen_at desc limit 200
 ) s
 join public.memberships m on m.tenant_id=s.tenant_id and m.user_id=s.user_id
 left join auth.users u on u.id=s.user_id;
 return jsonb_build_object('tenant_id',p_tenant_id,'sessions',v_entries,
   'measurement','heartbeat_approximation','recording_started_after_deployment',true);
end;
$$;
revoke all on function public.tenant_session_activity_overview(uuid) from public,anon;
grant execute on function public.tenant_session_activity_overview(uuid) to authenticated;
comment on function public.tenant_session_activity_overview(uuid)
 is 'Company owner/admin only, last 200 user sessions; active_seconds is based on heartbeats, not proof of active work.';

-- AUREVECTOR public onboarding sessions.
-- Sessions are owned by an authenticated Supabase user (including anonymous Auth users).
-- No tenant is created during onboarding.

create table if not exists public.onboarding_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft','preview','converted','expired')),
  current_step integer not null default 1 check (current_step between 1 and 3),
  business jsonb not null default '{}'::jsonb,
  objectives text[] not null default '{}',
  tone text not null default 'Profesional y accesible',
  proposal jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists onboarding_sessions_user_id_idx on public.onboarding_sessions(user_id);
create index if not exists onboarding_sessions_expires_at_idx on public.onboarding_sessions(expires_at);

alter table public.onboarding_sessions enable row level security;

create policy "onboarding owner select" on public.onboarding_sessions
for select to authenticated
using ((select auth.uid()) = user_id and expires_at > now());

create policy "onboarding owner insert" on public.onboarding_sessions
for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "onboarding owner update" on public.onboarding_sessions
for update to authenticated
using ((select auth.uid()) = user_id and expires_at > now())
with check ((select auth.uid()) = user_id);

create table if not exists public.onboarding_events (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.onboarding_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_name text not null check (event_name in ('onboarding_started','business_completed','objectives_completed','proposal_viewed','sandbox_message','activation_clicked')),
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists onboarding_events_session_id_idx on public.onboarding_events(session_id);
create index if not exists onboarding_events_created_at_idx on public.onboarding_events(created_at);

alter table public.onboarding_events enable row level security;

create policy "onboarding event owner select" on public.onboarding_events
for select to authenticated
using ((select auth.uid()) = user_id);

create policy "onboarding event owner insert" on public.onboarding_events
for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.onboarding_sessions s
    where s.id = session_id and s.user_id = (select auth.uid()) and s.expires_at > now()
  )
);

grant select, insert, update on public.onboarding_sessions to authenticated;
grant select, insert on public.onboarding_events to authenticated;
grant usage, select on sequence public.onboarding_events_id_seq to authenticated;

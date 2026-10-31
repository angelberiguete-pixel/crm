-- Client isolation: each authenticated browser session is pinned to one business.
-- Server enforcement: no global platform privilege or cross-company switch while
-- signed into a client portal. Signing out creates a fresh auth session for owner console.

create table if not exists private.crm_client_portal_locks(
 auth_session_id uuid primary key,
 user_id uuid not null,
 tenant_id uuid not null references public.tenants(id) on delete cascade,
 locked_at timestamptz not null default now()
);
revoke all on private.crm_client_portal_locks from public,anon,authenticated;

create or replace function private.crm_is_client_portal_locked()
returns boolean language sql stable security definer set search_path=''
as $$
  select exists(select 1 from private.crm_client_portal_locks l
    where l.user_id=auth.uid()
      and l.auth_session_id=case
        when (auth.jwt()->>'session_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (auth.jwt()->>'session_id')::uuid else null end);
$$;
revoke all on function private.crm_is_client_portal_locked() from public,anon,authenticated;

-- In a client portal, a platform owner is *only* the client's granted
-- tenant membership, not a global superadmin. Global privileges return on
-- the next genuine Supabase login/session (after sign-out).
create or replace function private.crm_is_platform_admin()
returns boolean language sql stable security definer set search_path=''
as $$
 select not private.crm_is_client_portal_locked() and exists(
   select 1 from public.platform_users pu
   where pu.user_id=auth.uid() and pu.status='active'
     and pu.platform_role in ('platform_owner','platform_admin'));
$$;

create or replace function private.crm_is_platform_user()
returns boolean language sql stable security definer set search_path=''
as $$
 select not private.crm_is_client_portal_locked() and exists(
  select 1 from public.platform_users pu
  where pu.user_id=auth.uid() and pu.status='active');
$$;

create or replace function public.crm_lock_client_portal(p_tenant_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_session uuid;v_existing uuid;v_slug text;
begin
 if auth.uid() is null then raise exception 'Sign-in required' using errcode='42501';end if;
 if (auth.jwt()->>'session_id') is null
   or (auth.jwt()->>'session_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 then raise exception 'Valid authentication session required' using errcode='42501';end if;
 v_session:=(auth.jwt()->>'session_id')::uuid;
 select t.slug into v_slug from public.tenants t
 join public.memberships m on m.tenant_id=t.id
 where t.id=p_tenant_id and m.user_id=auth.uid() and m.status='active';
 if v_slug is null or not private.crm_active_tenant_matches(p_tenant_id)
 then raise exception 'Active company membership required' using errcode='42501';end if;

 -- Platform owner's own Look CRM is the owner's platform workspace.
 if v_slug='eurevector' and exists(
   select 1 from public.platform_users pu where pu.user_id=auth.uid()
     and pu.status='active' and pu.platform_role in ('platform_owner','platform_admin'))
   and not private.crm_is_client_portal_locked()
 then return jsonb_build_object('locked',false,'tenant_id',p_tenant_id,'platform_workspace',true);end if;

 select l.tenant_id into v_existing from private.crm_client_portal_locks l
 where l.auth_session_id=v_session and l.user_id=auth.uid();
 if v_existing is not null and v_existing<>p_tenant_id
 then raise exception 'Cierra sesión e inicia sesión para entrar a otra empresa' using errcode='42501';end if;
 insert into private.crm_client_portal_locks(auth_session_id,user_id,tenant_id)
 values(v_session,auth.uid(),p_tenant_id)
 on conflict(auth_session_id) do nothing;
 return jsonb_build_object('locked',true,'tenant_id',p_tenant_id);
end;
$$;
revoke all on function public.crm_lock_client_portal(uuid) from public,anon,authenticated;
grant execute on function public.crm_lock_client_portal(uuid) to authenticated;

-- Enforce the lock even if someone calls set_active_tenant RPC directly.
create or replace function private.crm_prevent_locked_tenant_switch()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if auth.uid() is not null and new.user_id=auth.uid() and
  exists(select 1 from private.crm_client_portal_locks l
   where l.user_id=auth.uid()
     and l.auth_session_id=case
       when (auth.jwt()->>'session_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       then (auth.jwt()->>'session_id')::uuid else null end
     and l.tenant_id<>new.tenant_id)
 then raise exception 'Para cambiar de empresa debes cerrar sesión e iniciar sesión nuevamente' using errcode='42501';end if;
 return new;
end;
$$;
drop trigger if exists crm_lock_active_tenant_on_switch on private.user_active_tenants;
create trigger crm_lock_active_tenant_on_switch
 before insert or update of tenant_id on private.user_active_tenants
 for each row execute function private.crm_prevent_locked_tenant_switch();

-- SECURITY DEFINER prevents recursive RLS on conversations itself.
-- Agents see their assigned chats or an unassigned AI handoff queue.
create or replace function private.crm_can_view_conversation(p_tenant_id uuid,p_conversation_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
 select auth.uid() is not null
  and private.crm_active_tenant_matches(p_tenant_id)
  and (
    private.crm_is_platform_admin()
    or exists(select 1 from public.memberships m
      where m.tenant_id=p_tenant_id and m.user_id=auth.uid()
        and m.status='active' and m.role in ('owner','admin','manager'))
    or exists(
      select 1 from public.memberships m
      join public.conversations c on c.tenant_id=m.tenant_id
      where m.tenant_id=p_tenant_id and m.user_id=auth.uid()
        and m.status='active' and m.role='agent'
        and c.id=p_conversation_id
        and (c.assigned_to=auth.uid()
          or (c.assigned_to is null and
              (c.metadata->>'routing_mode'='ai'
               or c.metadata->>'origin'='ai'
               or c.metadata->>'handled_by'='ai'))))
  );
$$;
revoke all on function private.crm_can_view_conversation(uuid,uuid) from public,anon,authenticated;

drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations for select to authenticated
 using(private.crm_can_view_conversation(tenant_id,id));
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated
 using(private.crm_can_view_conversation(tenant_id,conversation_id));

-- Sellers cannot spoof another agent's message or insert into another conversation.
create or replace function private.crm_can_insert_conversation_message(
 p_tenant_id uuid,p_conversation_id uuid,p_sender_user_id uuid,
 p_direction text,p_sender_type text)
returns boolean language sql stable security definer set search_path=''
as $$
 select private.crm_active_tenant_matches(p_tenant_id) and
 (
   private.crm_is_platform_admin()
   or exists(select 1 from public.memberships m
     where m.tenant_id=p_tenant_id and m.user_id=auth.uid()
       and m.status='active' and m.role in ('owner','admin','manager'))
   or (
     p_direction='outbound' and p_sender_type='user' and p_sender_user_id=auth.uid()
     and exists(select 1 from public.memberships m
       join public.conversations c on c.tenant_id=m.tenant_id
       where m.tenant_id=p_tenant_id and m.user_id=auth.uid()
         and m.status='active' and m.role='agent'
         and c.id=p_conversation_id and c.assigned_to=auth.uid())
   )
 );
$$;
revoke all on function private.crm_can_insert_conversation_message(uuid,uuid,uuid,text,text) from public,anon,authenticated;
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated
 with check(private.crm_can_insert_conversation_message(
  tenant_id,conversation_id,sender_user_id,direction,sender_type));

-- Prevent agents reading customer messages through the read-all policy: policies
-- above are the sole authenticated SELECT policy for these two tables.

create table if not exists public.crm_member_sessions(
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 auth_session_id uuid not null,
 member_role text not null,
 signed_in_at timestamptz not null default now(),
 last_seen_at timestamptz not null default now(),
 active_seconds integer not null default 0 check(active_seconds>=0),
 signed_out_at timestamptz,
 unique(tenant_id,user_id,auth_session_id)
);
create index if not exists crm_member_sessions_tenant_recent on public.crm_member_sessions(tenant_id,signed_in_at desc);
alter table public.crm_member_sessions enable row level security;
revoke all on public.crm_member_sessions from public,anon,authenticated;
grant select on public.crm_member_sessions to authenticated;
create policy crm_member_sessions_read on public.crm_member_sessions for select to authenticated
 using(user_id=auth.uid() or
  (private.crm_active_tenant_matches(tenant_id)
   and (private.crm_is_platform_admin() or
     exists(select 1 from public.memberships m
       where m.tenant_id=crm_member_sessions.tenant_id and m.user_id=auth.uid()
         and m.status='active' and m.role in ('owner','admin')))));

create or replace function public.crm_member_session_heartbeat(p_tenant_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_session uuid;v_role text;v_record public.crm_member_sessions%rowtype;
begin
 if auth.uid() is null or not private.crm_active_tenant_matches(p_tenant_id)
 then raise exception 'Active company required' using errcode='42501';end if;
 if (auth.jwt()->>'session_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 then raise exception 'Authenticated session required' using errcode='42501';end if;
 v_session:=(auth.jwt()->>'session_id')::uuid;
 select m.role into v_role from public.memberships m
 where m.tenant_id=p_tenant_id and m.user_id=auth.uid() and m.status='active';
 if v_role is null then raise exception 'Membership required' using errcode='42501';end if;
 insert into public.crm_member_sessions(tenant_id,user_id,auth_session_id,member_role)
 values(p_tenant_id,auth.uid(),v_session,v_role)
 on conflict(tenant_id,user_id,auth_session_id) do update
 set last_seen_at=now(),
     active_seconds=public.crm_member_sessions.active_seconds+
       case when public.crm_member_sessions.signed_out_at is not null then 0
            else least(75,greatest(0,extract(epoch from now()-public.crm_member_sessions.last_seen_at))::integer)
       end
 returning * into v_record;
 return jsonb_build_object('session_id',v_record.id,'active_seconds',v_record.active_seconds,
   'signed_in_at',v_record.signed_in_at,'last_seen_at',v_record.last_seen_at);
end;
$$;
revoke all on function public.crm_member_session_heartbeat(uuid) from public,anon,authenticated;
grant execute on function public.crm_member_session_heartbeat(uuid) to authenticated;

create or replace function public.crm_member_session_close(p_tenant_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
begin
 if auth.uid() is null then return;end if;
 update public.crm_member_sessions
 set signed_out_at=now()
 where tenant_id=p_tenant_id and user_id=auth.uid()
  and auth_session_id=case
       when (auth.jwt()->>'session_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       then (auth.jwt()->>'session_id')::uuid else null end
  and signed_out_at is null;
end;
$$;
revoke all on function public.crm_member_session_close(uuid) from public,anon,authenticated;
grant execute on function public.crm_member_session_close(uuid) to authenticated;

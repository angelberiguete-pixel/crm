-- Read-only login and presence report for current tenant owner/admin.
-- Last heartbeat is evidence of recent activity; expired tab != signed-out.
create or replace function public.crm_tenant_member_session_report(p_tenant_id uuid)
returns table (
 user_id uuid,member_email text,member_role text,
 signed_in_at timestamptz,last_seen_at timestamptz,
 active_seconds integer,signed_out_at timestamptz,is_online boolean
)
language plpgsql stable security definer set search_path=''
as $$
begin
 if auth.uid() is null or not private.crm_active_tenant_matches(p_tenant_id)
   or not exists(select 1 from public.memberships m
     where m.user_id=auth.uid() and m.tenant_id=p_tenant_id
       and m.status='active' and m.role in ('owner','admin'))
 then raise exception 'Only company owner/admin can inspect member sessions' using errcode='42501';end if;
 return query
 select s.user_id,u.email::text,s.member_role,s.signed_in_at,
   s.last_seen_at,s.active_seconds,s.signed_out_at,
   (s.signed_out_at is null and s.last_seen_at>=now()-interval '2 minutes')
 from public.crm_member_sessions s
 join auth.users u on u.id=s.user_id
 where s.tenant_id=p_tenant_id
 order by s.signed_in_at desc limit 500;
end;
$$;
revoke all on function public.crm_tenant_member_session_report(uuid) from public,anon,authenticated;
grant execute on function public.crm_tenant_member_session_report(uuid) to authenticated;

-- Defense in depth: all platform-only predicates must be false in a
-- client-view Supabase Auth session, including future owner-only RPCs.
create or replace function private.crm_is_platform_owner()
returns boolean language sql stable security definer set search_path=''
as $$
 select not private.crm_is_client_portal_locked()
   and exists(select 1 from public.platform_users pu
      where pu.user_id=auth.uid()
        and pu.platform_role='platform_owner' and pu.status='active');
$$;

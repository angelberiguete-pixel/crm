-- Even a user's own historical login activity belongs to the business
-- represented by the currently locked portal. Do not expose any other tenant
-- via a direct REST select while signed in to a customer account.
drop policy if exists crm_member_sessions_read on public.crm_member_sessions;
create policy crm_member_sessions_read on public.crm_member_sessions
for select to authenticated
using(
 private.crm_active_tenant_matches(tenant_id) and
 (
   (user_id=auth.uid() and exists(select 1 from public.memberships m
     where m.tenant_id=crm_member_sessions.tenant_id
       and m.user_id=auth.uid() and m.status='active'))
   or private.crm_is_platform_admin()
   or exists(select 1 from public.memberships m
     where m.tenant_id=crm_member_sessions.tenant_id
       and m.user_id=auth.uid() and m.status='active'
       and m.role in ('owner','admin'))
 )
);

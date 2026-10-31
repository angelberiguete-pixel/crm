-- Conversations assigned to a staff member cannot be edited by peers.
-- Staff can ONLY claim/release through tenant_assign_conversation() where the
-- verified AI handoff queue is checked. Shared unassigned IA chats are READ-only.
create or replace function private.crm_can_edit_conversation(p_tenant_id uuid,p_conversation_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
 select auth.uid() is not null and private.crm_active_tenant_matches(p_tenant_id)
   and (
     private.crm_is_platform_admin()
     or exists(select 1 from public.memberships m
       where m.tenant_id=p_tenant_id and m.user_id=auth.uid()
         and m.status='active' and m.role in ('owner','admin'))
     or exists(select 1 from public.memberships m
       join public.conversations c on c.tenant_id=m.tenant_id
       where m.tenant_id=p_tenant_id and m.user_id=auth.uid()
         and m.status='active' and m.role in ('manager','agent')
         and c.id=p_conversation_id and c.assigned_to=auth.uid())
   );
$$;
revoke all on function private.crm_can_edit_conversation(uuid,uuid) from public,anon,authenticated;

drop policy if exists conversations_update on public.conversations;
create policy conversations_update on public.conversations for update to authenticated
 using(private.crm_can_edit_conversation(tenant_id,id))
 with check(private.crm_can_edit_conversation(tenant_id,id));

drop policy if exists messages_update on public.messages;
create policy messages_update on public.messages for update to authenticated
 using(private.crm_can_edit_conversation(tenant_id,conversation_id))
 with check(private.crm_can_edit_conversation(tenant_id,conversation_id));

drop policy if exists conversations_delete on public.conversations;
create policy conversations_delete on public.conversations for delete to authenticated
 using(private.crm_active_tenant_matches(tenant_id) and (
   private.crm_is_platform_admin()
   or exists(select 1 from public.memberships m where m.tenant_id=conversations.tenant_id
      and m.user_id=auth.uid() and m.status='active' and m.role in ('owner','admin'))));

drop policy if exists messages_delete on public.messages;
create policy messages_delete on public.messages for delete to authenticated
 using(private.crm_active_tenant_matches(tenant_id) and (
   private.crm_is_platform_admin()
   or exists(select 1 from public.memberships m where m.tenant_id=messages.tenant_id
      and m.user_id=auth.uid() and m.status='active' and m.role in ('owner','admin'))));

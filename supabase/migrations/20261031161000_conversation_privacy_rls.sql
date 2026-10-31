-- Private conversations remain private at database level, not merely hidden by UI.
-- Everyone may see conversations managed by AI/unassigned for self-assignment.
-- After human assignment, only that seller and tenant owner/admin can read.
create or replace function private.crm_can_view_conversation(
 p_tenant_id uuid,p_assigned_to uuid)
returns boolean language sql stable security definer set search_path=''
as $$
 select private.crm_active_tenant_matches(p_tenant_id)
  and private.has_tenant_access(p_tenant_id)
  and (
    private.has_tenant_role(p_tenant_id,array['owner','admin']::text[])
    or p_assigned_to is null
    or p_assigned_to=(select auth.uid())
  );
$$;
revoke all on function private.crm_can_view_conversation(uuid,uuid)
 from public,anon,authenticated;

drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations
 for select to authenticated using (
   private.crm_can_view_conversation(tenant_id,assigned_to)
 );

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
 for select to authenticated using (
   private.has_tenant_access(tenant_id) and exists(
     select 1 from public.conversations c
     where c.tenant_id=messages.tenant_id
       and c.id=messages.conversation_id
       and private.crm_can_view_conversation(c.tenant_id,c.assigned_to)
   )
 );

drop policy if exists conversations_update on public.conversations;
create policy conversations_update on public.conversations
 for update to authenticated
 using (
   private.can_operate_crm(tenant_id)
   and private.crm_can_view_conversation(tenant_id,assigned_to)
 )
 with check (
   private.can_operate_crm(tenant_id)
   and private.crm_can_view_conversation(tenant_id,assigned_to)
 );
drop policy if exists conversations_insert on public.conversations;
create policy conversations_insert on public.conversations
 for insert to authenticated with check (
   private.can_operate_crm(tenant_id)
   and private.crm_active_tenant_matches(tenant_id)
   and (assigned_to is null or assigned_to=auth.uid()
        or private.has_tenant_role(tenant_id,array['owner','admin']::text[]))
 );
drop policy if exists conversations_delete on public.conversations;
create policy conversations_delete on public.conversations
 for delete to authenticated using (
   private.has_tenant_role(tenant_id,array['owner','admin']::text[])
   and private.crm_can_view_conversation(tenant_id,assigned_to)
 );

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
 for insert to authenticated with check (
   private.can_operate_crm(tenant_id)
   and exists(
     select 1 from public.conversations c
     where c.id=messages.conversation_id
       and c.tenant_id=messages.tenant_id
       and private.crm_can_view_conversation(c.tenant_id,c.assigned_to)
   )
 );
drop policy if exists messages_update on public.messages;
create policy messages_update on public.messages
 for update to authenticated
 using (
   private.can_operate_crm(tenant_id)
   and exists(select 1 from public.conversations c
     where c.id=messages.conversation_id and c.tenant_id=messages.tenant_id
       and private.crm_can_view_conversation(c.tenant_id,c.assigned_to))
 )
 with check (
   private.can_operate_crm(tenant_id)
   and exists(select 1 from public.conversations c
     where c.id=messages.conversation_id and c.tenant_id=messages.tenant_id
       and private.crm_can_view_conversation(c.tenant_id,c.assigned_to))
 );
drop policy if exists messages_delete on public.messages;
create policy messages_delete on public.messages
 for delete to authenticated using (
   private.has_tenant_role(tenant_id,array['owner','admin']::text[])
   and exists(select 1 from public.conversations c
     where c.id=messages.conversation_id and c.tenant_id=messages.tenant_id
       and private.crm_can_view_conversation(c.tenant_id,c.assigned_to))
 );

-- Prevent direct REST updates from silently changing another person's
-- assignment or conversation identity, even when RPCs are bypassed.
create or replace function private.crm_guard_non_supervisor_conversation_updates()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_user uuid;
begin
 if auth.role()='service_role'
   or private.has_tenant_role(new.tenant_id,array['owner','admin']::text[])
 then return new;end if;
 v_user:=auth.uid();
 if v_user is null or old.tenant_id<>new.tenant_id
 then raise exception 'Unauthorized conversation update' using errcode='42501';end if;
 if new.assigned_to is distinct from old.assigned_to and not (
   (old.assigned_to is null and new.assigned_to=v_user)
    or (old.assigned_to=v_user and new.assigned_to is null)
 )
 then raise exception 'Only owner/admin can assign another seller' using errcode='42501';end if;
 if old.assigned_to is null and (
   (to_jsonb(new)-'assigned_to'-'updated_at') is distinct from
   (to_jsonb(old)-'assigned_to'-'updated_at'))
 then raise exception 'Unassigned conversation must be claimed before editing' using errcode='42501';end if;
 if old.assigned_to is not null and old.assigned_to<>v_user
 then raise exception 'Another seller owns this conversation' using errcode='42501';end if;
 if (to_jsonb(new)-'assigned_to'-'updated_at'-'status'-'priority'-'unread_count')
    is distinct from
    (to_jsonb(old)-'assigned_to'-'updated_at'-'status'-'priority'-'unread_count')
 then raise exception 'Only supervisor can change conversation identity' using errcode='42501';end if;
 return new;
end;
$$;
drop trigger if exists crm_guard_non_supervisor_conversation_updates on public.conversations;
create trigger crm_guard_non_supervisor_conversation_updates
 before update on public.conversations
 for each row execute function private.crm_guard_non_supervisor_conversation_updates();

-- Harden both the supervisor assignment RPC and trigger to match owner/admin.
create or replace function public.tenant_assign_conversation(
 p_tenant_id uuid,p_conversation_id uuid,p_assignee uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_previous uuid;v_supervisor boolean;
begin
 if auth.uid() is null or not private.crm_active_tenant_matches(p_tenant_id)
   or not private.has_tenant_role(p_tenant_id,array['owner','admin','manager','agent']::text[])
 then raise exception 'Not permitted to assign' using errcode='42501';end if;
 v_supervisor:=private.has_tenant_role(p_tenant_id,array['owner','admin']::text[]);
 select c.assigned_to into v_previous
 from public.conversations c where c.id=p_conversation_id and c.tenant_id=p_tenant_id for update;
 if not found then raise exception 'Conversation not found' using errcode='22023';end if;
 if p_assignee is not null and not private.crm_valid_conversation_assignee(p_tenant_id,p_assignee)
 then raise exception 'Inactive seller' using errcode='22023';end if;
 if not v_supervisor then
   if p_assignee=auth.uid() and v_previous is null then null;
   elsif p_assignee is null and v_previous=auth.uid() then null;
   elsif p_assignee is not distinct from v_previous
     and (v_previous is null or v_previous=auth.uid()) then null;
   else raise exception 'No access to this assignment' using errcode='42501';end if;
 end if;
 if v_previous is distinct from p_assignee then
   update public.conversations c set assigned_to=p_assignee
   where c.tenant_id=p_tenant_id and c.id=p_conversation_id;
 end if;
 return jsonb_build_object('tenant_id',p_tenant_id,'conversation_id',p_conversation_id,
   'assigned_to',p_assignee,'changed',v_previous is distinct from p_assignee);
end;
$$;
revoke all on function public.tenant_assign_conversation(uuid,uuid,uuid) from public,anon;
grant execute on function public.tenant_assign_conversation(uuid,uuid,uuid) to authenticated;

-- Trigger is a second line of defense on direct table UPDATE/INSERT.
create or replace function private.crm_check_conversation_assignee()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_supervisor boolean;
begin
 if new.assigned_to is not null
   and not private.crm_valid_conversation_assignee(new.tenant_id,new.assigned_to)
 then raise exception 'The selected user is not an active seller' using errcode='23514';end if;
 if (tg_op='INSERT' and new.assigned_to is not null)
   or (tg_op='UPDATE' and old.assigned_to is distinct from new.assigned_to) then
   if auth.role() is distinct from 'service_role' then
     if auth.uid() is null or not private.crm_active_tenant_matches(new.tenant_id)
       or not private.has_tenant_role(new.tenant_id,array['owner','admin','manager','agent']::text[])
     then raise exception 'Not authorized to assign' using errcode='42501';end if;
     v_supervisor:=private.has_tenant_role(new.tenant_id,array['owner','admin']::text[]);
     if not v_supervisor and not (
       (tg_op='INSERT' and new.assigned_to=auth.uid())
       or (tg_op='UPDATE' and (
         (old.assigned_to is null and new.assigned_to=auth.uid())
         or (old.assigned_to=auth.uid() and new.assigned_to is null)))
     ) then raise exception 'Only owner/admin may reassign sellers' using errcode='42501';end if;
   end if;
 end if;
 return new;
end;
$$;

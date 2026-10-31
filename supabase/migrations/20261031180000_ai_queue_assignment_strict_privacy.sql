-- AI handoff is the ONLY unassigned inbox pool that regular staff can open.
-- Manager role can supervise pipeline, but private seller content is reserved
-- for explicit owner/admin memberships, or the assigned seller themself.

create or replace function private.crm_is_ai_handoff_queue(p_tenant_id uuid,p_conversation_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
 select exists(select 1 from public.conversations c
   where c.tenant_id=p_tenant_id and c.id=p_conversation_id
     and c.assigned_to is null
     and (c.metadata->>'routing_mode'='ai'
       or c.metadata->>'origin'='ai'
       or c.metadata->>'handled_by'='ai'));
$$;
revoke all on function private.crm_is_ai_handoff_queue(uuid,uuid) from public,anon,authenticated;

create or replace function private.crm_can_view_conversation(p_tenant_id uuid,p_conversation_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
 select auth.uid() is not null and private.crm_active_tenant_matches(p_tenant_id)
 and (
   private.crm_is_platform_admin()
   or exists(select 1 from public.memberships m where m.tenant_id=p_tenant_id
     and m.user_id=auth.uid() and m.status='active' and m.role in ('owner','admin'))
   or exists(select 1 from public.memberships m join public.conversations c
     on c.tenant_id=m.tenant_id where m.tenant_id=p_tenant_id
       and m.user_id=auth.uid() and m.status='active'
       and m.role in ('agent','manager') and c.id=p_conversation_id
       and (c.assigned_to=auth.uid()
         or private.crm_is_ai_handoff_queue(p_tenant_id,p_conversation_id)))
 );
$$;

create or replace function private.crm_can_insert_conversation_message(
 p_tenant_id uuid,p_conversation_id uuid,p_sender_user_id uuid,
 p_direction text,p_sender_type text)
returns boolean language sql stable security definer set search_path=''
as $$
 select private.crm_active_tenant_matches(p_tenant_id) and (
   private.crm_is_platform_admin()
   or exists(select 1 from public.memberships m where m.tenant_id=p_tenant_id
     and m.user_id=auth.uid() and m.status='active' and m.role in ('owner','admin'))
   or (p_direction='outbound' and p_sender_type='user'
     and p_sender_user_id=auth.uid()
     and exists(select 1 from public.memberships m join public.conversations c
       on c.tenant_id=m.tenant_id where m.tenant_id=p_tenant_id
         and m.user_id=auth.uid() and m.status='active'
         and m.role in ('agent','manager') and c.id=p_conversation_id
         and c.assigned_to=auth.uid()))
 );
$$;

-- Security trigger protects even a direct REST PATCH/INSERT, independent of UI.
create or replace function private.crm_check_conversation_assignee()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_supervisor boolean;v_ai_pool boolean;
begin
 if new.assigned_to is not null
   and not private.crm_valid_conversation_assignee(new.tenant_id,new.assigned_to)
 then raise exception 'El vendedor no está activo en esta empresa' using errcode='23514';end if;

 if (tg_op='INSERT' and new.assigned_to is not null)
   or (tg_op='UPDATE' and old.assigned_to is distinct from new.assigned_to)
 then
  if auth.role() is distinct from 'service_role' then
   if auth.uid() is null or not private.crm_active_tenant_matches(new.tenant_id)
     or not private.has_tenant_role(new.tenant_id,
       array['owner','admin','manager','agent']::text[])
   then raise exception 'No autorizado para asignar conversaciones' using errcode='42501';end if;
   v_supervisor:=private.has_tenant_role(new.tenant_id,array['owner','admin']::text[]);
   if not v_supervisor then
    v_ai_pool:=false;
    if tg_op='UPDATE' then
      v_ai_pool:=(old.assigned_to is null and
        (old.metadata->>'routing_mode'='ai' or old.metadata->>'origin'='ai'
          or old.metadata->>'handled_by'='ai'));
    end if;
    if not(
     (tg_op='INSERT' and new.assigned_to=auth.uid())
     or (tg_op='UPDATE' and (
       (v_ai_pool and new.assigned_to=auth.uid())
       or (old.assigned_to=auth.uid() and new.assigned_to is null)
     ))
    ) then raise exception 'Solo puedes tomar conversaciones de IA disponibles o gestionar tus propias conversaciones' using errcode='42501';end if;
   end if;
  end if;
 end if;
 return new;
end;
$$;

-- SECURITY DEFINER assignment RPC must not disclose other sellers' UUIDs
-- or permit claiming a hidden, unassigned non-AI conversation by guessing ID.
create or replace function public.tenant_assign_conversation(
 p_tenant_id uuid,p_conversation_id uuid,p_assignee uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_previous uuid;v_supervisor boolean;v_ai boolean;
begin
 if auth.uid() is null or not private.crm_active_tenant_matches(p_tenant_id)
   or not private.has_tenant_role(p_tenant_id,array['owner','admin','manager','agent']::text[])
 then raise exception 'No tienes permiso para asignar conversaciones' using errcode='42501';end if;
 v_supervisor:=private.has_tenant_role(p_tenant_id,array['owner','admin']::text[]);
 select c.assigned_to,
   (c.assigned_to is null and (c.metadata->>'routing_mode'='ai'
      or c.metadata->>'origin'='ai' or c.metadata->>'handled_by'='ai'))
 into v_previous,v_ai from public.conversations c
 where c.id=p_conversation_id and c.tenant_id=p_tenant_id for update;
 if not found then raise exception 'Conversación no disponible' using errcode='42501';end if;
 if not v_supervisor and v_previous is distinct from auth.uid() and not coalesce(v_ai,false)
 then raise exception 'Conversación de otro vendedor: acceso denegado' using errcode='42501';end if;
 if p_assignee is not null and not private.crm_valid_conversation_assignee(p_tenant_id,p_assignee)
 then raise exception 'El vendedor no está activo en esta empresa' using errcode='22023';end if;
 if not v_supervisor then
   if p_assignee=auth.uid() and v_ai then null;
   elsif p_assignee is null and v_previous=auth.uid() then null;
   elsif p_assignee is not distinct from v_previous then null;
   else raise exception 'Solo puedes tomar la cola IA o liberar tu conversación' using errcode='42501';end if;
 end if;
 if v_previous is distinct from p_assignee then
   update public.conversations set assigned_to=p_assignee
   where id=p_conversation_id and tenant_id=p_tenant_id;
 end if;
 return jsonb_build_object('tenant_id',p_tenant_id,'conversation_id',p_conversation_id,
   'assigned_to',p_assignee,'changed',v_previous is distinct from p_assignee);
end;
$$;

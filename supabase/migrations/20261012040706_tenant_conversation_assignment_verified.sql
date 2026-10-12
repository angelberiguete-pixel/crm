-- Applied 20261012040706 to ygipjqgyreeahslzorik. Team conversation assignment.
-- Assignee always belongs to this tenant and is an active commercial member.
alter table public.conversations add constraint conversations_assignee_same_tenant_fk
  foreign key (tenant_id,assigned_to) references public.memberships(tenant_id,user_id) not valid;
alter table public.conversations validate constraint conversations_assignee_same_tenant_fk;

CREATE OR REPLACE FUNCTION private.crm_audit_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 insert into public.audit_logs (tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
 values (new.tenant_id,auth.uid(),'conversation.assignee_changed','conversation',new.id,
   jsonb_build_object('before',old.assigned_to,'after',new.assigned_to));
 return new;
end $function$
;

CREATE OR REPLACE FUNCTION private.crm_check_conversation_assignee()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if new.assigned_to is not null and not private.crm_valid_conversation_assignee(new.tenant_id,new.assigned_to) then
   raise exception 'La persona seleccionada no tiene acceso de ventas activo a esta empresa' using errcode='23514';
 end if;
 return new;
end $function$
;

CREATE OR REPLACE FUNCTION private.crm_valid_conversation_assignee(p_tenant_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.memberships m
    where m.tenant_id=p_tenant_id and m.user_id=p_user_id and m.status='active'
      and (
        m.role in ('owner','admin','manager')
        or (m.role='agent' and exists(
           select 1 from public.tenant_role_bindings b
           join public.tenant_roles r on r.id=b.role_id and r.tenant_id=b.tenant_id
           where b.tenant_id=m.tenant_id and b.user_id=m.user_id and r.role_key='sales'))
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.tenant_assign_conversation(p_tenant_id uuid, p_conversation_id uuid, p_assignee uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_previous uuid;v_manager boolean;
begin
 if auth.uid() is null or not private.crm_active_tenant_matches(p_tenant_id)
 or not private.has_tenant_role(p_tenant_id,array['owner','admin','manager','agent']::text[])
 then raise exception 'No tienes permiso para asignar conversaciones' using errcode='42501';end if;
 v_manager:=private.has_tenant_role(p_tenant_id,array['owner','admin','manager']::text[]);
 select c.assigned_to into v_previous from public.conversations c
 where c.id=p_conversation_id and c.tenant_id=p_tenant_id for update;
 if not found then raise exception 'La conversación no existe en la empresa activa' using errcode='22023';end if;
 if p_assignee is not null and not private.crm_valid_conversation_assignee(p_tenant_id,p_assignee)
 then raise exception 'El vendedor no está activo en esta empresa' using errcode='22023';end if;
 if not v_manager then
   if p_assignee=auth.uid() and v_previous is null then null; -- tomar conversación libre
   elsif p_assignee is null and v_previous=auth.uid() then null; -- devolver al equipo
   elsif p_assignee is not distinct from v_previous then null; -- sin cambios
   else raise exception 'Solo un supervisor puede asignar a otro vendedor' using errcode='42501';
   end if;
 end if;
 if v_previous is distinct from p_assignee then
   update public.conversations c set assigned_to=p_assignee
   where c.id=p_conversation_id and c.tenant_id=p_tenant_id;
 end if;
 return jsonb_build_object('tenant_id',p_tenant_id,'conversation_id',p_conversation_id,
   'assigned_to',p_assignee,'changed',v_previous is distinct from p_assignee);
end $function$
;

CREATE OR REPLACE FUNCTION public.tenant_inbox_assignees(p_tenant_id uuid)
 RETURNS TABLE(user_id uuid, display_name text, team_role text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if auth.uid() is null
   or not private.crm_active_tenant_matches(p_tenant_id)
   or not private.has_tenant_role(p_tenant_id,array['owner','admin','manager','agent']::text[])
 then raise exception 'No tienes acceso a las asignaciones de esta empresa' using errcode='42501';end if;
 return query
 select m.user_id,
   coalesce(nullif(btrim(u.raw_user_meta_data->>'full_name'),''),
     nullif(btrim(u.raw_user_meta_data->>'name'),''),u.email,m.user_id::text),
   case when m.role='agent' then 'Vendedor'
   when m.role='owner' then 'Propietario'
   when m.role='manager' then 'Gerente'
   when m.role='admin' then 'Administrador'
   else 'Personal' end
 from public.memberships m join auth.users u on u.id=m.user_id
 where m.tenant_id=p_tenant_id and private.crm_valid_conversation_assignee(p_tenant_id,m.user_id)
 order by m.role,m.user_id;
end $function$
;
drop trigger if exists crm_check_conversation_assignee on public.conversations;
create trigger crm_check_conversation_assignee before insert or update of assigned_to,tenant_id on public.conversations for each row execute function private.crm_check_conversation_assignee();
drop trigger if exists crm_audit_assignment on public.conversations;
create trigger crm_audit_assignment after update of assigned_to on public.conversations for each row when (old.assigned_to is distinct from new.assigned_to) execute function private.crm_audit_assignment();
revoke all on function public.tenant_inbox_assignees(uuid) from public,anon;
grant execute on function public.tenant_inbox_assignees(uuid) to authenticated;
revoke all on function public.tenant_assign_conversation(uuid,uuid,uuid) from public,anon;
grant execute on function public.tenant_assign_conversation(uuid,uuid,uuid) to authenticated;

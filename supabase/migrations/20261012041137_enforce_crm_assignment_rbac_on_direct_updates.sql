-- Applied to Supabase. Reject unauthorized direct PostgREST reassignment, not only RPC.
CREATE OR REPLACE FUNCTION private.crm_check_conversation_assignee()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_supervisor boolean;
begin
 if new.assigned_to is not null
    and not private.crm_valid_conversation_assignee(new.tenant_id,new.assigned_to) then
   raise exception 'La persona seleccionada no tiene acceso de ventas activo a esta empresa' using errcode='23514';
 end if;
 if (tg_op='INSERT' and new.assigned_to is not null)
   or (tg_op='UPDATE' and old.assigned_to is distinct from new.assigned_to) then
   -- Trusted external integrations can assign via service_role; all normal user
   -- updates are subject to exactly the same rules as the RPC.
   if auth.role() is distinct from 'service_role' then
     if auth.uid() is null
       or not private.crm_active_tenant_matches(new.tenant_id)
       or not private.has_tenant_role(new.tenant_id,array['owner','admin','manager','agent']::text[])
     then raise exception 'No autorizado para asignar conversaciones' using errcode='42501'; end if;
     v_supervisor:=private.has_tenant_role(new.tenant_id,array['owner','admin','manager']::text[]);
     if not v_supervisor and not (
       (tg_op='INSERT' and new.assigned_to=auth.uid())
       or (tg_op='UPDATE' and (
         (old.assigned_to is null and new.assigned_to=auth.uid())
         or (old.assigned_to=auth.uid() and new.assigned_to is null)
       ))
     ) then
       raise exception 'Solo un supervisor puede asignar a otra persona' using errcode='42501';
     end if;
   end if;
 end if;
 return new;
end $function$
;

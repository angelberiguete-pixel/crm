-- IA routing flags are trusted server/administrator state, not editable by
-- sellers. Otherwise a seller could relabel and release a private conversation
-- into the shared AI queue, exposing its history to colleagues.
create or replace function private.crm_protect_ai_routing_flags()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if tg_op='UPDATE' and auth.uid() is not null and
   (coalesce(old.metadata,'{}'::jsonb)->>'routing_mode'
        is distinct from coalesce(new.metadata,'{}'::jsonb)->>'routing_mode'
    or coalesce(old.metadata,'{}'::jsonb)->>'origin'
        is distinct from coalesce(new.metadata,'{}'::jsonb)->>'origin'
    or coalesce(old.metadata,'{}'::jsonb)->>'handled_by'
        is distinct from coalesce(new.metadata,'{}'::jsonb)->>'handled_by')
   and auth.role() is distinct from 'service_role'
   and not private.crm_is_platform_admin()
   and not exists(select 1 from public.memberships m
     where m.tenant_id=new.tenant_id and m.user_id=auth.uid()
       and m.status='active' and m.role in ('owner','admin'))
 then raise exception 'Only the company administration can change AI routing' using errcode='42501';end if;
 return new;
end;
$$;
drop trigger if exists crm_ai_routing_flags_guard on public.conversations;
create trigger crm_ai_routing_flags_guard
 before update of metadata on public.conversations
 for each row execute function private.crm_protect_ai_routing_flags();

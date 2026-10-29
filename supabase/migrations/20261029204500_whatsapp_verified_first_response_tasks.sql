-- For a newly received, verified WhatsApp conversation, schedule exactly one
-- INTERNAL follow-up task. This never sends a Meta message or uses paid AI.
create unique index if not exists tasks_whatsapp_first_response_once
on public.tasks (tenant_id,(metadata->>'source_conversation_id'))
where source='automation' and (metadata->>'origin')='verified_whatsapp_inbound';

create or replace function public.whatsapp_schedule_first_response()
returns trigger language plpgsql security invoker set search_path=''
as $$
declare v_contact uuid;
begin
 if NEW.direction <> 'inbound' or NEW.message_type <> 'text'
    or NEW.metadata->>'provider' <> 'whatsapp' then
   return NEW;
 end if;
 -- Only true Meta receipts can schedule this workflow.
 if not exists (
   select 1 from public.meta_whatsapp_inbound_receipts r
   where r.tenant_id=NEW.tenant_id
     and r.external_message_id=NEW.external_message_id
     and r.phone_number_id=NEW.metadata->>'phone_number_id'
 ) then return NEW; end if;

 select c.contact_id into v_contact from public.conversations c
 where c.id=NEW.conversation_id and c.tenant_id=NEW.tenant_id;
 insert into public.tasks(
   tenant_id,contact_id,title,description,status,priority,due_at,source,metadata)
 values(
   NEW.tenant_id,v_contact,
   'Responder consulta recibida por WhatsApp',
   'Revisar la conversación, confirmar intención y realizar seguimiento humano autorizado.',
   'todo','normal',now()+interval '2 hours','automation',
   pg_catalog.jsonb_build_object('origin','verified_whatsapp_inbound',
     'source_conversation_id',NEW.conversation_id::text,'requires_human',true))
 on conflict do nothing;
 return NEW;
end;
$$;
revoke all on function public.whatsapp_schedule_first_response() from public,anon,authenticated;
drop trigger if exists whatsapp_first_response_on_new_message on public.messages;
create trigger whatsapp_first_response_on_new_message
after insert on public.messages
for each row execute function public.whatsapp_schedule_first_response();

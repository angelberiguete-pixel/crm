-- Applied to Empresia Supabase: 20261109110824.
-- Privacy URL is mandatory whenever public patient request portal is enabled.
alter table public.cita24_portal_configs
  add column if not exists privacy_url text,
  add column if not exists reminder_template_name text,
  add column if not exists reminder_template_language text not null default 'es';
alter table public.cita24_portal_configs
  add constraint cita24_privacy_required_for_public
  check (not enabled or privacy_url ~ '^https://[^[:space:]<>]{6,300}$'),
  add constraint cita24_template_format
  check (reminder_template_name is null or reminder_template_name ~ '^[a-z0-9_]{1,120}$'),
  add constraint cita24_template_language_format
  check (reminder_template_language ~ '^[a-z]{2}(_[A-Z]{2})?$');

create table if not exists public.cita24_reminder_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  appointment_id uuid not null,
  contact_id uuid not null,
  due_at timestamptz not null,
  status text not null default 'queued'
    check (status in ('queued','processing','submitted','failed','uncertain','cancelled')),
  external_message_id text,
  attempts integer not null default 0,
  provider_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cita24_reminder_unique unique(tenant_id,appointment_id),
  constraint cita24_reminder_appointment_fk
    foreign key(tenant_id,appointment_id)
    references public.calendar_events(tenant_id,id) on delete cascade,
  constraint cita24_reminder_contact_fk
    foreign key(tenant_id,contact_id)
    references public.contacts(tenant_id,id) on delete cascade
);
create index if not exists cita24_reminder_due_idx on
 public.cita24_reminder_outbox(status,due_at) where status='queued';
alter table public.cita24_reminder_outbox enable row level security;
revoke all on public.cita24_reminder_outbox from anon,authenticated;
grant select on public.cita24_reminder_outbox to authenticated;
create policy cita24_reminders_select on public.cita24_reminder_outbox
 for select to authenticated using(private.has_tenant_access(tenant_id));

create or replace function private.cita24_queue_reminder() returns trigger
language plpgsql security definer set search_path=''
as $$
declare v_enabled boolean; v_opt_in boolean; v_verified boolean;
begin
 if new.metadata->>'module' is distinct from 'cita24' then return new; end if;
 if new.status<>'scheduled' or new.contact_id is null or new.starts_at<=now() then
   update public.cita24_reminder_outbox set status='cancelled',updated_at=now()
    where tenant_id=new.tenant_id and appointment_id=new.id and status='queued';
   return new;
 end if;
 select c.whatsapp_reminders_enabled and c.reminder_template_name is not null
 into v_enabled from public.cita24_portal_configs c where c.tenant_id=new.tenant_id;
 if not coalesce(v_enabled,false) then return new; end if;
 select coalesce(c.metadata->>'cita24_whatsapp_admin_consent','false')='true'
  and coalesce(c.metadata->>'cita24_whatsapp_opted_out','false')<>'true'
 into v_opt_in from public.contacts c
 where c.tenant_id=new.tenant_id and c.id=new.contact_id;
 if not coalesce(v_opt_in,false) then return new; end if;
 select exists(
   select 1 from public.ycloud_whatsapp_routes r
   join public.channels ch on ch.tenant_id=r.tenant_id and ch.id=r.channel_id
   where r.tenant_id=new.tenant_id and r.is_enabled and r.verified_at is not null
     and ch.provider='whatsapp' and ch.status='connected'
 ) into v_verified;
 if not v_verified then return new; end if;
 insert into public.cita24_reminder_outbox(tenant_id,appointment_id,contact_id,due_at)
 values(new.tenant_id,new.id,new.contact_id,
   greatest(now(),new.starts_at-interval '24 hours'))
 on conflict(tenant_id,appointment_id)
 do update set due_at=excluded.due_at,contact_id=excluded.contact_id,updated_at=now()
   where cita24_reminder_outbox.status='queued';
 return new;
end $$;
revoke all on function private.cita24_queue_reminder() from public,anon,authenticated;
drop trigger if exists cita24_reminder_appointment_change on public.calendar_events;
create trigger cita24_reminder_appointment_change
 after insert or update of starts_at,ends_at,status,contact_id,metadata
 on public.calendar_events for each row
 execute function private.cita24_queue_reminder();

revoke update on public.cita24_visit_requests from authenticated;
grant update(status,updated_at) on public.cita24_visit_requests to authenticated;

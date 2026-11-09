-- Applied to main Empresia Supabase 2026-11-09.
-- Only rows marked metadata.module = 'cita24' are restricted.
-- The pilot intentionally uses ONE agenda per company; multi-provider schedules
-- will require a resource/provider dimension and a separate migration.
create extension if not exists btree_gist with schema extensions;

alter table public.calendar_events
  add constraint cita24_nonzero_duration
  check (
    metadata->>'module' is distinct from 'cita24'
    or ends_at > starts_at
  );

alter table public.calendar_events
  add constraint cita24_single_agenda_no_overlap
  exclude using gist (
    tenant_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
  where (status = 'scheduled' and metadata->>'module' = 'cita24');

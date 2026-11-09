-- Store sender preferences for the tenant; this does not connect Gmail or enable sending.
-- No mailbox tokens, passwords, keys, message bodies or Gmail API credentials are stored.
create table if not exists public.marketing_email_sender_preferences (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  display_name text not null default 'Ángel Berigüete' check (char_length(trim(display_name)) between 2 and 100),
  outreach_address text not null check (outreach_address ~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'),
  personal_followup_address text not null check (personal_followup_address ~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'),
  mass_mail_provider text not null default 'brevo' check (mass_mail_provider='brevo'),
  delivery_status text not null default 'not_connected' check (delivery_status='not_connected'),
  sends_enabled boolean not null default false check (sends_enabled=false),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.marketing_email_sender_preferences enable row level security;
revoke all on public.marketing_email_sender_preferences from public,anon,authenticated;
grant select on public.marketing_email_sender_preferences to authenticated;
drop policy if exists marketing_email_sender_admin_read on public.marketing_email_sender_preferences;
create policy marketing_email_sender_admin_read
  on public.marketing_email_sender_preferences for select to authenticated
  using (private.crm_is_tenant_admin(tenant_id));
comment on table public.marketing_email_sender_preferences is
  'Administrative email identities only. Verified Gmail connector access in ChatGPT does not authorize this CRM to send.';

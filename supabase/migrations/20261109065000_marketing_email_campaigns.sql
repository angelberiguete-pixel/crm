-- CRM email marketing: tenant-safe campaign drafts, consent audit and provider event ledger.
-- No sending function, public tracking pixel or live provider connection is installed by this migration.
-- The source-of-truth for contacts remains public.contacts; no imported list is copied.

create table if not exists public.marketing_email_campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 3 and 120),
  subject text not null check (char_length(btrim(subject)) between 3 and 180),
  preview_text text not null default '' check (char_length(preview_text) <= 240),
  body_text text not null check (char_length(btrim(body_text)) between 20 and 15000),
  status text not null default 'draft' check (status in ('draft','queued','sending','sent','paused','cancelled')),
  provider text not null default 'brevo' check (provider='brevo'),
  provider_campaign_id text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status='draft' and provider_campaign_id is null) or status<>'draft')
);
create index if not exists marketing_email_campaigns_tenant_created
 on public.marketing_email_campaigns(tenant_id,created_at desc);
alter table public.marketing_email_campaigns enable row level security;
revoke all on public.marketing_email_campaigns from public,anon,authenticated;
grant select,insert,update on public.marketing_email_campaigns to authenticated;
drop policy if exists marketing_email_campaign_admin_read on public.marketing_email_campaigns;
create policy marketing_email_campaign_admin_read on public.marketing_email_campaigns
 for select to authenticated using (private.crm_is_tenant_admin(tenant_id));
drop policy if exists marketing_email_campaign_admin_create on public.marketing_email_campaigns;
create policy marketing_email_campaign_admin_create on public.marketing_email_campaigns
 for insert to authenticated with check (
   private.crm_is_tenant_admin(tenant_id) and created_by=auth.uid()
   and status='draft' and provider_campaign_id is null
 );
drop policy if exists marketing_email_campaign_admin_edit_drafts on public.marketing_email_campaigns;
create policy marketing_email_campaign_admin_edit_drafts on public.marketing_email_campaigns
 for update to authenticated using (
   private.crm_is_tenant_admin(tenant_id) and status='draft'
 ) with check (
   private.crm_is_tenant_admin(tenant_id) and status='draft'
   and provider_campaign_id is null
 );
-- Important: immutable attribution via trigger, even if an admin edits someone else's draft.
create or replace function private.crm_email_keep_campaign_identity()
returns trigger language plpgsql set search_path='' as $$
begin
  if old.tenant_id is distinct from new.tenant_id
    or old.created_by is distinct from new.created_by
    or old.id is distinct from new.id then
    raise exception 'Campaign identity cannot be changed' using errcode='42501';
  end if;
  new.updated_at=now();
  return new;
end;
$$;
drop trigger if exists crm_email_campaign_identity on public.marketing_email_campaigns;
create trigger crm_email_campaign_identity before update on public.marketing_email_campaigns
 for each row execute function private.crm_email_keep_campaign_identity();

create table if not exists public.marketing_email_consents (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  status text not null default 'unknown'
    check (status in ('unknown','opted_in','opted_out','bounced','complained')),
  source text not null default '' check (char_length(source)<=200),
  evidence text not null default '' check (char_length(evidence)<=1000),
  verified_at timestamptz,
  recorded_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key(tenant_id,contact_id),
  check (status<>'opted_in' or
    (char_length(btrim(source))>=3 and char_length(btrim(evidence))>=8
      and verified_at is not null))
);
alter table public.marketing_email_consents enable row level security;
revoke all on public.marketing_email_consents from public,anon,authenticated;
grant select,insert,update on public.marketing_email_consents to authenticated;
drop policy if exists marketing_email_consent_admin_read on public.marketing_email_consents;
create policy marketing_email_consent_admin_read on public.marketing_email_consents
 for select to authenticated using(private.crm_is_tenant_admin(tenant_id));
drop policy if exists marketing_email_consent_admin_create on public.marketing_email_consents;
create policy marketing_email_consent_admin_create on public.marketing_email_consents
 for insert to authenticated with check(private.crm_is_tenant_admin(tenant_id));
drop policy if exists marketing_email_consent_admin_update on public.marketing_email_consents;
create policy marketing_email_consent_admin_update on public.marketing_email_consents
 for update to authenticated using(private.crm_is_tenant_admin(tenant_id))
 with check(private.crm_is_tenant_admin(tenant_id));
create or replace function private.crm_email_validate_consent_contact()
returns trigger language plpgsql set search_path='' as $$
begin
 if not exists(select 1 from public.contacts c
   where c.id=new.contact_id and c.tenant_id=new.tenant_id) then
   raise exception 'Contact does not belong to this company' using errcode='42501';
 end if;
 if tg_op='UPDATE' and (old.tenant_id is distinct from new.tenant_id
  or old.contact_id is distinct from new.contact_id) then
   raise exception 'Consent identity cannot be changed' using errcode='42501';
 end if;
 new.updated_at=now();
 return new;
end;
$$;
drop trigger if exists crm_email_validate_consent on public.marketing_email_consents;
create trigger crm_email_validate_consent before insert or update on public.marketing_email_consents
 for each row execute function private.crm_email_validate_consent_contact();

-- Only a verified provider server integration may write this table. UI shows real events only.
create table if not exists public.marketing_email_events (
 id bigint generated always as identity primary key,
 tenant_id uuid not null references public.tenants(id) on delete cascade,
 campaign_id uuid not null references public.marketing_email_campaigns(id) on delete cascade,
 contact_id uuid references public.contacts(id) on delete set null,
 provider_event_id text,
 event_type text not null check(event_type in (
  'sent','delivered','opened','clicked','bounced','complained','unsubscribed','replied'
 )),
 occurred_at timestamptz not null,
 received_at timestamptz not null default now(),
 unique(tenant_id,provider_event_id)
);
create or replace function private.crm_email_validate_provider_event()
returns trigger language plpgsql set search_path='' as $
begin
 if not exists (select 1 from public.marketing_email_campaigns c
   where c.id=new.campaign_id and c.tenant_id=new.tenant_id) then
   raise exception 'Event campaign does not belong to this company' using errcode='42501';
 end if;
 if new.contact_id is not null and not exists (
   select 1 from public.contacts c where c.id=new.contact_id and c.tenant_id=new.tenant_id
 ) then raise exception 'Event contact does not belong to this company' using errcode='42501'; end if;
 if tg_op='UPDATE' then
   raise exception 'Provider events are append-only' using errcode='42501';
 end if;
 return new;
end;
$;
drop trigger if exists crm_email_validate_event on public.marketing_email_events;
create trigger crm_email_validate_event before insert or update on public.marketing_email_events
 for each row execute function private.crm_email_validate_provider_event();
revoke all on function private.crm_email_validate_provider_event() from public,anon,authenticated;

create index if not exists marketing_email_events_tenant_campaign
 on public.marketing_email_events(tenant_id,campaign_id,occurred_at desc);
alter table public.marketing_email_events enable row level security;
revoke all on public.marketing_email_events from public,anon,authenticated;

create or replace function public.marketing_email_overview(p_tenant_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
begin
 if auth.uid() is null or not private.crm_is_tenant_admin(p_tenant_id) then
   raise exception 'Not permitted' using errcode='42501';
 end if;
 return jsonb_build_object(
   'tenant_id',p_tenant_id,
   'contacts',(select count(*) from public.contacts c where c.tenant_id=p_tenant_id),
   'with_email',(select count(*) from public.contacts c
     where c.tenant_id=p_tenant_id and c.email ~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'),
   'opted_in',(select count(*) from public.marketing_email_consents s
     join public.contacts c on c.id=s.contact_id and c.tenant_id=s.tenant_id
     where s.tenant_id=p_tenant_id and s.status='opted_in'
       and c.email ~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'),
   'suppressed',(select count(*) from public.marketing_email_consents
     where tenant_id=p_tenant_id and status in ('opted_out','bounced','complained')),
   'draft_campaigns',(select count(*) from public.marketing_email_campaigns
     where tenant_id=p_tenant_id and status='draft'),
   'sent',(select count(*) from public.marketing_email_events where tenant_id=p_tenant_id and event_type='sent'),
   'delivered',(select count(*) from public.marketing_email_events where tenant_id=p_tenant_id and event_type='delivered'),
   'opened',(select count(*) from public.marketing_email_events where tenant_id=p_tenant_id and event_type='opened'),
   'clicked',(select count(*) from public.marketing_email_events where tenant_id=p_tenant_id and event_type='clicked'),
   'bounced',(select count(*) from public.marketing_email_events where tenant_id=p_tenant_id and event_type='bounced'),
   'replied',(select count(*) from public.marketing_email_events where tenant_id=p_tenant_id and event_type='replied'),
   'provider_connected',false,
   'sending_enabled',false
 );
end;
$$;
revoke all on function public.marketing_email_overview(uuid) from public,anon,authenticated;
grant execute on function public.marketing_email_overview(uuid) to authenticated;

revoke all on function private.crm_email_keep_campaign_identity() from public,anon,authenticated;
revoke all on function private.crm_email_validate_consent_contact() from public,anon,authenticated;

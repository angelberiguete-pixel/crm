-- Family Power: dual-line inbound voice scaffold. NO carrier link, keys, calls, or AI spend.
-- The provider can write only after the signed server receiver + a VERIFIED enabled route.
create table if not exists public.voice_line_routes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  line_kind text not null check (line_kind in ('fixed','mobile')),
  operator_name text not null default 'unknown'
    check (operator_name in ('unknown','claro','altice','other')),
  business_phone_e164 text
    check (business_phone_e164 is null or business_phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  provider text not null default 'retell' check (provider = 'retell'),
  provider_destination_e164 text
    check (provider_destination_e164 is null or provider_destination_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  provider_agent_id text
    check (provider_agent_id is null or provider_agent_id ~ '^agent_[a-zA-Z0-9_-]{6,128}$'),
  verified_at timestamptz,
  verified_reference text
    check (verified_reference is null or length(verified_reference) between 8 and 200),
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint voice_line_routes_tenant_slot_unique unique (tenant_id,line_kind),
  constraint voice_line_routes_tenant_id_id_unique unique (tenant_id,id),
  constraint voice_line_routes_live_requires_verification check (
    not enabled or (
      business_phone_e164 is not null and provider_destination_e164 is not null
      and provider_agent_id is not null and verified_at is not null
      and verified_reference is not null and operator_name <> 'unknown'
    )
  )
);
create unique index if not exists voice_line_routes_provider_destination_unique
 on public.voice_line_routes(provider,provider_destination_e164)
 where provider_destination_e164 is not null;
create unique index if not exists voice_line_routes_business_number_unique
 on public.voice_line_routes(business_phone_e164)
 where business_phone_e164 is not null;
alter table public.voice_line_routes enable row level security;
revoke all on public.voice_line_routes from PUBLIC,anon,authenticated;
grant select on public.voice_line_routes to authenticated;
grant select,insert,update,delete on public.voice_line_routes to service_role;
drop policy if exists voice_line_routes_admin_read on public.voice_line_routes;
create policy voice_line_routes_admin_read on public.voice_line_routes
 for select to authenticated using (
   (select auth.uid()) is not null and private.crm_is_tenant_admin(tenant_id)
 );

create table if not exists public.voice_calls (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  route_id uuid not null,
  provider text not null default 'retell' check (provider='retell'),
  external_call_id text not null check (external_call_id ~ '^call_[a-zA-Z0-9_-]{6,128}$'),
  direction text not null check (direction='inbound'),
  from_number_e164 text not null check (from_number_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  to_number_e164 text not null check (to_number_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  contact_id uuid,
  review_task_id uuid,
  summary text check (summary is null or length(summary) <= 2000),
  status text not null default 'needs_human_review'
    check (status in ('needs_human_review','reviewed')),
  created_at timestamptz not null default now(),
  constraint voice_calls_unique_provider_call unique (provider,external_call_id),
  constraint voice_calls_tenant_route_fk foreign key (tenant_id,route_id)
    references public.voice_line_routes(tenant_id,id) on delete cascade,
  constraint voice_calls_tenant_contact_fk foreign key (tenant_id,contact_id)
    references public.contacts(tenant_id,id) on delete set null,
  constraint voice_calls_tenant_task_fk foreign key (tenant_id,review_task_id)
    references public.tasks(tenant_id,id) on delete set null
);
create index if not exists voice_calls_tenant_recent on public.voice_calls(tenant_id,created_at desc);
create index if not exists voice_calls_contact_recent on public.voice_calls(tenant_id,contact_id,created_at desc);
alter table public.voice_calls enable row level security;
revoke all on public.voice_calls from PUBLIC,anon,authenticated;
grant select on public.voice_calls to authenticated;
grant select,insert,update,delete on public.voice_calls to service_role;
drop policy if exists voice_calls_admin_read on public.voice_calls;
create policy voice_calls_admin_read on public.voice_calls
 for select to authenticated using (
   (select auth.uid()) is not null and private.crm_is_tenant_admin(tenant_id)
 );

-- Two placeholders, NEVER enabled; mapping to Claro or Altice is still unknown.
insert into public.voice_line_routes(tenant_id,line_kind)
select t.id,v.kind
from public.tenants t cross join (values('fixed'),('mobile')) as v(kind)
where t.slug='family-power'
on conflict (tenant_id,line_kind) do nothing;

-- Atomic ingest after SDK-equivalent signature verification by the server.
-- SECURITY INVOKER and service_role-only EXECUTE; not callable by web clients.
create or replace function public.ingest_verified_retell_voice_call(
  p_call_id text,p_from_number text,p_to_number text,
  p_agent_id text,p_summary text
) returns text
language plpgsql security invoker set search_path=''
as $$
declare
  v_route record;
  v_contact_id uuid;
  v_call_id uuid;
  v_task_id uuid;
begin
  if p_call_id is null or p_call_id !~ '^call_[a-zA-Z0-9_-]{6,128}$'
    or p_from_number is null or p_from_number !~ '^\+[1-9][0-9]{7,14}$'
    or p_to_number is null or p_to_number !~ '^\+[1-9][0-9]{7,14}$'
    or p_agent_id is null or p_agent_id !~ '^agent_[a-zA-Z0-9_-]{6,128}$'
    or (p_summary is not null and length(p_summary)>2000)
  then return 'invalid_event'; end if;

  select r.id,r.tenant_id,r.line_kind into v_route
  from public.voice_line_routes r
  join public.tenants t on t.id=r.tenant_id and t.status='active'
  where r.provider='retell' and r.provider_destination_e164=p_to_number
    and r.provider_agent_id=p_agent_id and r.enabled=true and r.verified_at is not null
    and r.business_phone_e164 is not null
  limit 1;
  if v_route.id is null then return 'unverified_route'; end if;

  -- Prevent duplicate retries and cross-tenant caller record merging.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('voice:'||p_call_id,0));
  if exists(select 1 from public.voice_calls
    where provider='retell' and external_call_id=p_call_id)
  then return 'duplicate'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_route.tenant_id::text||':'||p_from_number,0));
  select c.id into v_contact_id from public.contacts c
  where c.tenant_id=v_route.tenant_id
    and (c.phone=p_from_number or c.whatsapp_phone=p_from_number)
  order by c.created_at limit 1;
  if v_contact_id is null then
    insert into public.contacts(
      tenant_id,display_name,phone,source,status,metadata)
    values(
      v_route.tenant_id,'Contacto por llamada',p_from_number,'phone','lead',
      pg_catalog.jsonb_build_object(
        'source','retell_verified_voice_webhook',
        'name_confirmed',false,'outbound_consent','not_verified'))
    returning id into v_contact_id;
  end if;

  insert into public.voice_calls(
    tenant_id,route_id,provider,external_call_id,direction,
    from_number_e164,to_number_e164,contact_id,summary)
  values(
    v_route.tenant_id,v_route.id,'retell',p_call_id,'inbound',
    p_from_number,p_to_number,v_contact_id,nullif(btrim(p_summary),''))
  returning id into v_call_id;

  -- Leave as PENDING, never perform calls or mark tasks done.
  insert into public.tasks(
    tenant_id,contact_id,title,description,status,priority,due_at,source,metadata)
  values(
    v_route.tenant_id,v_contact_id,'Revisar llamada recibida',
    'Llamada de voz con IA: revisar la solicitud y comprobar si requiere seguimiento humano.',
    'todo','normal',now()+interval '2 hours','automation',
    pg_catalog.jsonb_build_object('origin','verified_retell_voice_call',
      'voice_call_id',v_call_id::text,'line_kind',v_route.line_kind,
      'requires_human',true,'outbound_consent','not_verified'))
  returning id into v_task_id;

  update public.voice_calls
    set review_task_id=v_task_id where id=v_call_id;
  return 'stored';
end;
$$;
revoke all on function public.ingest_verified_retell_voice_call(
  text,text,text,text,text) from PUBLIC,anon,authenticated;
grant execute on function public.ingest_verified_retell_voice_call(
  text,text,text,text,text) to service_role;
comment on function public.ingest_verified_retell_voice_call(
  text,text,text,text,text) is
  'Only after server verifies signed Retell webhook. Verified disabled-by-default DID+agent route, atomic dedupe, tenant-safe contact and HUMAN review task. No calls sent.';

-- No automatically exposed recordings, transcripts or model-generated prices.

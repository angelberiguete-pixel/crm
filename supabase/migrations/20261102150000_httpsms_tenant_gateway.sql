-- httpSMS provider adapter. No live route is created or enabled by this migration.
-- Routes are provisioned only by trusted server operations after line ownership verification.
create table if not exists public.sms_gateway_routes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  channel_id uuid not null,
  provider text not null default 'httpsms' check (provider = 'httpsms'),
  sender_e164 text not null unique check (sender_e164 ~ '^\\+[1-9][0-9]{7,14}$'),
  enabled boolean not null default false,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, channel_id),
  foreign key (tenant_id, channel_id)
    references public.channels(tenant_id, id) on delete cascade,
  constraint sms_gateway_enabled_verified check (not enabled or verified_at is not null)
);
alter table public.sms_gateway_routes enable row level security;
revoke all on public.sms_gateway_routes from public, anon, authenticated;
comment on table public.sms_gateway_routes is
  'Server provisioned verified Android SMS sender-to-tenant mapping. Never store httpSMS secrets here.';

create table if not exists public.sms_gateway_webhook_receipts (
  event_id text primary key check (length(event_id) between 1 and 200),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  event_type text not null,
  provider_message_id text,
  processed boolean not null default false,
  received_at timestamptz not null default now()
);
create index if not exists sms_gateway_receipts_tenant_idx
  on public.sms_gateway_webhook_receipts(tenant_id, received_at desc);
alter table public.sms_gateway_webhook_receipts enable row level security;
revoke all on public.sms_gateway_webhook_receipts from public, anon, authenticated;

-- A human request ID may only be charged once within an SMS conversation.
create unique index if not exists sms_gateway_manual_send_once
  on public.messages (tenant_id, conversation_id, (metadata->>'client_request_id'))
  where direction='outbound' and metadata->>'provider'='httpsms'
    and metadata ? 'client_request_id';

-- Narrow status summary; does not return credentials or webhook signing keys.
create or replace function public.tenant_sms_gateway_status(p_tenant_id uuid)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_route record;
begin
  if auth.uid() is null or p_tenant_id is null
    or not private.crm_active_tenant_matches(p_tenant_id)
    or not private.is_tenant_admin(p_tenant_id)
  then raise exception 'tenant_admin_required' using errcode='42501'; end if;
  select r.sender_e164,r.enabled,r.verified_at,c.status as channel_status
    into v_route from public.sms_gateway_routes r
    join public.channels c on c.tenant_id=r.tenant_id and c.id=r.channel_id
    where r.tenant_id=p_tenant_id and c.provider='sms'
    order by r.created_at desc limit 1;
  return jsonb_build_object(
    'tenant_id',p_tenant_id,
    'configured',v_route.sender_e164 is not null,
    'enabled',coalesce(v_route.enabled,false) and
      v_route.verified_at is not null and v_route.channel_status='connected',
    'sender_masked',case when v_route.sender_e164 is null then null
      else left(v_route.sender_e164,4)||'••••'||right(v_route.sender_e164,4) end
  );
end;
$$;
revoke all on function public.tenant_sms_gateway_status(uuid) from public,anon,authenticated;
grant execute on function public.tenant_sms_gateway_status(uuid) to authenticated;
comment on function public.tenant_sms_gateway_status(uuid) is
  'Tenant admin read-only httpSMS readiness snapshot; does not verify live carrier delivery.';

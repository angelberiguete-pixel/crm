-- Capture the name a Family Power lead explicitly supplies in a VERIFIED inbound WhatsApp message.
-- Existing signed Meta/YCloud ingest functions already auto-create a tenant-scoped contact.
-- Do not trust WhatsApp profile names as a verified identity and do not generate outbound replies.
-- No route is currently enabled for Family Power; trigger is inert until a provider is verified.
create or replace function private.fp_name_from_verified_whatsapp_message()
returns trigger language plpgsql security definer set search_path to ''
as $fn$
declare
  v_match text[];
  v_name text;
begin
  if new.direction <> 'inbound' or new.sender_type <> 'contact'
     or new.sender_contact_id is null or new.external_message_id is null
     or new.metadata->>'provider' <> 'whatsapp'
     or not exists (
       select 1 from public.tenants t
       where t.id=new.tenant_id and t.slug='family-power' and t.status='active'
     )
  then return new; end if;

  -- An actual receipt from the signed provider receiver must belong to the
  -- same tenant AND conversation channel; never trust browser/body tenant IDs.
  if not exists (
    select 1 from public.conversations cv
    join public.meta_whatsapp_inbound_receipts r
      on r.tenant_id=cv.tenant_id and r.channel_id=cv.channel_id
    where cv.tenant_id=new.tenant_id and cv.id=new.conversation_id
      and r.external_message_id=new.external_message_id
  ) and not exists (
    select 1 from public.conversations cv
    join public.ycloud_whatsapp_inbound_receipts r
      on r.tenant_id=cv.tenant_id and r.channel_id=cv.channel_id
    where cv.tenant_id=new.tenant_id and cv.id=new.conversation_id
      and r.external_message_id=new.external_message_id
  ) then return new; end if;

  -- Only explicit, short self-identification is accepted.
  -- Examples: "Me llamo Ana María", "Mi nombre es José Pérez".
  -- A greeting, an ad text, a phone profile name, or random free text
  -- must never be recorded as a verified name.
  v_match:=regexp_match(btrim(coalesce(new.body,'')),
    '^(me llamo|mi nombre es)[[:space:]]+(.{2,85})[[:space:]]*$', 'i');
  if v_match is null then return new; end if;
  v_name:=btrim(regexp_replace(btrim(v_match[2]), '[.!?]+$', ''));
  if length(v_name) not between 2 and 80
     or v_name !~ '^[[:alpha:]À-ÿ][[:alpha:]À-ÿ .''-]*$'
     or lower(v_name) in ('un cliente','un asesor','cliente','hola','interesado','una persona')
  then return new; end if;

  update public.contacts c
  set display_name=v_name,
      metadata=coalesce(c.metadata,'{}'::jsonb) ||
        pg_catalog.jsonb_build_object(
          'name_source','self_reported_whatsapp',
          'name_confirmed_at',pg_catalog.to_char(pg_catalog.now(),'YYYY-MM-DD"T"HH24:MI:SSOF')
        )
  where c.id=new.sender_contact_id and c.tenant_id=new.tenant_id
    and c.source='whatsapp'
    and coalesce(c.metadata->>'name_source','') not in ('self_reported_whatsapp','manual_verified');
  return new;
end;
$fn$;

revoke all on function private.fp_name_from_verified_whatsapp_message() from public,anon,authenticated;
drop trigger if exists fp_name_from_verified_whatsapp_message on public.messages;
create trigger fp_name_from_verified_whatsapp_message
  after insert on public.messages for each row
  execute function private.fp_name_from_verified_whatsapp_message();

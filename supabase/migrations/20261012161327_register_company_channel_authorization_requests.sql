-- Supabase migration applied 20261012161327.
-- Register *requests*, never live credentials, tokens or fictitious provider connections.

CREATE OR REPLACE FUNCTION private.crm_channels_enforce_verified_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.status='connected' and (tg_op='INSERT' or old.status is distinct from 'connected')
    and coalesce(auth.role(),'')<>'service_role'
  then
    raise exception 'Solo una integración verificada del servidor puede activar un canal' using errcode='42501';
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.tenant_register_channel_request(p_tenant_id uuid, p_provider text, p_channel_name text, p_identifier text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_identifier text;
  v_name text;
  v_channel_id uuid;
begin
  if auth.uid() is null or not private.crm_active_tenant_matches(p_tenant_id)
    or not private.can_manage_crm(p_tenant_id)
  then raise exception 'Solo un responsable autorizado puede preparar canales de esta empresa' using errcode='42501'; end if;

  v_name:=btrim(coalesce(p_channel_name,''));
  v_identifier:=btrim(coalesce(p_identifier,''));
  if length(v_name)<2 or length(v_name)>90 then
    raise exception 'El nombre del canal debe tener entre 2 y 90 caracteres' using errcode='22023';
  end if;

  if p_provider='whatsapp' then
    v_identifier:=regexp_replace(v_identifier,'[[:space:]()-]','','g');
    if v_identifier !~ '^\+[1-9][0-9]{7,14}$' then
      raise exception 'Indica el WhatsApp con código de país, por ejemplo +18296480491' using errcode='22023';end if;
  elsif p_provider='instagram' then
    v_identifier:=lower(ltrim(v_identifier,'@'));
    if v_identifier !~ '^[a-z0-9_.]{1,30}$' or v_identifier like '%.%' and
      (v_identifier like '.%' or v_identifier like '%.' or v_identifier like '%..%') then
      raise exception 'Indica un usuario de Instagram válido' using errcode='22023';end if;
  elsif p_provider='email' then
    v_identifier:=lower(v_identifier);
    if length(v_identifier)>254 or v_identifier !~ '^[a-z0-9._%+\-]+@[a-z0-9.-]+\.[a-z]{2,}$' then
      raise exception 'Indica una dirección de correo válida' using errcode='22023';end if;
  else
    raise exception 'Proveedor no admitido para este proceso' using errcode='22023';
  end if;

  if exists (
    select 1 from public.channels c where c.tenant_id=p_tenant_id
    and c.provider=p_provider
    and lower(c.settings->>'request_identifier')=lower(v_identifier)
  ) then
    raise exception 'Esta cuenta ya tiene una solicitud en la empresa' using errcode='23505';
  end if;

  insert into public.channels(tenant_id,provider,name,status,external_account_id,created_by,settings)
  values(p_tenant_id,p_provider,v_name,'disconnected',null,auth.uid(),
     jsonb_build_object('request_identifier',v_identifier,
      'onboarding_stage','pending_provider_authorization','connection_verified',false))
  returning id into v_channel_id;

  insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
  values(p_tenant_id,auth.uid(),'channel.connection_requested','channel',v_channel_id,
    jsonb_build_object('provider',p_provider,'status','pending_provider_authorization'));

  return v_channel_id;
end $function$
;

drop trigger if exists crm_channels_enforce_verified_status on public.channels;
create trigger crm_channels_enforce_verified_status before insert or update of status on public.channels
for each row execute function private.crm_channels_enforce_verified_status();
revoke all on function public.tenant_register_channel_request(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.tenant_register_channel_request(uuid,text,text,text) to authenticated;

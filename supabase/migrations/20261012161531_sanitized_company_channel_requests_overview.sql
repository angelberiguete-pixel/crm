-- Sanitized company-channel overview, no connector secrets and no browser access to channels.settings.
CREATE OR REPLACE FUNCTION public.tenant_channel_requests_overview(p_tenant_id uuid)
 RETURNS TABLE(channel_id uuid, provider text, display_name text, request_identifier text, record_status text, request_stage text, requested_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null or not private.crm_active_tenant_matches(p_tenant_id)
    or not private.can_manage_crm(p_tenant_id)
  then raise exception 'No tienes permiso para consultar los canales de esta empresa' using errcode='42501';end if;
  return query
  select c.id,c.provider,c.name,
    case when c.settings->>'onboarding_stage'='pending_provider_authorization'
      then nullif(c.settings->>'request_identifier','')
      else null end,
    c.status,
    case when c.settings->>'onboarding_stage'='pending_provider_authorization'
      then 'Pendiente de autorización'
      when c.status='connected' then 'Registrado como conectado; falta comprobación real'
      else 'Sin autorización comprobada' end,
    c.created_at
  from public.channels c where c.tenant_id=p_tenant_id
  and c.provider in ('whatsapp','instagram','email')
  order by c.created_at desc;
end $function$
;
revoke all on function public.tenant_channel_requests_overview(uuid) from public,anon,authenticated;
grant execute on function public.tenant_channel_requests_overview(uuid) to authenticated;

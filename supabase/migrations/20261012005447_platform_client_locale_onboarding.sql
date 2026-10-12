-- Step toward no-code onboarding: explicit client country, currency, locale and timezone.
-- Existing tenant settings and current financial values are preserved.
alter table public.tenant_settings
  add column country_code text
  check (country_code ~ '^[A-Z]{2}$');

create function public.platform_update_client_locale(
  p_tenant_id uuid,p_country_code text,p_currency text,p_timezone text,p_locale text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_country text:=upper(btrim(coalesce(p_country_code,'')));
        v_currency text:=upper(btrim(coalesce(p_currency,'')));
        v_timezone text:=btrim(coalesce(p_timezone,''));
        v_locale text:=btrim(coalesce(p_locale,''));
        old_data jsonb;
        new_data jsonb;
begin
  if auth.uid() is null or not private.is_platform_admin()
  then raise exception 'Solo Platform Admin puede configurar la región' using errcode='42501'; end if;
  if p_tenant_id is null or not exists (select 1 from public.tenants where id=p_tenant_id)
  then raise exception 'Cliente no encontrado' using errcode='22023'; end if;
  if v_country !~ '^[A-Z]{2}$' or v_currency !~ '^[A-Z]{3}$'
  then raise exception 'País de dos letras y moneda de tres letras obligatorios' using errcode='22023'; end if;
  if v_locale !~ '^[a-z]{2,3}-[A-Z]{2}$'
  then raise exception 'Locale inválido, usa es-DO o en-US' using errcode='22023'; end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name=v_timezone)
  then raise exception 'Zona horaria IANA inválida' using errcode='22023'; end if;
  select jsonb_build_object('country_code',country_code,'currency',currency,'timezone',timezone,'locale',locale)
  into old_data from public.tenant_settings where tenant_id=p_tenant_id;
  insert into public.tenant_settings(tenant_id,country_code,currency,timezone,locale)
    values (p_tenant_id,v_country,v_currency,v_timezone,v_locale)
  on conflict(tenant_id) do update set
    country_code=excluded.country_code,
    currency=excluded.currency,
    timezone=excluded.timezone,
    locale=excluded.locale,
    updated_at=now();
  new_data:=jsonb_build_object('country_code',v_country,'currency',v_currency,'timezone',v_timezone,'locale',v_locale);
  insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
    values(p_tenant_id,auth.uid(),'platform.client_region_updated','tenant_settings',p_tenant_id,
      jsonb_build_object('previous',coalesce(old_data,'{}'::jsonb),'current',new_data));
  return new_data;
end $$;
revoke all on function public.platform_update_client_locale(uuid,text,text,text,text) from public,anon;
grant execute on function public.platform_update_client_locale(uuid,text,text,text,text) to authenticated;

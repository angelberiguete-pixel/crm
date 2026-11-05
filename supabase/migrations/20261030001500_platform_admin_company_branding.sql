-- Only the global platform administrator can list client branding.
-- No customer contact details or credentials are exposed.
create or replace function public.platform_admin_company_branding()
returns table (tenant_id uuid, brand_name text, logo_url text, dark_logo_url text)
language plpgsql stable security definer set search_path=''
as $$
begin
  if auth.uid() is null or not private.crm_is_platform_admin() then
    raise exception 'platform_admin_only' using errcode='42501';
  end if;
  return query
  select t.id,coalesce(s.brand_name,t.name),s.logo_url,
    coalesce(s.settings->'branding'->>'logo_on_dark_url',s.logo_url)
  from public.tenants t
  left join public.tenant_settings s on s.tenant_id=t.id;
end;
$$;
revoke all on function public.platform_admin_company_branding() from public,anon,authenticated;
grant execute on function public.platform_admin_company_branding() to authenticated;
comment on function public.platform_admin_company_branding() is
  'Global platform admin only. Minimal per-tenant branding for company cards; returns no contacts or secrets.';

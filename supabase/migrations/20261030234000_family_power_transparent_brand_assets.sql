-- Derived transparent SVG variants preserve the official Family Power logo paths.
-- Limit the update to the previously verified source URLs and previously
-- authorized digital brand usage; never overwrite a later client customization.
update public.tenant_settings s
set logo_url = '/client-brands/family-power/logo-negativo-sin-fondo.svg',
    settings = pg_catalog.jsonb_set(
      pg_catalog.jsonb_set(s.settings,'{branding,logo_on_dark_url}',
        pg_catalog.to_jsonb('/client-brands/family-power/logo-negativo-sin-fondo.svg'::text),true),
      '{branding,logo_on_light_url}',
      pg_catalog.to_jsonb('/client-brands/family-power/logo-color-sin-fondo.svg'::text),true),
    updated_at = now()
where s.tenant_id=(select t.id from public.tenants t where t.slug='family-power')
  and s.logo_url='/client-brands/family-power/logo-negativo.svg'
  and s.settings #>> '{branding,approval}' = 'digital_usage_authorized';

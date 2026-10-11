create or replace function public.platform_update_tenant_settings(
  p_tenant_id uuid,
  p_brand_name text default null,
  p_support_email text default null,
  p_primary_color text default null,
  p_hide_platform_branding boolean default null
)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if not private.is_platform_admin() then raise exception 'Platform admin requerido'; end if;

  insert into public.tenant_settings(
    tenant_id,brand_name,support_email,primary_color,hide_platform_branding
  )
  values(
    p_tenant_id,
    nullif(trim(p_brand_name),''),
    nullif(trim(p_support_email),''),
    coalesce(nullif(trim(p_primary_color),''),'#2563EB'),
    coalesce(p_hide_platform_branding,false)
  )
  on conflict (tenant_id) do update set
    brand_name=coalesce(excluded.brand_name,public.tenant_settings.brand_name),
    support_email=coalesce(excluded.support_email,public.tenant_settings.support_email),
    primary_color=coalesce(excluded.primary_color,public.tenant_settings.primary_color),
    hide_platform_branding=coalesce(p_hide_platform_branding,public.tenant_settings.hide_platform_branding),
    updated_at=now();
end;
$$;

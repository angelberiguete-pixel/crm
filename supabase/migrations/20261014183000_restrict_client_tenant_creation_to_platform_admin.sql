-- Platform owner creates client companies; members cannot self-provision tenants.
-- Backend authorization is required, hiding the onboarding button is insufficient.
create or replace function public.create_tenant(p_name text,p_slug text)
returns uuid language plpgsql security invoker set search_path='' as $$
begin
  if auth.uid() is null or not private.crm_is_platform_admin() then
    raise exception 'Solo el administrador de plataforma puede crear empresas cliente' using errcode='42501';
  end if;
  return private.create_tenant_impl(p_name,p_slug);
end $$;
revoke all on function public.create_tenant(text,text) from public,anon;
grant execute on function public.create_tenant(text,text) to authenticated;

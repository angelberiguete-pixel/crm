-- Family Power: authorize tenant_settings writes only for the platform proprietor
-- while retaining the ordinary tenant admin rules for other client workspaces.
-- Important: NOT EXISTS on tenants can fail open under RLS. Use COALESCE(false)
-- when tenant identity is invisible, so callers never bypass the company lock.
-- This applies to INSERT as well as UPDATE (and preserves SELECT separately).
drop policy if exists tenant_settings_update on public.tenant_settings;
create policy tenant_settings_update on public.tenant_settings
 for update to authenticated
 using (
   private.is_tenant_admin(tenant_id)
   and (
     private.crm_is_platform_admin()
     or coalesce((select t.slug <> 'family-power' from public.tenants t
         where t.id=tenant_id),false)
   )
 )
 with check (
   private.is_tenant_admin(tenant_id)
   and (
     private.crm_is_platform_admin()
     or coalesce((select t.slug <> 'family-power' from public.tenants t
         where t.id=tenant_id),false)
   )
 );
drop policy if exists tenant_settings_insert on public.tenant_settings;
create policy tenant_settings_insert on public.tenant_settings
 for insert to authenticated
 with check (
   private.is_tenant_admin(tenant_id)
   and (
     private.crm_is_platform_admin()
     or coalesce((select t.slug <> 'family-power' from public.tenants t
         where t.id=tenant_id),false)
   )
 );
comment on policy tenant_settings_update on public.tenant_settings is
 'Family Power settings: platform admin only, including in locked portal; other tenant admins unchanged';

-- REVIEW REQUIRED / NOT APPLIED: enforce Family Power brand settings as platform-only.
-- The client-specific condition is narrow; other tenants retain the previous RLS predicate.
drop policy if exists tenant_settings_update on public.tenant_settings;
create policy tenant_settings_update on public.tenant_settings
for update to authenticated
using (
 private.is_tenant_admin(tenant_id)
 and (
  not exists(select 1 from public.tenants t where t.id=tenant_id and t.slug='family-power')
  or private.crm_is_platform_admin()
 )
)
with check (
 private.is_tenant_admin(tenant_id)
 and (
  not exists(select 1 from public.tenants t where t.id=tenant_id and t.slug='family-power')
  or private.crm_is_platform_admin()
 )
);

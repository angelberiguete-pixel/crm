grant execute on function private.is_platform_admin() to authenticated;
grant execute on function private.crm_is_platform_admin() to authenticated;
grant execute on function private.crm_is_tenant_admin(uuid) to authenticated;
grant execute on function private.crm_is_tenant_member(uuid) to authenticated;
revoke execute on function private.is_platform_admin(), private.crm_is_platform_admin(), private.crm_is_tenant_admin(uuid), private.crm_is_tenant_member(uuid) from anon;

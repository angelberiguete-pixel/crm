-- Restore the narrow grant required by memberships_select.
grant execute on function private.crm_active_tenant_matches(uuid) to authenticated;
revoke execute on function private.crm_active_tenant_matches(uuid) from anon;

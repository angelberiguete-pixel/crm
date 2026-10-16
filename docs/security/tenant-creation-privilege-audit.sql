-- Read-only security gate for tenant creation; never reads client records.
-- Expected after hardening: internal_admin_guard=true and public_admin_guard=true.
SELECT p.oid::regprocedure::text AS function_signature,
       p.prosecdef AS security_definer,
       has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
       pg_get_functiondef(p.oid) ~* 'private[.]crm_is_platform_admin[[:space:]]*[(]' AS internal_admin_guard
FROM pg_proc AS p
WHERE p.oid IN (
  'private.create_tenant_impl(text,text)'::regprocedure,
  'public.create_tenant(text,text)'::regprocedure
)
ORDER BY function_signature;

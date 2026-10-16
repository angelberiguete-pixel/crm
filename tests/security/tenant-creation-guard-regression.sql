-- Regression gate: privileged tenant creation must enforce authorization internally.
-- Run against a disposable Supabase branch, never as a production data test.
-- This test is read-only and fails until the security fix is deployed.
DO $$
DECLARE
  definition text;
  is_definer boolean;
  can_authenticated_execute boolean;
BEGIN
  SELECT pg_get_functiondef(p.oid), p.prosecdef,
         has_function_privilege('authenticated', p.oid, 'EXECUTE')
    INTO definition, is_definer, can_authenticated_execute
    FROM pg_proc p
   WHERE p.oid = to_regprocedure('private.create_tenant_impl(text,text)');
  IF definition IS NULL THEN
    RAISE EXCEPTION 'Missing private.create_tenant_impl(text,text)';
  END IF;
  IF NOT is_definer THEN
    RAISE EXCEPTION 'Expected SECURITY DEFINER implementation; review architecture';
  END IF;
  IF can_authenticated_execute AND
     definition !~* 'crm_is_platform_admin[[:space:]]*\\(' THEN
    RAISE EXCEPTION 'SECURITY FAILURE: authenticated can execute privileged tenant creation without an internal admin guard';
  END IF;
END $$;
-- Authorization behavior (seller denied / owner allowed) and tenant A/B isolation
-- require a disposable DB with synthetic identities; do not simulate with real JWTs.

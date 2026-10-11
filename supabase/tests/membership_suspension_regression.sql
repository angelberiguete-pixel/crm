-- LOOK SOCIAL MEDIA CRM | P0 regression (isolated Supabase test database ONLY)
-- This test MUST NOT be executed against the production project.
-- It uses an existing disposable non-owner fixture and rolls back its changes.
-- Passing this test does not replace tenant A/B and API-level RLS/RBAC E2E checks.
BEGIN;
DO $regression$
DECLARE
  v_membership uuid;
  v_user uuid;
  v_tenant uuid;
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF current_setting('app.crm_isolated_test', true) IS DISTINCT FROM 'yes' THEN
    RAISE EXCEPTION 'Refusing membership mutation: set app.crm_isolated_test=yes only in isolated test DB';
  END IF;
  SELECT m.id, m.user_id, m.tenant_id
    INTO v_membership, v_user, v_tenant
  FROM public.memberships m
  JOIN public.tenant_role_bindings b ON b.tenant_id=m.tenant_id AND b.user_id=m.user_id
  JOIN public.tenant_roles r ON r.id=b.role_id AND r.tenant_id=m.tenant_id
  WHERE m.status='active' AND m.role <> 'owner'
    AND r.permissions <> '{}'::jsonb
    AND NOT EXISTS (
      SELECT 1 FROM public.platform_users pu
      WHERE pu.user_id=m.user_id AND pu.status='active'
        AND pu.platform_role IN ('platform_owner','platform_admin')
    )
  LIMIT 1;
  IF v_membership IS NULL THEN
    RAISE EXCEPTION 'No disposable non-owner membership fixture; create one in isolated DB';
  END IF;
  PERFORM set_config('request.jwt.claim.sub',v_user::text,true);
  v_before := public.tenant_current_permissions(v_tenant);
  IF v_before='{}'::jsonb THEN
    RAISE EXCEPTION 'FAIL: active member permissions unexpectedly empty';
  END IF;
  UPDATE public.memberships SET status='suspended' WHERE id=v_membership;
  v_after := public.tenant_current_permissions(v_tenant);
  IF v_after <> '{}'::jsonb THEN
    RAISE EXCEPTION 'FAIL: suspended member retains permissions';
  END IF;
  RAISE NOTICE 'PASS: active member permissions revoked on suspension';
END
$regression$;
ROLLBACK;

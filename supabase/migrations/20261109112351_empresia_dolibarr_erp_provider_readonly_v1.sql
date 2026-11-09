-- Applied to the Empresia primary Supabase project as migration 20261109112351.
-- Additive: no modification of existing ERP connection records or invoices.
ALTER TABLE public.erp_connections
  DROP CONSTRAINT IF EXISTS erp_connections_provider_check;

ALTER TABLE public.erp_connections
  ADD CONSTRAINT erp_connections_provider_check
  CHECK (provider IN ('odoo', 'dolibarr'));

-- Keep legacy tenant_erp_status unchanged (Odoo-only).
CREATE OR REPLACE VIEW public.tenant_dolibarr_status
WITH (security_invoker = true) AS
SELECT
  e.tenant_id,
  e.id AS connection_id,
  e.provider,
  e.status,
  e.sync_direction,
  e.last_healthcheck_at
FROM public.erp_connections e
WHERE e.provider = 'dolibarr';

REVOKE ALL ON public.tenant_dolibarr_status FROM PUBLIC, anon;
GRANT SELECT ON public.tenant_dolibarr_status TO authenticated;

COMMENT ON VIEW public.tenant_dolibarr_status IS
  'RLS-invoker status of Dolibarr connections only; excludes base URL, credential reference, and secrets.';

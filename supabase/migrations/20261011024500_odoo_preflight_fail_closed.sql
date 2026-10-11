-- P0: An Odoo connection must never become authoritative or "connected"
-- from a browser-only URL registration. Preflight proof is server-owned.
-- No existing tenant, ERP mapping, or credential is created or changed.
CREATE OR REPLACE FUNCTION private.enforce_erp_connection_preflight()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $guard$
DECLARE
  v_server boolean := coalesce(auth.role(), '') = 'service_role';
  v_url_changed boolean := false;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_url_changed := NEW.base_url IS DISTINCT FROM OLD.base_url
                  OR NEW.database_name IS DISTINCT FROM OLD.database_name;
    IF v_url_changed THEN
      NEW.status := 'disconnected';
      NEW.last_healthcheck_at := NULL;
      NEW.sync_settings := coalesce(NEW.sync_settings, '{}'::jsonb) - 'preflight';
    END IF;
  END IF;

  IF NOT v_server THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.status = 'connected' OR NEW.credential_ref IS NOT NULL
         OR NEW.last_healthcheck_at IS NOT NULL
         OR NEW.sync_settings ? 'preflight' THEN
        RAISE EXCEPTION 'Odoo preflight: only the trusted server may verify a connection';
      END IF;
    ELSE
      IF (NEW.status = 'connected' AND OLD.status IS DISTINCT FROM 'connected')
         OR NEW.credential_ref IS DISTINCT FROM OLD.credential_ref
         OR (NEW.last_healthcheck_at IS DISTINCT FROM OLD.last_healthcheck_at
             AND NEW.last_healthcheck_at IS NOT NULL)
         OR (NEW.sync_settings->'preflight' IS DISTINCT FROM OLD.sync_settings->'preflight'
             AND NEW.sync_settings ? 'preflight') THEN
        RAISE EXCEPTION 'Odoo preflight: connection verification requires the trusted server';
      END IF;
    END IF;
  END IF;

  IF NEW.status = 'connected'
     AND (nullif(btrim(NEW.credential_ref), '') IS NULL
          OR NEW.last_healthcheck_at IS NULL
          OR NEW.sync_settings #>> '{preflight,status}' IS DISTINCT FROM 'passed') THEN
    RAISE EXCEPTION 'Odoo preflight: verified credentials and healthcheck required';
  END IF;
  RETURN NEW;
END;
$guard$;

REVOKE ALL ON FUNCTION private.enforce_erp_connection_preflight() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS erp_connections_preflight_guard ON public.erp_connections;
CREATE TRIGGER erp_connections_preflight_guard
BEFORE INSERT OR UPDATE ON public.erp_connections
FOR EACH ROW EXECUTE FUNCTION private.enforce_erp_connection_preflight();

CREATE OR REPLACE FUNCTION public.configure_tenant_odoo_authority(p_tenant_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $authority$
DECLARE
  v_connection_id uuid;
BEGIN
  IF NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Platform admin requerido';
  END IF;
  SELECT id INTO v_connection_id
    FROM public.erp_connections
   WHERE tenant_id = p_tenant_id
     AND provider = 'odoo'
     AND status = 'connected'
     AND nullif(btrim(credential_ref), '') IS NOT NULL
     AND last_healthcheck_at >= now() - interval '24 hours'
     AND sync_settings #>> '{preflight,status}' = 'passed'
   ORDER BY created_at
   LIMIT 1;
  IF v_connection_id IS NULL THEN
    RAISE EXCEPTION 'Odoo no verificado: completa credenciales, preflight y healthcheck antes de activar fuente oficial';
  END IF;
  UPDATE public.erp_connections
     SET sync_direction = 'bidirectional',
         sync_settings = coalesce(sync_settings, '{}'::jsonb) || jsonb_build_object(
           'source_of_truth', jsonb_build_object(
             'products','odoo','inventory','odoo','quotations','odoo',
             'quotation_pdf','odoo','sales_orders','odoo','invoices','odoo'
           ),
           'crm_responsibilities', jsonb_build_array(
             'leads','contacts','conversations','pipeline','followups','production','deliveries'
           ),
           'public_catalog', jsonb_build_object(
             'enabled',true,'stock_source','products.stock_snapshot',
             'freshness_source','products.stock_synced_at'
           )
         ),
         updated_at = now()
   WHERE id = v_connection_id;
  RETURN v_connection_id;
END;
$authority$;
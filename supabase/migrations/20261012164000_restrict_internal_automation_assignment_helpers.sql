-- CRM seguridad multi-tenant: cerrar llamadas directas a helpers SECURITY DEFINER.
-- No cambiar el código de los helpers ni los triggers; solo restringir EXECUTE.
-- Los triggers y RPC que delegan en ellos son SECURITY DEFINER y mantienen
-- el permiso a través del dueño de la función (postgres).

-- Vulnerabilidad reproducida: authenticated invocaba este helper para insertar
-- un automation_event con tenant_id arbitrario sin ser miembro de ese tenant.
revoke execute on function private.enqueue_automation_event(
  uuid,text,text,uuid,jsonb,text,text,uuid
) from public, anon, authenticated;

-- Vulnerabilidad reproducida: authenticated podía enumerar por IDs si otra
-- empresa tenía a un usuario como destinatario de su bandeja.
revoke execute on function private.crm_valid_conversation_assignee(
  uuid,uuid
) from public, anon, authenticated;

-- La función está en el esquema private y no debe publicarse por PostgREST.
-- Mantener el acceso a los RPC públicos que realizan comprobación de permisos.

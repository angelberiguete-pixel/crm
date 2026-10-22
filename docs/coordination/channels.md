# Área 3/5 — plan de 10 mejoras verificables (2026-10-15)

Estado: **propuesta de implementación; ninguna integración externa se declara conectada**.

## Inventario y criterios de aceptación
1. **Escrituras de mensajes**: localizar cada inserción/actualización en UI, RPC y funciones; registrar actor y permisos. Prueba: cobertura de todos los puntos de escritura.
2. **Confirmaciones protegidas**: usuarios autenticados no pueden fijar `sent`, `delivered`, `read`, marcas temporales ni `external_message_id`; solo backend con evento verificado. Prueba: transacción RLS negativa.
3. **Borradores legítimos**: vendedor asignado puede crear salida con `status=created`, sin identificador de proveedor. Prueba: transacción RLS positiva.
4. **Aislamiento multiempresa**: conversación, canal, asignación y mensaje comparten tenant; rechazar IDs cruzados. Prueba: dos tenants en transacción reversible.
5. **Idempotencia**: unicidad de evento/mensaje externo por proveedor, cuenta y tenant, con reintentos seguros. Prueba: webhook repetido no duplica.
6. **Webhooks auténticos**: firma y timestamp verificados antes de persistir; no confiar en tenant_id del payload. Prueba: firma inválida rechazada.
7. **Autorización oficial por empresa**: estados separados solicitud, autorización, prueba E2E y conexión activa; nunca marcar conectado por solicitud. Prueba: UX y API.
8. **Asignación y RBAC**: solo usuarios activos de la misma empresa; acceso a conversaciones conforme al rol. Prueba: cambios entre tenants y usuario revocado.
9. **Consentimiento y plantillas**: impedir envíos no permitidos; registrar origen y vigencia del consentimiento, ventana de conversación y plantilla aprobada. Prueba: denegación y autorización.
10. **Auditoría y errores**: eventos sin tokens ni cuerpos sensibles, errores recuperables, reintentos limitados, trazabilidad de entrega y métricas. Prueba: fallos de proveedor simulados y E2E autorizado.

## Estado verificado
- Supabase: `public.messages` permite INSERT/UPDATE a `private.can_operate_crm(tenant_id)`; no prueba protección por columna. `messages` y `conversations` tienen 0 filas en consulta actual.
- Vercel: último despliegue consultado READY, SHA `0de5af0faea17dde21204496a6d8821af37f2445`.
- No se han ejecutado envíos externos ni cambios de producción en este ciclo.

## Siguiente paso técnico
Inspeccionar rutas de escritura reales antes de migrar permisos; construir migración versionada y pruebas transaccionales con roles reales, seguida de Playwright y PR revisable. Coordinar con Seguridad y UX cualquier cambio a políticas o componentes compartidos. No fusionar sin CI verde.

# Piloto interno exclusivo de Empresia — 11 nov 2026

**Repositorio:** angelberiguete-pixel/crm
**Proyecto Vercel:** crm, team_gNiqsZQ70cdwetXc20gggGxJ
**Origen:** feat/empresia-intelligence-internal-pilot-20261111, basado en feat/erp-native-postgres-20261111
**Tenant piloto:** `eurevector` (Empresia)
**Fuera de alcance y SIN modificaciones:** Family Power y demás clientes.

## Protección por etapas

- **Código:** la ruta /crm/intelligence está protegida y solo deja pasar al tenant `eurevector`, con permisos de dashboard. No agrega enlaces al menú de Family Power.
- **Datos:** la migración crea `private.empresia_brain_tenant_pilots` sin entradas activas. Los triggers globales terminan inmediatamente si el tenant no está en la lista habilitada. Ninguna empresa se habilita automáticamente.
- **IA:** el asistente de borradores solo se invoca bajo selección y consentimiento, con autenticación, cupo de uso y aprobación existentes. No manda mensajes ni realiza cobros.
- **WhatsApp:** conectar únicamente una cuenta/número de prueba propiedad de Empresia. No usar credenciales, número ni clientes de Family Power hasta la aceptación.
- **Despliegue:** evitar previews usando Supabase principal; el cliente actual utiliza coordenadas fijas del proyecto principal. Configurar base aislada antes de una Preview funcional.
- **Producción:** NO ejecutar `supabase/ops/empresia-intelligence-pilot-enable.sql` hasta verificar pruebas y autorizar el despliegue; existe una parada de emergencia inmediata en `supabase/ops/empresia-intelligence-pilot-stop.sql`.

## Requisitos de promoción
1. Integración de cambios de ERP + login preservada en rama basada en producción.
2. CI de CRM y PostgreSQL 17 desechable aprobados, con test de tenant no habilitado (Family Power simulado).
3. Base de datos de prueba independiente y credenciales separadas del proyecto principal.
4. Smoke test con cuenta autorizada de Empresia en web y móvil; permisos owner, admin y usuario restringido.
5. Conexión de WhatsApp Business oficial **solo de Empresia**, con webhooks verificados y mensajes de prueba.
6. Consulta real → clasificación → tarea → aprobación → resultado observado; no inventar ventas.
7. Auditoría de seguridad, límites y reversión.
8. Solo entonces habilitar el piloto real de Empresia y después evaluar Family Power, con aprobación por separado.

## Verificaciones de la prueba
- Evento procesado con identificador e idempotencia.
- Datos del tenant no habilitado nunca aparecen ni generan decisiones.
- Agente IA usa solo productos empresariales, sin inventar precios ni enviar borradores.
- Una recomendación requiere permiso para aprobarse; no puede crear pagos ni facturas.
- El usuario puede deshabilitar el motor; no se pierden evidencias previas.

**No declarar piloto real activo por disponer solo de PR verde.**

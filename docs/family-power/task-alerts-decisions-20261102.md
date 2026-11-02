# Family Power — Tareas, alertas y seguimiento asistido

Fecha de decisión: 2 de noviembre de 2026.

## Decisión funcional aprobada
- El equipo debe ver, desde cualquier pantalla autorizada del CRM (Clientes, Ventas, Mensajes, etc.), una campana con el contador de tareas pendientes de **su propia empresa**.
- La campana muestra actividades pendientes, vencidas y próximas, y abre el módulo de Tareas.
- Las alertas deben refrescarse al volver a la pantalla, periódicamente durante su uso y al crear o finalizar una tarea.
- Los agentes digitales pueden **sugerir/registrar tareas internas** para seguimiento cuando una ejecución validada detecte una acción humana requerida; nunca equivale a enviar mensajes, realizar ventas, agendar citas ni completar acciones.
- Ninguna tarea de Family Power se declara completada sin una confirmación humana explícita que incluya qué se hizo y cómo se verificó. Se registra usuario y fecha en la misma fila.
- No se incorporarán precios, garantías, datos de clientes ni pruebas ficticias.

## Implementación
- Campana en la cabecera común del CRM, condicionada al tenant Family Power y permisos de Operación. Consulta de tareas pendientes de Supabase con control RLS y refresco cada 45 segundos; no hay notificaciones push ni avisos por WhatsApp fuera de la plataforma.
- El módulo Tareas permite registrar evidencia textual verificada por un miembro autorizado, antes de completar. La base de datos valida y sella el usuario y la fecha de la confirmación.
- Una función interna en la base de datos convierte un resultado IA de estado `awaiting_approval` con `requires_human=true` y `next_step` reconocido en una tarea abierta de fuente `ai`, una sola vez por ejecución. No se envía nada al cliente.
- La generación automática se activa únicamente si existen ejecuciones reales y aprobadas por el flujo seguro del agente; mientras los agentes estén sin configurar o sin ejecuciones, no se generarán tareas IA.
- La verificación actual consiste en declaración/documentación humana; una auditoría automática por vinculación al evento real (llamada, mensaje enviado, cotización, cita) debe desarrollarse posteriormente.

## Integraciones entre áreas
- Comercial: vincular cada tarea a contacto, conversación y cotización cuando exista una fuente verificable.
- Agentes IA: emitir propuestas accionables y requerir revisión/aprobación humana; no conceder permiso para marcar realizadas.
- Producto y UX: priorizar alertas, accesibilidad móvil y módulos autorizados, sin datos de otros clientes.
- Dirección: medir pendientes, vencidas, cumplimiento y responsable solo desde hechos persistidos; no usar métricas simuladas.

## Validación
Código y pruebas en la rama `feat/family-power-task-alerts-evidence-20261102`, PR #117. Aplicación SQL y publicación deben verificarse antes de considerar el cambio terminado.

Esta decisión debe incorporarse al documento maestro compartido en Google Drive cuando su acceso esté restablecido.

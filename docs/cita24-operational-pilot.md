# Cita-24 · Empresia — Recepción y agenda administrativa v0.1

## Qué entrega este cambio

Ruta autenticada: /crm/cita24 (dentro del CRM/ARM existente, no una app nueva).
- Alta de contacto con validación básica de nombre, teléfono y deduplicación exacta dentro de la misma empresa.
- Consentimiento administrativo de WhatsApp registrado por recepción; enlace wa.me solo si hay consentimiento y número plausible. Requiere clic y envío humano.
- Agenda de cita administrativa en la tabla existente calendar_events; zona horaria de Santo Domingo.
- Consulta preventiva de solapamientos y restricción transaccional de exclusión en PostgreSQL para una agenda piloto compartida.
- Confirmación interna, atención, cancelación o no-asistencia.
- Tarea humana de confirmación (24 h antes) o seguimiento de no-asistencia.
- Indicadores en vivo de las filas visibles por RLS: programadas hoy, pendientes de confirmar, atendidas, inasistencias y tareas.
- Acceso al calendario general y retorno al CRM.
- Identidad actual Cita-24 · Empresia. El panel /revenue-command-center permanece como herramienta comercial del propietario para prospectar clínicas.

## Datos y seguridad
Se reutilizan contacts, calendar_events y tasks, cada operación incluye tenant_id y se somete a la autorización de la base existente. La ruta requiere permiso calendar y no se habilita a Family Power. No hay claves privadas en el frontend.
Datos capturados: nombre, teléfono, email opcional, canal administrativo, hora y servicio no clínico. No se almacenan diagnósticos, anamnesis, resultados de exámenes ni tratamiento.
El consentimiento se basa en lo afirmado por el personal al registrar al contacto; debe verificarse en el flujo y en el contrato.

## Limitaciones explícitas (no declarar como listo)
- No hay webhook, número oficial de WhatsApp por clínica, envío automático, lectura de confirmación del paciente ni recordatorios transaccionales.
- No hay recepción mediante modelo de IA operativo para Cita-24.
- No hay portal público de pacientes, autoservicio de citas ni sincronización con calendario de terceros.
- La restricción transaccional de no-solapamiento ya está aplicada en el Supabase principal, ver migración 20261109081942; su verificación con un intento de cita conflictiva dentro de una transacción con ROLLBACK fue satisfactoria. Falta todavía prueba E2E desde dos sesiones autenticadas.
- La agenda piloto asume un solo recurso/calendario por tenant, no soporta múltiples doctores en paralelo.
- Los dashboards muestran datos administrativos, no ganancias médicas ni atribución verificada.
- La RLS y el código se han inspeccionado, pero faltan pruebas E2E con dos tenants, dos recepcionistas y usuarios reales autorizados.

## Pruebas previstas
CI ejecuta tests/cita24-clinic-contract.test.mjs, TypeScript y Next.js build.
QA manual requerido antes de producción:
1. Iniciar sesión con usuario de clínica y seleccionar tenant.
2. Crear contacto nuevo y evitar duplicado por teléfono.
3. Registrar cita; comprobar que se ve en Calendario general; comprobar tarea correspondiente.
4. Confirmar, completar, cancelar y marcar no-show con sesión autorizada.
5. Verificar que el usuario de la clínica B no puede consultar ni modificar datos de clínica A.
6. Confirmar que la apertura de WhatsApp exige consentimiento registrado y jamás envía sola.
7. Prueba de concurrencia real con dos sesiones de diferentes perfiles; la restricción SQL ya impide citas simultáneas en una agenda única.

## Comercialización
No presentar este piloto como recepción automática de IA, confirmación por WhatsApp API o SaaS listo para cobrar tarifa premium. El siguiente P0 es seguridad transaccional de agenda, pruebas operativas y canal oficial autorizado.

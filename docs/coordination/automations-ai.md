# Automatizaciones e IA — coordinación

Fecha: 2026-10-14. Área responsable: automatizaciones y motor de flujos.

## Estado comprobado

- Producción en SHA `a67805ce47753693d1c0e56a2b3b3550d0361a09`, Vercel READY y CI verde al iniciar.
- El motor ejecuta acciones internas mediante `execute_automation_internal_action`, con recibos idempotentes por ejecución y nodo.
- Los conectores externos WhatsApp, correo y Odoo **no** tienen ejecutores habilitados: nunca marcar envío como realizado.
- Defecto identificado: si falla transitoriamente una acción interna, el motor marca el evento como `failed` definitivo en lugar de `queued`, aunque `finish_automation_event` admite reintentos y el motor preserva la versión y los recibos.

## Trabajo de esta rama

Corregir la clasificación de errores transitorios conocidos (SQLSTATE de serialización, interbloqueo, conexión o indisponibilidad temporal de PostgREST). Reencolar solo hasta tres intentos, conservando la idempotencia. Errores de configuración o autorización permanecen terminales.

## Criterios de aceptación

1. Prueba unitaria: error SQLSTATE `40001` reencola; segundo intento finaliza sin duplicar la primera acción.
2. Prueba unitaria: error permanente de proveedor/configuración sigue en `failed`.
3. Prueba unitaria: tercer intento transitorio termina en `failed`.
4. CI completo verde antes de integrar; verificar Vercel READY con SHA idéntico a `main`.
5. Sin envíos externos ni modificaciones de datos empresariales durante las pruebas.

## Próximo paso

Implementar, probar y fusionar la corrección únicamente con CI verde. Después auditar colas y reintentos de nodos de ejecución múltiple.

# Auditoría de acciones comerciales — área UX

Estado: auditoría pendiente de completar. Esta matriz define comprobaciones, NO certifica botones.

| Acción | Validación requerida | Estado de carga | Confirmación / error | Evidencia pendiente |
| --- | --- | --- | --- | --- |
| Crear empresa/contacto | Campos obligatorios, formato y tenant | Bloquear doble envío | Confirmación tras respuesta satisfactoria | E2E autenticada y lectura posterior |
| Editar empresa/contacto | Identificador y tenant, campos válidos | Guardar deshabilitado mientras se envía | Conservar cambios ante fallo | Error HTTP y lectura posterior |
| Guardar oportunidad | Etapa, relación contacto-empresa, importe válido | Bloquear doble envío | Mostrar resultado real | RLS entre tenants |
| Cancelar formularios | No enviar escrituras | Ninguno | Confirmar descarte si hay cambios | Playwright 390 px |
| Eliminar | Confirmación explícita y autorización | Bloquear durante solicitud | No retirar fila antes de confirmación | Prueba de denegación |
| Actualizar | Recargar datos reales sin sobrescribir ediciones | Indicador de actualización | Mostrar fallo recuperable | Prueba de fallo de red |

## Reportes comerciales — pendientes
- Oportunidades ganadas: contar `status=won` con filtro tenant y período definido.
- Conversión: documentar denominador (oportunidades creadas en cohorte) y numerador (ganadas de esa cohorte).
- Ventas por vendedor: agrupar por propietario con reglas de atribución documentadas; no asumir facturación cobrada.
- Tiempo de respuesta: exigir marcas de tiempo verificables de mensaje entrante y primera respuesta.
- Cotizaciones aprobadas: usar estado y fecha de aprobación persistidos, no etiquetas visuales.

## Incorporación guiada — pendiente
- Guía contextual por permisos efectivos, sin exponer módulos prohibidos.
- Primer cliente, primera oportunidad y primera tarea con progreso basado en registros reales.
- Posibilidad de omitir y retomar sin generar datos ficticios.

## Evidencia y límites
- PR #75: regresión estática para la suite móvil; CI y smoke de ese commit completados con éxito.
- La suite móvil existente intercepta Supabase; no demuestra escritura auténtica ni RLS.
- No realizar operaciones de QA destructivas ni escrituras sobre producción.

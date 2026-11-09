# Historial comercial, calidad de datos y recomendaciones ARM

## Objetivo
El CRM/ARM general registra cada oportunidad, aprende exclusivamente de resultados confirmados y presenta recomendaciones comerciales trazables. Todo acceso se limita al tenant elegido mediante Auth, permisos y RLS.

## Registro de cambios
- `public.crm_opportunity_journey`: tabla de eventos append-only para usuarios del CRM.
- `created`: oportunidad creada después de activar la migración.
- `stage_changed` / `pipeline_changed`: movimientos efectivos de proceso.
- `outcome_recorded`: paso de abierta a ganada o perdida.
- `reopened`: oportunidad anteriormente cerrada vuelve a abierta.
- `legacy_baseline`: **única** observación inicial de registros anteriores. El sistema NO infiere cambios que no registró.
- Cada evento registra IDs de empresa y oportunidad, nombre de etapa en ese instante, transición de estado, hora y `auth.uid()` si existe una sesión. No copia mensajes, teléfonos ni información personal del prospecto.
- Los usuarios autenticados pueden **leer únicamente** eventos de su empresa activa. No tienen escritura directa; los triggers privados los capturan de forma transaccional. No se permite transferir oportunidades entre tenants.
- El historial no se elimina al borrar una oportunidad; únicamente al eliminar el tenant completo. No es una bitácora WORM frente al administrador de base de datos.

## Calidad antes de la predicción
En `lib/crm-data-quality.ts` se comprueban consistencia de etapa/estado, cliente asociado, vendedor, origen, siguiente seguimiento, fecha de actividad, cierre previsto, motivo de pérdida y fecha de cierre. Son advertencias y criterios de preparación, **no** una garantía de exactitud. No se corrigen datos automáticamente.

El modelo estadístico existente de ventas y cotizaciones sigue sujeto al mínimo de ejemplos reales y a la evaluación fuera de muestra. Las oportunidades abiertas no se consideran cierres y el historial inicial no crea falsos ejemplos de entrenamiento.

## Recomendaciones y agentes
`public.crm_arm_next_actions` es una vista `security_invoker`, con lectura de tablas sujetas a RLS, para asistentes de vendedor y supervisor. Devuelve una propuesta por oportunidad abierta, razón, prioridad, rol sugerido y cantidad de transiciones registradas. No llama al proveedor del LLM ni envía mensajes.

Se consume en:
- `/crm/ml`: pestañas de calidad, historial y recomendaciones.
- `/crm/arm`: panel de agente de Family Power.
- `/crm/employees`: estudio de empleados digitales de la empresa.

Estas pantallas solo presentan recomendaciones. El vendedor/supervisor debe revisar la oportunidad en el CRM antes de escribir, enviar o modificar algo.

## Seguridad y límites
- Supabase RLS y `tenant_id` garantizan separación por empresa para usuarios normales.
- El historial es de solo lectura para clientes; los triggers y funciones privadas no son RPC públicos.
- La nueva vista carece de permisos anónimos y no devuelve datos de conversaciones.
- No se habilitan agentes autónomos ni envío de WhatsApp, nuevas cotizaciones o precios sin autorización.
- `crm_arm_next_actions` propone acciones **por reglas**, no una probabilidad Machine Learning.
- La instalación debe validarse contra cuentas reales y roles diferenciados antes de considerarse puesta en servicio integral.

## Comprobación en producción
Consultar metadatos sin modificar oportunidades:
```sql
select event_type, count(*) from public.crm_opportunity_journey group by event_type order by event_type;
select count(*) from public.crm_ml_training_examples;
select count(*) from public.crm_arm_next_actions;
select tablename, policyname from pg_policies
 where schemaname='public' and tablename='crm_opportunity_journey';
```
Para acceso real, entrar con un usuario miembro del tenant y comprobar el módulo `/crm/ml`; para pruebas de aislamiento se necesitan usuarios de empresas separadas.

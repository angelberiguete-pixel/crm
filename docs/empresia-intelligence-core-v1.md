# Empresia Intelligence Core — implementación v1

**Fecha:** 2026-11-11  
**Proyecto:** angelberiguete-pixel/crm / Empresia multiempresa  
**Estado:** rama de integración desde el ERP más reciente. Piloto exclusivamente Empresia. Sin despliegue ni migración en producción.  
**PR:** https://github.com/angelberiguete-pixel/crm/pull/196

## Principio
Cada evento genera contexto; cada decisión requiere evidencia; cada acción respeta permisos; cada resultado alimenta la próxima decisión.

## Siete etapas y evidencia concreta

| Etapa | Implementación en el código | Límite de v1 |
|---|---|---|
| 1. Percibir | Triggers PostgreSQL observan INSERT/UPDATE de messages, contacts, opportunities, quotations, orders, deliveries y customer_payments | Los clics web/Meta siguen en los módulos analíticos existentes; no se procesan como decisiones automáticas |
| 2. Contexto | Nuevas referencias al registro original; consulta de messages/conversations y productos del tenant. Memoria existente CRM, catálogo y conversaciones | No extraer conversaciones completas a una memoria global |
| 3. Razonamiento | Clasificador determinista con reason_code y evidence; reconoce la consulta de inversor 3.6 kW | No es reentrenamiento ni LLM autónomo |
| 4. Política | RLS por tenant, contexto activo, roles owner/admin para aprobar y ejecutar, clasificación del riesgo | Ningún agente puede modificar sus propios permisos |
| 5. Ejecutar | RPC empresia_brain_review y empresia_brain_execute_task; genera solo tareas internas idempotentes | No envía WhatsApp ni cambia cotizaciones, pagos o ERP |
| 6. Observar | Trigger al completar una tarea crea un outcome verificado | Tarea completada NO es pago, venta ni satisfacción |
| 7. Aprender | Vista security_invoker empresia_brain_learning agrega propuestas, aprobaciones, ejecuciones y tareas terminadas | No modifica pesos, prompts ni políticas automáticamente |

## Memorias por empresa
- **Conversación:** registros originales en public.messages y public.conversations; solo se mantienen referencias en eventos sanitizados.
- **Empresa:** catálogo, contactos, oportunidades y plantillas existentes; se valida producto antes de usar su precio.
- **Resultados:** public.empresia_brain_outcomes con evidencia de tareas completadas; métricas agregadas mediante public.empresia_brain_learning.

## IA con modelo
La interfaz puede utilizar el generador de borradores seguro existente de OpenAI:
- Funciones existentes ai-employee-readiness y ai-employee-draft.
- Autorización explícita del administrador, comprobación del agente, conocimiento y presupuesto por servidor.
- Solo envía al modelo un resumen de intención sin datos personales ni texto completo del mensaje.
- El precio se incluye solo si un único producto activo tiene precio positivo y metadata.price_verified === true.
- El borrador queda sujeto a revisión humana; NO se envía por WhatsApp.
- Orígenes permitidos del proveedor ampliados para portal-empresia.vercel.app; exige desplegar las funciones actualizadas.
- La disponibilidad efectiva depende de la configuración real del proveedor/secretos/budget.

## Autonomía operativa
La **detección y propuesta** ocurre automáticamente por triggers al entrar información en el CRM, sin cron adicional. La **ejecución** solo crea una tarea interna y requiere aprobación owner/admin. La ampliación a respuestas externas, etapas de venta y ERP necesita políticas específicas, cuotas, autorización y verificación de ejecución real.

## Seguridad
- Eventos y decisiones aislados por tenant_id, sin escritura directa desde clientes; RLS habilitado.
- RPC privilegiadas verifican auth.uid, rol y tenant activo; nunca confían en etiquetas de interfaz.
- Llaves de OpenAI y Supabase nunca se publican en la interfaz.
- No hay lectura de registros de otras empresas ni datos inventados.
- La migración no modifica contactos ni información de Family Power ya existente; crea objetos y triggers futuros.

## QA verificable
- Contratos estáticos: tests/empresia-intelligence.test.mjs
- PostgreSQL 17 **aislado**: fixture + migración + pruebas de permisos, idempotencia y retroalimentación en workflow Empresia Intelligence isolated PostgreSQL QA.
- CI de Next.js, TypeScript y navegador: workflow CRM CI.

## Despliegue seguro
1. Confirmar que se conserva el proyecto Vercel oficial crm y el Supabase principal, sin crear otro CRM.
2. Revisar PR, CI y SQL QA; ejecutar prueba humana independiente en staging.
3. Aplicar migración en base de pruebas aislada y validar datos existentes; no aplicar a producción hasta aprobar release.
4. Aplicar migración a producción con respaldo y ventana de cambio, tras pruebas.
5. Desplegar funciones ai-employee-readiness y ai-employee-draft con nuevos orígenes y secretos ya configurados.
6. Publicar el commit verificado en Vercel y probar ruta /crm/intelligence para al menos dos tenants y tres roles.
7. Comprobar creación de evento real, recomendación, revisión, tarea, finalización, métricas, cambio de tenant y rollback.

## Funciones NO entregadas en v1
- Generación y envío automático de cotizaciones al cliente.
- WhatsApp, Instagram y Facebook operando por canal real de Family Power hasta configurar sus credenciales y webhooks.
- Confirmación de pagos y e-CF DGII, permisos y certificación fiscal.
- Publicación en un portal cliente en tiempo real.
- Encuestas de satisfacción, retención y fidelización.
- Aprendizaje autónomo de pesos del modelo o evolución automática de código.
- QA humano externo: el workflow automático no sustituye a un probador autorizado.

## Control de activación por empresa
- Las tablas nuevas y disparadores pueden existir, pero `private.empresia_brain_tenant_pilots` se crea sin empresas habilitadas.
- El disparador de captura sale inmediatamente para cualquier tenant no aprobado. Family Power permanece fuera de la prueba.
- La habilitación de Empresia (slug `eurevector`) será un paso de operación separado y auditado, tras validar el entorno de prueba y autorización.
- Ni una preview conectada a Supabase principal ni un despliegue sin migración se consideran piloto funcional.

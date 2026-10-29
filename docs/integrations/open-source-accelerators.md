# Look Digital Staff — selección de código abierto y aceleradores (octubre 2026)

**Decisión:** extender `angelberiguete-pixel/crm` y sus tablas `ai_agents`, `ai_agent_runs`, `ai_agent_bindings`, `conversations`, `automation_rules`, `erp_connections`. No crear otro CRM o ERP ni copiar un monolito incompatible sin evaluación.

## Fuentes públicas revisadas

| Proyecto público | Licencia confirmada | Qué aporta | Decisión |
|---|---|---|---|
| https://github.com/chatwoot/chatwoot | MIT en código comunitario, exceptúa `enterprise/` y componentes externos | Inbox WhatsApp/Facebook/Instagram, atención humana | **Referencia/adaptador opcional**. No clonar toda la app Rails mientras el CRM ya tiene inbox, roles y datos; evaluar servicio separado solo si baja el tiempo total y no duplica contacto |
| https://github.com/vercel/ai | Apache-2.0 para paquete `ai` | Abstracción de proveedores LLM/streaming | **Candidato en siguiente versión**. Incorporar paquete fijado en lockfile y probar Edge antes de cambiar la llamada Responses API existente |
| https://github.com/langfuse/langfuse | MIT salvo módulos `ee` | Trazas, evaluación, costos de LLM | **Conector de observabilidad futuro**. El CRM ya guarda `ai_agent_runs` y tokens; evaluar despliegue separado, consentimiento y minimización de PII |
| https://github.com/livekit/agents | Apache-2.0 para framework; determinados modelos tienen otra licencia | Agentes conversacionales de voz | **Módulo separado futuro**. Requiere runtime de voz, telephony, grabación/consentimiento y costos; no se representa voz como activa |
| https://github.com/triggerdotdev/trigger.dev | Apache-2.0 según repositorio | Trabajos duraderos, colas, reintentos | **No clonar inicialmente**: existe `automation-engine` en el CRM; considerar si evidencias demuestran que resolver reintentos propios sale más caro |
| https://github.com/marmelab/atomic-crm | MIT | Exportación vCard | **Ya reutilizado** en CRM por PR #78; conserva licencia en `third_party/atomic-crm` |

La comparación es de **adopción**, no una declaración de clonación, instalación o ejecución en producción. El conector de GitHub puede leer y adaptar archivos puntuales; la clonación masiva mediante `git` no pudo ejecutarse desde la sesión de trabajo por DNS del entorno, sin afectar la capacidad de modificar nuestro repositorio mediante el conector.

## Cómo reutilizar bien

1. Revisar licencia y excepciones a nivel archivo, autoría, cambios, versionado y licencias de dependencias; excluir carpetas enterprise o modelos restringidos.
2. Para código copiado, incluir licencia original, referencia exacta a commit/archivo, cambios y tests; no eliminar avisos originales.
3. Instalar paquetes usando versiones fijas, `package-lock.json` y análisis de CVE; no depender de `latest`.
4. No añadir infraestructura externa que duplique Auth/RLS, contactos, oportunidades o ERP.
5. Si se usa servicio externo, definir tenant mapping, secreto en servidor, retención de datos, cumplimiento de privacidad y procedimiento de baja/rollback.
6. Pruebas comparativas: flujos de voz y canal Meta autenticados, failover, costos por contacto, latencia, aislamiento entre clientes y soporte real.

## Implementación técnica actual — PR #81

- Cuatro roles reutilizables de empleados digitales, **solo borradores**.
- Generación mediante Responses API en Edge Function, cuando exista autorización y secreto. `store:false` evita almacenamiento por defecto en proveedor.
- Cuotas atómicas por tenant/día en migración versionada y RPC limitada a `service_role` para preservar presupuesto. La cuota de 20 *pruebas* no sustituye facturación ni presupuesto por tokens.
- Decisiones humanas inmutables para cada borrador por tenant, sin enviar mensajes ni comprometer contratos.
- UI, controles multiempresa, pruebas unitarias y navegador móvil.
- PR #80 de Meta es requisito separado para mensajería real; la cuenta y el número deben autorizarse con el proveedor oficial.
- Odoo permanece ERP externo; usar adaptador existente, no implementar contabilidad nueva.

## Bloqueos para un servicio 100% operable

Se requieren, y aún no se han probado, los siguientes componentes:
- Integración Meta/WhatsApp Business oficial con cuenta, permisos, webhooks, destinatarios y consentimientos comprobados;
- Integración de correo autorizada (OAuth/IMAP o proveedor contratado), privacidad y prueba de entrega;
- Proveedor IA operativo con credenciales, cuotas monetarias, límites por organización y garantía de servicio;
- Motor de acciones autorizado por perfil y tenant, envío/reintentos sin duplicación, transferencia a humano, agenda conectada;
- Cobros con Odoo sólo tras comprobar autenticación, condiciones de datos y aprobación del cliente;
- Voz opcional con infraestructura y consentimiento de destinatarios;
- Pruebas E2E de aislamiento, backups/restauración, cumplimiento de políticas, pagos y contratos.

**No confundir tests con mocks y un CI verde con integraciones reales de producción.** No ejecutar migraciones ni publicar sin autorización explícita.

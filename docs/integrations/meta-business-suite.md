# Look Social Media — Meta Business Suite / CRM (integración preparatoria)

**Estado:** contrato de recepción y verificación; NO es una conexión activa. No hay endpoint HTTP, credenciales, recepción persistente de mensajes, envío WhatsApp/Instagram/Messenger ni IA de producción en este cambio.

## Propósito

Integrar el **número actual de WhatsApp Business**, la página de Facebook, la cuenta profesional de Instagram y los formularios Lead Ads del portafolio comercial autorizado de Look Social Media con el **CRM EXISTENTE** (sin CRM/ERP paralelo). Mantener la captación, citas y negociación bajo Ángel Berigüete; Odoo queda como ERP externo opcional.

## Alcance entregado en esta rama

- 'lib/meta-webhook.ts': valida HMAC SHA-256 con la clave secreta de la aplicación Meta sobre el cuerpo exacto; rechaza mensajes no firmados, alterados o demasiado grandes.
- Normaliza eventos entrantes de WhatsApp, estados de entrega, ecos salientes de coexistencia, Instagram, Messenger y avisos de formularios Lead Ads.
- Genera claves de idempotencia independientes por proveedor, tipo, cuenta y mensaje/lead.
- Ignora eventos sin identificadores esenciales; los avisos Lead Ads transportan ID del lead, **no** información personal.
- 'tests/meta-webhook.test.mjs': verifica los contratos.
- **No se habilita endpoint público ni envío**: falta validación de cuenta, mapeo de tenant, control de acceso y credenciales. Los helpers por sí mismos no tienen efectos sobre clientes.

## Requisitos previos con el responsable de Meta

1. Identificar el portafolio **Look Social Media**, rol administrador, ID WABA, ID de número telefónico, ID de página, ID de IG profesional y cuenta publicitaria. **Jamás incluir tokens o secretos en GitHub, chat o frontend.**
2. Comprobar elegibilidad de **WhatsApp Business App Coexistence** para seguir utilizando el mismo número en el móvil mientras el CRM usa Cloud API; probar el flujo de alta oficial con sesión del administrador. Verificar efectos sobre historial, dispositivos, costos y restricciones antes de aceptar.
3. Configurar y revisar una aplicación de Meta, permisos/API y alcance apropiado para WhatsApp, Instagram/Messenger y Lead Ads. La relación entre Business Suite, página y cuenta de anuncios **no** concede automáticamente permisos de API.
4. Registrar secretos exclusivamente en vault/variables de servidor; crear un punto de recepción que valide 'hub.verify_token' para GET de verificación y 'X-Hub-Signature-256' para POST antes de procesar eventos. Un token de verificación no sustituye la firma HMAC.
5. Resolver cada accountId contra una **tabla de mapeos verificados y propietarios** de empresa/tenant. Rechazar IDs desconocidos, relaciones cruzadas y páginas que no correspondan a la marca autorizada.
6. Persistir el evento bruto mínimo en una cola/tabla privada con 'UNIQUE(provider,kind,account_id,external_id)' y controles de concurrencia, retención, reintentos y protección de datos; no permitir que una solicitud pública cree conexiones activas.
7. Para Lead Ads, recuperar los datos del lead mediante Graph API con permisos autorizados; registrar origen, anuncio, formulario, política de privacidad y consentimiento cuando aplique; **deduplicar** contra 'agency_prospects', que ya contiene 890 registros históricos.
8. Para WhatsApp, respetar el alcance del consentimiento, la ventana de respuesta de 24 horas y las plantillas aprobadas cuando corresponda; implementar control de límites, exclusión/STOP, revisión de destinatario y trazas. Evitar campañas indiscriminadas a toda la base.
9. Para Instagram, conversar solo mediante permisos, elegibilidad y ventanas autorizadas por la plataforma. Para Messenger, vincular Page ID y el permiso correspondiente.
10. Activar asistente IA primero en modo **borrador con revisión de Ángel**: clasifica interés, resume, propone siguiente paso, agenda una tarea y prepara respuesta/propuesta. Nunca inventa precios, servicios aprobados, garantías o reuniones confirmadas.
11. Para envío autónomo futuro: autorización expresa, política de escalamiento a humano, opt-out y pruebas controladas de seguridad y calidad. La IA de voz y las llamadas se evalúan como integración independiente con consentimiento apropiado.
12. Medir en sandbox un flujo E2E real: mensaje entrante -> firma -> cuenta -> tenant -> dedupe -> contacto/prospecto -> conversación -> propuesta de IA -> aprobación -> respuesta de API -> recibo de entrega -> actualización de pipeline. Verificar mensajes del móvil en coexistencia y no generar respuestas dobles.

## Criterios para conectar el canal

El canal se marca 'connected' **únicamente por un worker de servidor autorizado** después de OAuth/Embedded Signup, verificación de titularidad, credenciales seguras, prueba bidireccional y controles de tenant. 'tenant_register_channel_request' registra solicitudes, no integra proveedores. El worker actual de automatización rechaza envío real de WhatsApp/correo e IA sin ejecutores conectados. No prometer funcionalidad no demostrada.

## Referencias

- Documentación de la Meta WhatsApp Business Platform, Embedded Signup/Coexistence y webhooks.
- Meta Instagram API (documentación oficial Postman).
- Guía Meta de integración de formularios Lead Ads con un CRM.

**No modificar producción, no gastar, no enviar mensajes ni fusionar PR hasta autorización y QA.**


## Envío real de prueba por WhatsApp Cloud API — fase preparatoria (28 octubre 2026)

Se creó la función de servidor supabase/functions/whatsapp-test-send con envío auténtico al endpoint de mensajes de Meta; política segura, libro privado de intentos, botón de prueba en CRM → Canales y pruebas unitarias. Todo está **solo en una rama**, NO desplegado ni conectado; no se ha enviado ningún mensaje real. Meta aceptó el mensaje no significa entregado ni leído.

SEGURIDAD Y ALCANCE:
- Solo un test recipient previamente autorizado y guardado en secretos del servidor; no se acepta destinatario arbitrario por solicitud web.
- El usuario debe tener sesión válida, ser owner activo del tenant Look Social Media (slug técnico eurevector), con WhatsApp de la propia empresa verificado en servidor y Phone Number ID correcto.
- El destinatario de prueba debe consentir y escribir primero al número empresarial para abrir la ventana de atención si se envía texto libre.
- UUID de solicitud único y registro previo en la tabla RLS whatsapp_send_attempts. Intentos ambiguos no se reintentan automáticamente.
- Variables secretas en Supabase: META_WA_TENANT_ID, META_WA_PHONE_NUMBER_ID, META_WA_TEST_RECIPIENT, META_WA_ACCESS_TOKEN, META_WA_GRAPH_VERSION. Nunca se deben pegar claves/tokens en chat, GitHub o frontend.
- Migración versionada supabase/migrations/20261028212000_whatsapp_test_sends_private_ledger.sql requiere aprobación antes de ser aplicada a producción. Desplegar Edge Function con verify_jwt=true.
- Verificar Business Portfolio Look Social Media, WABA ID, Phone Number ID, permisos whatsapp_business_messaging y elegibilidad de WhatsApp Business App Coexistence. NO borrar la cuenta activa del teléfono.
- Envíos a contactos y automatizaciones: FASE POSTERIOR. Exigen webhook entrante firmado, tenant mapping validado, registro de consentimiento, plantillas aprobadas fuera de 24h, control antispam, deduplicación, E2E y supervisión humana.
- Sin credenciales autorizadas y aceptación del proveedor no hay integración productiva. No enviar mensajes ni registrar conversaciones como enviadas por simple click o HTTP 200.

PRUEBA DE ACEPTACIÓN: login propietario → canal Meta configurado/verificado → destinatario voluntario → un solo POST real con idempotencia → Meta responde message ID → webhook confirma entrega → resultados auditados. No interpretar un estado READY o CI success como confirmación de entrega.


## 29 octubre 2026 — receptor multiempresa desplegado, sin cuentas Meta vinculadas

Se fusionó PR #80 (contrato HMAC y envío de prueba BLOQUEADO). La recepción firmada y enrutamiento por empresa se incorporaron con PR #83:

- Edge Function Supabase \`meta-whatsapp-inbound\` v1: endpoint HTTPS público Meta (sin JWT, obligatoria firma HMAC \`X-Hub-Signature-256\` y secreto \`META_APP_SECRET\`), verificaciones GET por \`META_WHATSAPP_VERIFY_TOKEN\`. Si faltan secretos: HTTP 503, sin procesar contenido.
- DB \`meta_whatsapp_routes\` (cada número \`phone_number_id\` y WABA \`waba_id\` verificados, un tenant y canal, bloqueado por defecto), \`meta_whatsapp_inbound_receipts\` (deduplicación global). RPC transaccional \`ingest_verified_whatsapp_text\` de servidor: crea/localiza contacto y conversación, mensaje inbound, sugiere el agente vinculado y exige revisión humana. Un número no autorizado, suspendido, desconectado o sin WABA coincidente no crea contactos.
- Disparador de \`tasks\`: una sola tarea interna de seguimiento por conversación validada, sin notificar por WhatsApp, sin crear dinero ni oportunidades sin calificación.
- CRM \`/crm/employees\`: configuración de empleado por empresa, asociación a canal WhatsApp concreto mediante \`ai_agent_bindings\` con \`auto_reply=false\`; ningún empleado se crea o activa automáticamente.
- **Sin credenciales Meta** del portafolio autorizado, no hay números en \`meta_whatsapp_routes\`, el endpoint se mantiene fail-closed. No declarar real el envío o recepción. La UI de test-send del PR #80 se bloquea si el canal no está verificado.
- El costo de OpenAI sigue bloqueado (EXECUTE de \`reserve_ai_employee_budgeted_trial\` DENEGADO a service_role).

### Pasos operativos para vincular el primer número

1. Un administrador verifica en **Meta Business Suite de Look Social Media** la propiedad del número actual, la cuenta WABA, Phone Number ID, cuenta de la aplicación Meta y elegibilidad real de **WhatsApp Business App Coexistence** antes de hacer cambios al WhatsApp móvil.
2. En la consola segura de Supabase, guardar \`META_APP_SECRET\` y \`META_WHATSAPP_VERIFY_TOKEN\`. **No transmitirlos en chats**, repo ni URLs públicas. Asociar el callback a \`https://ygipjqgyreeahslzorik.supabase.co/functions/v1/meta-whatsapp-inbound\` y verificar challenge GET + webhook signed POST en Meta.
3. Verificar que la app dispone de permisos y suscripción WABA legítimos y que los IDs (WABA y Phone Number) pertenecen al negocio autorizado; conservar justificante de validación.
4. **Solo desde servicio administrador con credenciales privadas** crear el mapeo \`meta_whatsapp_routes\` con \`verified_reference\`, \`verified_at\`, \`channel_id\` del tenant y \`is_enabled=true\`, y establecer \`channels.status='connected'\` tras el test real. No se permite que formularios públicos activen mapeos por su cuenta.
5. En CRM seleccionar empleado y vincular ese canal. Probar webhook firmado de un remitente de prueba autorizado: un contacto, una conversación, mensaje de texto y una tarea interna. Repetición del mensaje debe producir 0 duplicados; número o WABA de otra empresa debe producir 0 inserciones. Verificar en el panel con cuenta propietario y con otra empresa.
6. Envío WhatsApp real es otro permiso y prueba: token Graph con alcance correcto, consentimiento, ventana 24 horas, plantillas aprobadas para iniciar y recibos de entrega. **No enviar a prospectos históricos sin consentimiento**.
7. Para auto-respuestas con IA, respetar orden del usuario: el presupuesto de OpenAI está revocado; solamente se permiten borradores supervisados cuando se autorice nuevo proveedor real. No hacer gasto.

### Otras capacidades NO verificadas

Un registro \`custom_domain\` no asigna automáticamente DNS/certificado; hace falta dominio propiedad del cliente y configuración explícita en Vercel. Ni las cuentas Facebook/Instagram/ads, ni el cobro recurrente ni Odoo se integran por el mero hecho de que existan tablas o componentes. Cada una requiere verificación y aceptación E2E.

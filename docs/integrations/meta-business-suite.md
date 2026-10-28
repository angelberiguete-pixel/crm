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

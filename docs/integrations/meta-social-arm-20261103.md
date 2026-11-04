# Meta Social → CRM/ARM | Fundación técnica y ruta de habilitación
**3 de noviembre de 2026 | Implementación de rama, sin activar producción**

## Producto
Ampliar el CRM multiempresa EXISTENTE de Look Social Media para admitir Instagram Professional DMs/comentarios y Facebook Page Messenger/comentarios, además de WhatsApp, bajo la misma bandeja `/crm/inbox`. No crear una base paralela. Cada interacción debe tener el canal, cuenta autorizada, tenant, external ID, autor, contenido, estado y trazabilidad; los comentarios públicos no equivalen a un DM ni a consentimiento para mensajes posteriores.

## Estado que sí consta
- `channels` ya admite `instagram` y `messenger`; `conversations` y `messages` poseen claves multiempresa e idempotencia por ID externo. La bandeja muestra ambos proveedores por etiquetas, pero solo se verificó un flujo de envío humano vía YCloud/WhatsApp; NO existe recepción ni envío operativo de Instagram o Messenger.
- `lib/meta-webhook.ts` verifica HMAC sobre el cuerpo exacto y normaliza mensajes de Instagram/Messenger; esta rama amplía el normalizador a `comments`, `live_comments` y eventos `feed` de comentarios de Page. Sigue siendo una biblioteca pura: NO hay endpoint activo ni escritura ni envío.
- `lib/meta-social-automation.ts` ofrece únicamente una política comprobable para crear *candidatos de borrador*; exige route autorizada que será comprobada por servidor. Respeta ventanas, comentarios, deduplicación y revisión humana. NO llama a una IA ni a Meta y no autoriza respuestas automáticas.

## Trabajo restante para hacer operativa la conexión
1. **Meta App / permisos**: verificar cuenta profesional IG y Página de Facebook, roles y propiedad del negocio, OAuth de IG o Facebook Login for Business, URLs de retorno, revisión de app, Advanced Access donde aplique; permisos de DMs, Page messaging y comments según la modalidad aprobada. Nunca pedir credenciales de redes sociales ni tokens al cliente dentro del CRM.
2. **Registro de conexiones y secretos**: flujo OAuth servidor, vault cifrado, refresh/revocación, política de scopes, asociación explícita `(provider,account_id) → (tenant_id,channel_id)`, una cuenta no compartida entre empresas. La solicitud visible hoy no establece conexión.
3. **Webhook firmado y persistencia**: endpoint HTTPS Meta firmado; validar HMAC antes de parsear; buscar route verificada de servidor; deduplicar `provider/account/event_kind/external_id`; colas de reintentos, observabilidad sin PII en logs, límites de payload. Nunca crear cuentas a partir de IDs no verificados.
4. **Inbox social**: mensajes DM ingresan en `messages` vinculados a `conversations`. Comentarios públicos deben almacenarse como interacciones con post/media y comment ID, con etiqueta *comentario público* visible y opción distinta de *respuesta privada*; no fabricarlos como DMs. Mantener aislamiento RLS, permisos de vendedor asignado, historial, SLA y auditoría.
5. **Compositor autorizado**: para enviar mediante Graph API verificar tenant, token, permiso, plantilla/copy aprobado, ventana Meta (24h para automatización DM estándar), una sola respuesta privada por comentario dentro de 7 días (Live durante emisión), opt-out y dedupe. Registrar 'aceptado' por Meta distinto de 'entregado'. Nunca auto enviar al recibir un simple comentario.
6. **Agente IA**: memoria/documentos verificados propios de cada empresa, clasificadores, borradores, handoff a vendedor, políticas de temas sensibles y presupuestos; habilitar auto-respuesta por empresa y canal únicamente tras autorización, evaluación y pruebas E2E. No activar gasto de proveedor ni anular la decisión previa de gastos IA bloqueados.
7. **Pruebas de aceptación**: conectar una cuenta de prueba real; 1 comentario de IG y 1 de FB, 1 DM de IG y 1 de Messenger, reintentos duplicados, ventana expirada, comentario propio, autorización revocada, dos empresas simultáneas, vendedor asignado, borrador IA, revisión, envío, recibo, datos del prospecto y auditoría.
8. **Comercialización**: comercializar solo las funciones probadas. El plan Family Power de RD$75,000 + RD$12,000/mes requiere anexo de alcance para las nuevas integraciones y consumos; NO incluirlas como activas ni ilimitadas en el precio actual sin acuerdo.

## Fuentes oficiales de requisitos
- https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api
- https://www.postman.com/meta/messenger-platform-api/documentation/iyp204x/messenger-platform-api
- https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/
- https://developers.facebook.com/docs/messenger-platform/

### Seguridad de este PR
No modifica producción, no crea secretos, no activa webhook HTTP, no manda mensajes, no habilita IA, no ejecuta migraciones SQL ni crea falsos contactos. Revisión y aceptación obligatorias antes de fusionar/desplegar.

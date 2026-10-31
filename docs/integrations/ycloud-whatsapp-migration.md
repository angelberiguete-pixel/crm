# YCloud + Look Social Media CRM — migración de proveedor (30 octubre 2026)

**ESTADO: propuesta en revisión, SIN DESPLEGAR Y SIN NÚMEROS NI AUTOMATIZACIÓN ACTIVOS.**
Cambio de decisión del responsable: YCloud es el nuevo proveedor de WhatsApp, manteniendo CRM multi-tenant existente, Supabase, Make y Family Power, sin crear otro CRM. No se pretende interrumpir WhatsApp Business ya activo en un celular.

## Por qué dejamos 360dialog
- Eliminados tres escenarios antiguos de Make, IDs 6843691, 6843771 y 6845436. Registro HTTP y Sandbox fueron usados exclusivamente para pruebas; no tienen eventos de clientes en el CRM.
- PRs #89, #91 y #92 cerrados **sin fusión**. No se borran los registros de revisión, ni las credenciales de proveedores externos, ni el número en Meta.
- La vinculación de Look Social Media a 360dialog era **Activation Pending**, no Live; la migración debe verificar quién tiene el control del número primero. NO desconectar 360dialog en WhatsApp Business por intuición ni volver a registrar el número hasta revisar el estado con YCloud.
- Family Power tiene su canal separado (sin conexión real) y requiere la autorización del doctor antes de cambiar su proveedor.

## Costos oficiales y límites para planificación

- YCloud [Free](https://www.ycloud.com/es/pricing): US$0/mes, US$0 instalación, 2 canales, 1 usuario en YCloud (los vendedores se administran por separado desde el CRM), APIs/webhooks; sin tarjeta para suscripción gratuita; tarifas Meta aparte.
- [YCloud Tech Partner Free](https://www.ycloud.com/es/tech-partner): US$0/mes de plataforma, canales anunciados ilimitados y gestión autónoma. **Requiere postular y confirmar elegibilidad y aceptación**; no declarar cuenta partner aprobada.
- Tarifa Meta de servicio a usuarios de República Dominicana desde 1/oct/2026: 1,000 mensajes de servicio entregados al mes **por número** gratis; después aprox. US$0.0113 por cada uno; marketing aproximado US$0.074 por plantilla entregada, sujeto a tarifa y categoría de país. Consultar tabla oficial vigente y monitorear webhooks `whatsapp.message.updated` para costo final.
- Make Free: 1,000 créditos al mes. Make Core: US$12/mes por 10,000 créditos en la modalidad de referencia. Consumo real depende de módulos ejecutados, no solo número de conversaciones; IA y alojamiento por uso aparte.
- Costo inicial si YCloud Free aceptado y 1 número elegible: US$0 de instalación y plataforma. Costo operativo mensual posible US$0 para atención y pruebas ligeras dentro de cuotas gratuitas, **no garantiza gasto cero ni elimina costos de desarrollo o Meta**.

## Arquitectura de producción propuesta (menos costo y mejor seguridad)

```
WhatsApp Business del cliente (Coexistencia autorizada, si es elegible)
        |
     YCloud
        |
        +-- firma HMAC del cuerpo ORIGINAL -> Supabase Edge Function
        |    /functions/v1/ycloud-whatsapp-inbound
        |    comprueba YCloud-Signature y timestamp, luego RPC protegido
        |    busca ruta server-side WABA ID + número E164 VERIFICADOS
        |    escribe contactos, conversación y mensaje idempotente
        |    -> CRM /crm/inbox y tarea de revisión humana
        |
        +-- Make: escenario YCloud 6846318 INACTIVO, sólo reservado
             para automatizaciones ya verificadas y autorizadas,
             no como reemplazo del receptor firmado.
```

En un solo evento HTTP, YCloud envía `whatsapp.inbound_message.received`. Se comprueba `YCloud-Signature` usando `HMAC-SHA256(timestamp + "." + RAW_BODY, endpointSecret)`. No sirve hacer JSON parse/stringify en Make y pretender validar la firma del cuerpo original. Por eso recomendamos recibir y validar en Supabase directamente, dejando Make para automatizaciones posteriores desde registros verificados del CRM. Ver documentación:
- https://nndocs.ycloud.com/reference/webhook-integration-guide
- https://nndocs.ycloud.com/reference/whatsapp-inbound-message-webhook-examples
- https://nndocs.ycloud.com/reference/whatsapp-message-pricing-integration-guide

## Archivos preparados en este PR
- `lib/ycloud-whatsapp-webhook.ts`: normaliza eventos v2 de texto entrante; no admite medios, historial ni eventos falsos.
- `supabase/functions/ycloud-whatsapp-inbound/index.ts`: verifica firma y antigüedad de solicitud, tamaño, cuerpo crudo, secreto en servidor y endpoint ID opcional. No envía mensajes ni usa OpenAI.
- `supabase/migrations/20261030230000_ycloud_verified_whatsapp_routes.sql`: tablas `ycloud_whatsapp_routes`, `ycloud_whatsapp_inbound_receipts` y RPC `ingest_verified_ycloud_whatsapp_text`, aisladas por tenant/empresa y clave de mensaje idempotente.
- Tests de contrato sin credenciales.

## Pasos necesarios antes de probar con tu número REAL
1. Crear cuenta personal **gratuita** en YCloud con tus datos reales: https://www.ycloud.com/es/pricing. No usar datos de sociedad aún no formalizada. No elegir pago.
2. Dentro de YCloud, confirmar si permite conectar mediante **Coexistence** el número +1 849-570-6550 y si requiere desregistrar/migrar 360dialog pese a "Activation Pending". **No desinstalar ni desconectar el WhatsApp Business móvil** hasta que las instrucciones explícitas del proveedor aseguren conservación de número e historial.
3. En el canal de YCloud, aprobar permisos de Meta y obtener **WABA ID** y número E164 reales; verificar titularidad. La primera cuenta YCloud Free permite máximo 2 canales. Para más cuentas gestionar solicitud Tech Partner Free aparte y documentar requerimientos.
4. Preparar el proyecto Supabase en staging: desplegar SQL **revisado**, la función `ycloud-whatsapp-inbound` con `verify_jwt=false` y secretos `YCLOUD_WEBHOOK_SECRET` y opcional `YCLOUD_WEBHOOK_ENDPOINT_ID` almacenados solo en servidores.
5. Crear el webhook oficial desde YCloud Developers → Webhooks con URL:
   `https://ygipjqgyreeahslzorik.supabase.co/functions/v1/ycloud-whatsapp-inbound`.
   Suscribirse a `whatsapp.inbound_message.received`. Para recibir también actualizaciones de costo/estado, suscribirse más adelante a `whatsapp.message.updated` y desarrollar su procesamiento. Copiar la **firma secreta del webhook**, NO la X-API-Key de envío, a los secretos Supabase.
6. En Superadministración, conservar tenant `eurevector` (Look Social Media) y canal WhatsApp preexistente; **no crear tenants duplicados**. En servidor solamente, cotejar WABA ID+número de YCloud y crear una ruta en `ycloud_whatsapp_routes`, `verified_reference` con un rastro de auditoría, `is_enabled` inicialmente false. La marca `channels.status='connected'` sólo después de prueba y autorización de QA. NUNCA permitir que los datos de webhook decidan tenant.
7. Enviar un único mensaje voluntario desde otro teléfono a Look Social Media; verificar firma, un contacto, una conversación, un mensaje, una tarea y duplicación sin nuevo registro. Probar con cuenta autorizada `/crm/inbox` y que un usuario de Family Power NO pueda acceder.
8. Activar respuesta humana desde CRM solo cuando exista el módulo de **salida** YCloud (actualmente no implementado) con token servidor, aprobación, consentimiento, plantillas y ventana de 24 h. Para IA operativa falta configuración de conocimiento, proveedor, presupuesto y QA. `auto_reply` se mantiene false.
9. Recién tras probar conexión YCloud y estabilidad de WhatsApp Business, retirar el proveedor anterior del portafolio Meta según las instrucciones de migración y cancelar cualquier suscripción de 360dialog con cargo, si existe, desde su cuenta. No se ha efectuado esa acción.

## Restricciones activas
- No pagar, publicar, activar bots ni habilitar webhooks reales sin confirmación de titularidad.
- No compartir API keys ni secretos en capturas, chat, GitHub, Make URL pública ni `NEXT_PUBLIC_*`.
- Los datos históricos de Family Power y el usuario del doctor siguen protegidos y sin migrar.
- La ausencia de clave/cuenta YCloud conectada impide una prueba extremo a extremo hasta alta real.

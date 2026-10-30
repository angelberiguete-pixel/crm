# Family Power — 360dialog Coexistence: preparación para recepción en CRM

**Estado:** código en PR para revisión, sin despliegue, sin credenciales, sin mensajes reales ni gastos. El QR del doctor y la autorización del propietario siguen pendientes. No confundir esta guía con una integración activa.

## Objetivo
Conservar WhatsApp Business **+1 809-685-0011** en el teléfono del propietario de Family Power y hacer que los mensajes futuros se muestren en el CRM **multiempresa existente** de Look Social Media con logo, permisos y usuarios de Family Power. El número pertenece a Family Power; Look Social Media opera el software bajo autorización.

## Lo que ya está diseñado
- Acceso personalizable: `/family-power/login`, variantes oficiales de logo `/client-brands/family-power`.
- Alta de tenant con `platform_create_family_power_tenant('starter')` desde la sesión de un **superadministrador** autorizado, no mediante `service_role` o SQL de integración.
- CRM: `/crm/inbox` para conversaciones por tenant; `/crm/integrations` para solicitud de canal; `/crm/employees` para empleados digitales configurados y vinculación manual sin autoenvíos.
- Enrutamiento atómico e idempotente existente: `meta_whatsapp_routes` con WABA ID, Phone Number ID y channel_id verificados por el servidor; `ingest_verified_whatsapp_text` genera contacto, conversación, mensaje y tarea humana.
- NUEVO receptor `supabase/functions/360dialog-whatsapp-inbound/index.ts`: exige token de cabecera opcional de 360dialog **obligatorio en nuestra configuración**, parsea webhooks de mensajes de texto entrantes y de eco `smb_message_echoes`. Los ecos del doctor se guardan como mensajes salientes `external`, nunca como mensajes del cliente ni IA.
- NUEVA RPC `ingest_verified_whatsapp_echo` con validaciones de pertenencia, unicidad e inserciones transaccionales: servicio privilegiado únicamente. No crea una ruta por sí misma.

## Pasos técnicos y de seguridad tras la autorización en presencia del doctor
1. Confirmar que la aplicación móvil sigue funcionando; registrar consentimiento del responsable para conexión API y, **separadamente**, si autoriza o rechaza importar historial/contactos.
2. Comprobar en 360dialog que el canal corresponde al número **+18096850011**, al portafolio comercial **Family Power**, y que Meta confirmó **Coexistence**. Obtener de fuentes oficiales 360dialog/Meta el WABA ID y Phone Number ID; verificar titularidad con capturas sin tokens.
3. Revisar suscripción, condiciones de cobro y modalidad de los webhooks; no confirmar nuevos cargos sin aprobación.
4. Desde `/platform-admin`, el operador autorizado crea el tenant **solo si no existe** y comprueba su identidad visual. Accede como administrador de esa empresa, registra una sola solicitud WhatsApp `+18096850011` desde `/crm/integrations` y obtiene el ID del canal creado.
5. Revisar y aplicar la migración `20261029235500_360dialog_coexistence_echo.sql` con autorización de despliegue, previa prueba de entorno. Desplegar `360dialog-whatsapp-inbound` **con `verify_jwt=false`** porque los webhooks no portan JWT Supabase. La seguridad de `POST` depende de `Authorization: Bearer <secreto único de al menos 32 caracteres>`, HTTPS, limitación de tamaño, y validación SQL por WABA + Phone Number ID.
6. Generar el secreto de webhook dentro de la consola de secretos del servidor de Supabase: `D360_WEBHOOK_BEARER_TOKEN`; no pegarlo en GitHub, conversaciones, capturas o variables `NEXT_PUBLIC_*`. En 360dialog Hub → WhatsApp Channel → Channel Webhook añadir esta URL:
   `https://ygipjqgyreeahslzorik.supabase.co/functions/v1/360dialog-whatsapp-inbound`
   y su cabecera **Authorization** `Bearer <secreto>` por el campo seguro de 360dialog. No utilizar la URL `meta-whatsapp-inbound`, que exige una firma HMAC de Meta y no acepta este flujo.
7. **Solo en el servidor autorizado**, tras cotejar titularidad, crear `meta_whatsapp_routes` para ese WABA ID + Phone Number ID + tenant_id + channel_id, con `verified_reference` auditado. Hacer prueba con un contacto voluntario usando ruta habilitada **temporalmente solo para QA**, y cambiar `channels.status` a `connected` únicamente en el intervalo autorizado de prueba; deshabilitar si falla. Verificar un mensaje y repetir el mismo evento: exactamente un contacto, una conversación y un mensaje, cero cruces de tenant.
8. Probar en el celular del doctor una respuesta de texto a ese contacto. Comprobar que el evento `smb_message_echoes` aparece en el mismo hilo como salida enviada desde la aplicación, **sin enviar automáticamente ninguna respuesta desde el CRM**.
9. Confirmar pruebas de lectura con cuenta del propietario de Family Power y negación con un usuario de otra empresa; revisar teléfono, consentimientos, política de privacidad, permisos de vendedores y RLS.
10. Vincular perfiles digitales al canal desde `/crm/employees`. Primero crear cuatro **borradores sin gasto** mediante el botón superadministrador `Preparar empleados digitales`. Solo tras aprobar información real del cliente, límites, credenciales y prueba voluntaria separada se puede habilitar un proveedor IA con revisión humana. El bloqueo vigente de gastos de IA debe permanecer hasta autorización expresa.

## Límites presentes (NO prometer capacidades faltantes)
- Conector **solo entrante**, mensajes de texto actuales y ecos de texto escritos desde la app. No envía API WhatsApp, no genera respuestas IA, no importa mensajes históricos, medios, contactos ni estados de entrega. Estos requerirán desarrollo y autorización por separado.
- No hay provisión automática de conexión por escanear QR: 360dialog crea API/WABA; aún hacen falta secreto, webhook, mapeo verificado, QA y usuarios.
- No hay publicación ni webhook configurado a la fecha de esta preparación. **Nunca marcar conectado sin una recepción E2E real.**
- Los eventos `history`, `smb_app_state_sync` y estados se reconocen pero no persisten. No importar datos personales en masa sin consentimiento, política de retención y deduplicación.
- WhatsApp Business App debe seguir instalado. Los dispositivos vinculados pueden requerir reconexión. Mensajes enviados desde API pueden causar tarifas; los mensajes desde la App mantienen su régimen habitual.

## Pruebas de aceptación
- Negación por cabecera inexistente/malformada; secreto ausente => 503; sin datos de clientes en logs.
- Rechazo de WABA y Phone Number ID no verificados y de cualquier `tenant_id` inventado en el payload; mensajes desconocidos no crean contactos.
- Duplicados no insertan nuevamente; ecos tienen `direction='outbound'` y `sender_type='external'`.
- Verificación visual por propietario y vendedor con acceso restringido, sin contaminación de Look Social Media ni otras empresas.
- Certificar permisos, suscripción, recepción, y seguridad antes de desplegar a producción.

# Pasarela SMS (httpSMS) — CRM multiempresa / piloto Family Power

Estado: **implementación propuesta en rama; INACTIVA hasta verificación**.
Repositorio del proveedor: https://github.com/NdoleStudio/httpsms (AGPL-3.0).
Usamos su **API pública**, sin copiar ni modificar código del proyecto en el CRM.

## Alcance incluido

- Tarjeta de SMS en Integraciones (CRM general y vista compacta de Family Power).
- Solicitud de una línea SMS mediante el CRM: se registra como **desconectada**.
- Rutas verificadas por servidor y asociadas a un tenant/canal mediante `sms_gateway_routes`.
- Respuestas SMS manuales desde la bandeja de Conversaciones, solo para contactos existentes
  que enviaron un SMS en los últimos 30 días. No incluye campañas ni envíos automáticos.
- Webhook httpSMS con JWT HS256, eventos de recepción, envío, entrega y fallo.
- Dedupe por ID de CloudEvent e idempotencia por `clientRequestId`.
- Si el contacto entrante no existe, **no** se crea automáticamente un cliente ni se cruza a otro tenant.
- Palabras STOP/BAJA/CANCELAR recibidas bloquean respuestas posteriores de ese contacto.
- Clave API y secreto de firma únicamente en secretos de Supabase.

## Secuencia de publicación, sin activación accidental

1. Revisar PR, ejecutar CI y corregir fallos antes de fusionar. **No desplegar directamente desde esta rama.**
2. Aplicar la migración `20261102150000_httpsms_tenant_gateway.sql` en entorno de prueba,
   revisar RLS, funciones con SECURITY DEFINER y permisos. Confirmar consultas de control.
3. Desplegar `httpsms-send` con `verify_jwt=true` y
   `httpsms-webhook` con `verify_jwt=false` (el proveedor usa un JWT propio HS256,
   que la función valida con `HTTPSMS_WEBHOOK_SIGNING_KEY`).
4. Configurar secretos **en Supabase**, nunca en el navegador, DB pública ni GitHub:
   - `HTTPSMS_API_KEY`: clave de cuenta de httpsms.com/settings, NO la API key exclusiva del teléfono.
   - `HTTPSMS_WEBHOOK_SIGNING_KEY`: secreto aleatorio de al menos 32 caracteres, idéntico al configurado
     en el webhook de httpSMS.
   - `HTTPSMS_OUTBOUND_ENABLED=false` (por defecto).
   - `HTTPSMS_WEBHOOK_ENABLED=false` (por defecto).
5. El administrador de Family Power registra su línea en **Integraciones > Mensajes SMS**.
   El canal queda `disconnected`; esto **no verifica su propiedad**.
6. Un operador de plataforma verifica titularidad, SIM, operador, autorización del cliente y
   condiciones para mensajería empresarial. Vincula **solo mediante servidor de confianza**
   el canal `sms` de Family Power con su `sender_e164` en `sms_gateway_routes`.
   El registro nace con `enabled=false` y `verified_at=null`.
7. Tras prueba validada y aprobación, el operador asigna `verified_at`, `enabled=true`
   y `channels.status='connected'` usando autorización de servicio.
   Nunca otorgar estas escrituras al frontend.
8. Configurar en httpSMS la URL
   `https://<SUPABASE_PROJECT>.supabase.co/functions/v1/httpsms-webhook`,
   el secreto HS256 y los eventos `message.phone.received`,
   `message.phone.sent`, `message.phone.delivered`, `message.send.failed`
   y `message.send.expired`. Habilitar `HTTPSMS_WEBHOOK_ENABLED=true` para la prueba.
9. Crear un contacto de prueba **autorizado** con su número exactamente en E.164,
   recibir primero un SMS desde ese contacto, abrir la conversación en Family Power
   y efectuar una respuesta manual. Verificar ID de proveedor, estado entregado y
   `tenant_id` en todos los registros. Luego habilitar `HTTPSMS_OUTBOUND_ENABLED=true`
   solo si la prueba y el control de costo se aprueban.
10. Pruebas de seguridad: JWT inválido, otro tenant, sender alterado, duplicado, STOP/BAJA,
    usuario sin rol, Android desconectado, fallo/timeout, límite diario y entrega tardía.
    Si algo falla, mantener desactivado.

## Límites conocidos

- Las respuestas requieren una conversación SMS iniciada por un contacto existente;
  contactos desconocidos se dejan sin asociar para revisión, no se crean automáticamente.
- Solo respuestas humanas; sin campañas, IA automática, ni números arbitrarios del navegador.
- Se limita a **20 envíos por tenant por 24 horas** como piloto. Revisar seguridad y tarifa de
  SMS del operador antes de ampliar el cupo.
- Una respuesta HTTP aceptada por httpSMS no garantiza entrega del SMS.
- El proveedor puede notificar entrega antes de que el API persista el ID; verificar este
  caso durante QA y desarrollar reconciliación si aparece.
- El webhook exige `HTTPSMS_WEBHOOK_SIGNING_KEY` de mínimo 32 caracteres y autorización JWT.
  No confiar en el cuerpo del evento para identificar al tenant.
- Family Power pertenece al **CRM general multiempresa** en este piloto; no modificar
  el proyecto separado `angelberiguete-pixel/family-power-crm` ni su Supabase.
- Envíos SMS sujetos a consentimiento del cliente y términos del operador móvil.

## Criterios de aceptación

- Administrador de Family Power ve SMS como `Sin conectar` antes de configurar.
- Puede registrar solicitud, pero **no** habilitar el envío ni proporcionar credenciales.
- Un usuario de otra empresa no ve ni envía usando la línea de Family Power.
- Solo se envía con credenciales y ruta verificadas, sesión autenticada, rol autorizado,
  contacto correcto y mensaje entrante reciente.
- El mismo `clientRequestId` no produce dos envíos; si el proveedor es ambiguo, no se reintenta ciegamente.
- Respuestas y estados figuran en Conversaciones y no mezclan datos entre empresas.
- Producción permanece sin modificaciones hasta fusionar, migrar, desplegar y realizar QA real.

# PayPal Live API · CRM / Family Power

## Estado
- Receptor real desplegado: `https://ygipjqgyreeahslzorik.supabase.co/functions/v1/paypal-billing`
- Base de datos: migraciones `20261107081500_family_power_billing_portal.sql` y `20261108070500_paypal_api_reconciliation.sql`.
- Factura registrada: `INV2-HSYZ-R25Y-C89A-XNJ5`, número 0002, total USD 197.
- No se crea un cobro ni se activa una suscripción al desplegar esta función.
- Estado LIVE autenticado: **pendiente hasta configurar secretos de aplicación y webhook en Supabase**.

## Configurar las credenciales sin pegarlas en chat ni GitHub
1. En PayPal Developer > Apps & Credentials > **Live**, abrir tu aplicación REST (p. ej., «Angel Beriguete Payments»), comprobar que corresponde a la cuenta PayPal Business que emitió la factura 0002.
2. Copiar **Client ID Live** y **Client Secret Live** al administrador de secretos de Supabase (Edge Functions > Secrets) del proyecto principal del CRM: `ygipjqgyreeahslzorik`.
3. Registrar estas cuatro variables:
   - `PAYPAL_CLIENT_ID` = Client ID (Live)
   - `PAYPAL_CLIENT_SECRET` = Client Secret (Live)
   - `PAYPAL_ENVIRONMENT` = `live`
   - `PAYPAL_WEBHOOK_ID` = ID real del webhook registrado para esta aplicación
4. Crear el webhook en la misma aplicación PayPal Live con URL **exacta**:
   `https://ygipjqgyreeahslzorik.supabase.co/functions/v1/paypal-billing`
   Suscribir al menos `INVOICING.INVOICE.PAID`. Guardar el ID del webhook de la aplicación Live como `PAYPAL_WEBHOOK_ID`.
5. El webhook de Supabase debe conservar `verify_jwt=false` porque PayPal no envía un JWT de usuario. La función implementa validación de firma mediante `/v1/notifications/verify-webhook-signature` antes de actuar.
6. Para validar sin cobrar doble, entrar al portal autorizado `/crm/pagos` y pulsar **Comprobar pago en PayPal**. La función consultará `GET /v2/invoicing/invoices/{id}`; solo el estado **PAID** y un importe/currency correctos actualizarán el CRM. La factura pendiente permanecerá pendiente si PayPal aún no confirma pago.

## Reglas de seguridad
- El código del navegador usa solamente la clave pública Supabase y el JWT del usuario; no tiene claves PayPal.
- No poner Client Secret o service role en `NEXT_PUBLIC_*`, GitHub, documentación, logs o capturas.
- La Edge Function utiliza secretos del entorno y la clave de servicio del propio proyecto Supabase.
- La acción `sync` comprueba que el usuario puede leer esa factura bajo RLS.
- Webhook y acción `sync` nunca aceptan “pagué” como prueba. Consultan PayPal.
- Los pagos en efectivo o transferencia siguen necesitando conciliación por el propietario de la plataforma.
- El RPC de conciliación solo puede ejecutarlo `service_role`; normal `authenticated`/anon no tienen permiso.
- La conciliación es idempotente: no duplica pagos ya confirmados, y remite las conciliaciones parciales a revisión manual.

## Suscripción mensual USD 80
- El CRM configura USD 80/mes **después** de que PayPal confirme el pago inicial.
- Falta crear un plan recurrente PayPal autorizado por el cliente y asociar su `subscription_id`. El solo ajuste de precio del CRM **no activa débitos automáticos**.
- Se requiere consentimiento expreso del cliente para activar pagos periódicos.
- Si se utiliza facturación mensual manual, crear las nuevas facturas y links PayPal por cada período antes de reclamar su pago.

## Diagnóstico
- Si `/crm/pagos` dice integración no configurada, confirmar que los 4 secretos existen en Supabase y que el cliente usa credenciales **Live**.
- Una credencial **Sandbox** no puede consultar la factura Live 0002.
- Si PayPal dice 403, confirmar que la app tenga permisos de Invoicing y que esté vinculada a la cuenta emisora.
- Los webhooks simulados de PayPal no son compatibles con el endpoint remoto de postback para verificar firma; probar eventos reales en Sandbox con el webhook apropiado.
- Los webhooks PayPal sin firma válida devuelven HTTP 401 y nunca modifican facturas.

Documentación oficial:
- https://developer.paypal.com/api/invoicing/v2/
- https://developer.paypal.com/api/rest/webhooks/rest/
- https://supabase.com/docs/guides/functions/secrets

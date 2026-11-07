# PayPal → CRM/ARM — implementación segura de Sandbox (7 noviembre 2026)

**Estado: CÓDIGO EN PR, NO desplegado ni conectado.** Incluye endpoints servidor, ledger SQL versionado y validaciones unitarias. No se ha creado cuenta merchant, ni credenciales, ni conectado PayPal, ni ejecutado la migración. No hay cobros reales.

## Alcance empresarial
Se integra **al CRM existente**, reutilizando `billing_invoices`, `billing_payments` y `billing_events` para facturas de licencia y servicios, inicialmente con **Ángel Berigüete como prestador y beneficiario legal**. La marca Look Social Media no se presenta como una sociedad jurídicamente constituida.

Los pagos de productos/servicios propios de Family Power y futuros clientes requieren una identidad comerciante PayPal distinta autorizada. Este adaptador NO enruta ingresos de esos tenants a la cuenta de Ángel, ni activa onboarding de marketplace o multi-vendedor.

## Cambios reales incorporados a la rama
- `lib/paypal-checkout.ts`: OAuth Sandbox, Orders v2, importe USD centavos exacto, idempotencia `PayPal-Request-Id`, respuesta a URL de aprobación validada, verificación de firma del webhook por postback y evaluación estricta del evento `PAYMENT.CAPTURE.COMPLETED` (orden, comercio, importe, moneda).
- `lib/paypal-crm-server.ts`: solo servidor, denegación por defecto, **prohíbe usar la base de datos de producción en Sandbox** y bloquea ejecución desde despliegues `VERCEL_ENV=production`. Usa exclusivamente una base Supabase de pruebas **distinta**, con claves separadas. Autenticación del usuario y lectura de la factura con RLS existente.
- `app/api/paypal/orders/route.ts`: con JWT de administrador de tenant y una factura `billing_invoices` abierta, `provider=manual`, USD, sin pagos parciales, crea orden PayPal en Sandbox. Persiste la orden en el ledger de pruebas antes de ofrecer el enlace. No acepta monto ni empresa desde el navegador.
- `app/api/paypal/capture/route.ts`: con factura autorizada y orden existente vinculada, solicita captura Sandbox; devuelve **pendiente de webhook** y no simula pago exitoso.
- `app/api/paypal/webhook/route.ts`: firma verificada en PayPal Sandbox, deduplicación, conciliación a partir del mapping servidor de order→tenant→invoice. No confía en referencias de la notificación sin cotejarlas.
- `supabase/migrations/20261107090000_paypal_sandbox_checkout_ledger.sql`: tabla `paypal_checkout_orders`, RLS, sin permisos de usuario final, FK tenant+invoice, UNIQUE IDs, y RPC `apply_verified_paypal_capture` restringida a `service_role` para actualizar pago, factura, evento y orden de forma atómica.
- Pruebas `tests/paypal-checkout.test.mjs` y workflow de CI.

## Condiciones para probar realmente
1. Confirmar titular de la cuenta PayPal Business y elegibilidad para cobros en República Dominicana.
2. Clonar un dataset de pruebas aislado de producción y aplicar **allí exclusivamente** la migración después de revisión. Usar datos ficticios/anonimizados y un usuario de pruebas autorizado.
3. Crear una app PayPal Sandbox y verificar merchant ID, PayPal return/cancel URLs y webhook ID oficial. Configurar credenciales solo como secretos de servidor:
   - `PAYPAL_MODE=sandbox`
   - `PAYPAL_ARM_SANDBOX_ENABLED=true`
   - `PAYPAL_SANDBOX_CLIENT_ID`, `PAYPAL_SANDBOX_CLIENT_SECRET`
   - `PAYPAL_SANDBOX_MERCHANT_ID`, `PAYPAL_SANDBOX_WEBHOOK_ID`
   - `PAYPAL_SANDBOX_RETURN_URL`, `PAYPAL_SANDBOX_CANCEL_URL`
   - `PAYPAL_SANDBOX_SUPABASE_URL`, `PAYPAL_SANDBOX_SUPABASE_PUBLISHABLE_KEY`, `PAYPAL_SANDBOX_SUPABASE_SERVICE_ROLE_KEY` (staging, jamás credenciales del Supabase actual `ygipjqgyreeahslzorik`).
4. Crear factura de prueba `billing_invoices` en USD, `status=open`, `provider=manual`, sin pagos parciales. Usuario administrador llama a `POST /api/paypal/orders` con Bearer y `{invoiceId}`, aprueba en PayPal Sandbox y completa `POST /api/paypal/capture` con JWT. Un webhook firmado valida y reconcilia. Verificar retries, doble captura, reembolsos, diferencias de monto, usuario sin permisos y tenant vecino.
5. Añadir interfaz de Cobros/Facturación, retornos HTTPS a la UI, estado visible y seguimiento de reembolsos/contracargos; esta interfaz todavía no está implementada. No lanzar Live sin autorización y QA.

## Moneda
El listado de monedas en PayPal REST Checkout no incluye `DOP`. Una cotización RD$75,000 o RD$12,000 no debe convertirse automáticamente a USD. Obtener y aprobar cotización de conversión, incluir moneda e importe acordado, fees y política de cambio antes de enviar cobros PayPal.

## Restricciones y pendientes
- **Producción no alterada:** PR en borrador, sin fusionar, sin aplicar SQL, sin secretos configurados, sin despliegue productivo.
- No enlaza una cuenta real PayPal. No certifica que el comerciante reciba fondos.
- No existe todavía pantalla de pago integrada ni prueba E2E con PayPal Sandbox.
- El módulo está limitado a facturas USD de licencia emitidas por el prestador configurado; no admite marketplace, multi-merchant de clientes, pagos parcializados ni suscripciones automáticas.
- Para reembolsos, pagos pendientes, contracargos y disputas, añadir conciliación contable posterior (NO activar renovaciones/cancelaciones automáticas hasta tenerla).
- Las llamadas por HTTP y los estados DB deben pasar pruebas integrales, además del typecheck y unit tests.

## Documentación oficial
- https://developer.paypal.com/api/rest/integration/orders-api
- https://developer.paypal.com/api/rest/webhooks/rest/
- https://developer.paypal.com/api/codes/currency/
- https://developer.paypal.com/api/make-api-requests
- https://developer.paypal.com/platforms/seller-onboarding/

Esta entrega es una base operacional en modo Sandbox **deshabilitada** hasta infraestructura y autorización. Jamás presentar el pago como cobrado por existir una orden, callback o respuesta HTTP 200.

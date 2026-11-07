# PayPal → CRM/ARM — adaptador inicial (7 noviembre 2026)

**Estado real: sandbox-only, módulo backend y pruebas. No hay cobro activo, checkout público ni credenciales, y no se cambia producción.**

## Objetivo y estructura
Integrar PayPal en el CRM **existente**, reutilizando `billing_invoices`, `billing_payments` y `billing_events`. La primera vía prevista es pagar facturas de uso/licencia del CRM emitidas por el **prestador legal correcto: Ángel Berigüete**, y no por una sociedad Look Social Media inexistente.

Para que los negocios clientes (Family Power y futuros tenants) cobren sus propios productos, deben vincular **sus propios** comerciantes PayPal, onboarding legal, cuentas y credenciales, con aislamiento estricto. No agrupar ni desviar pagos de una empresa a Ángel; no asumir la función de marketplace, agregador o intermediario.

## Código incorporado
`lib/paypal-checkout.ts` incluye:
- validación de configuración **solo sandbox** y denegación por defecto;
- conversión monetaria exacta de enteros `amount_due_cents` (sin errores de punto flotante);
- constructor Orders v2 con importe y moneda tomados de factura verificada del servidor;
- OAuth sandbox y creación de orden sandbox, `PayPal-Request-Id` fijo por factura para idempotencia y comprobación de URL de aprobación legítima;
- validación estricta de cabeceras webhook y verificación postback contra PayPal sandbox;
- validación de evento `PAYMENT.CAPTURE.COMPLETED` frente a cuenta receptora, orden enlazada, importe, moneda y estado de factura;
- solo evaluación: NO produce un cambio de estado contable en la BD.

`tests/paypal-checkout.test.mjs` cubre seguridad, importes, moneda, repetición, phishing de redirect, falsificación de webhook, identidad de comercio y discrepancia de pago.

## Requisitos ANTES de abrir checkout real
1. Confirmar titular del comercio PayPal, elegibilidad y cuenta Business para la República Dominicana. La propia cuenta PayPal del titular será la beneficiaria según el contrato.
2. **Moneda:** PayPal REST Checkout no muestra DOP en sus códigos de pago admitidos. No convertir automáticamente RD$ a USD. Una factura pactada en DOP solo puede pagarse en PayPal si se hace una cotización explícita, se aprueba el tipo de cambio/importe en USD y se guarda trazabilidad; de lo contrario, denegar.
3. Crear cuenta de desarrollador y una app **sandbox** en https://developer.paypal.com/dashboard/applications/sandbox. Mantener `PAYPAL_SANDBOX_CLIENT_ID`, `PAYPAL_SANDBOX_CLIENT_SECRET`, `PAYPAL_SANDBOX_WEBHOOK_ID`, `PAYPAL_SANDBOX_MERCHANT_ID` en variables de servidor y nunca en `NEXT_PUBLIC_*`, frontend o commits. `PAYPAL_MODE=sandbox` y `PAYPAL_ARM_SANDBOX_ENABLED=true` **solamente en ambiente de pruebas**; no habilitarlo sobre una instancia de clientes.
4. Crear ledger transaccional de `paypal_order_id`, `invoice_id`, `tenant_id`, identidad de comercio, estado, monto y moneda. Agregar políticas RLS y constraints antes de exponer órdenes, capturas o webhooks.
5. Endpoint de inicio: comprobar JWT real, propietario/admin del tenant factura, RLS y existencia de `billing_invoices.status=open`; PayPal solo recibe monto desde la BD. Persistir orden+approval URL antes de presentarla al cliente.
6. Endpoint de captura: no confiar en `?orderId` de la URL del comprador como prueba de pago. Validar orden en ledger, crear captura con `PayPal-Request-Id` y verificar contra PayPal; reconciliar mediante webhook y consulta de estado.
7. Webhook: autenticar cryptográficamente; exigir `PAYMENT.CAPTURE.COMPLETED` y captura real; `UNIQUE(provider,event_id)` en `billing_events`; dedupe con ledger y reconciliar transaccionalmente `billing_payments` y `billing_invoices`. Los eventos PENDING/DECLINED/REFUNDED/DISPUTED no marcan ninguna factura pagada, y reembolsos/reversiones exigen ajuste contable.
8. Crear UI del módulo **Facturación / Cobros** con estado verificable, conciliación, control de errores y auditoría. No permitir envío automático de links de pago hasta aprobar marca, importe y destinatario.
9. Test end-to-end usando comprador/comercio PayPal sandbox: crear orden → aprobar → capturar → recibir webhook firmado → verificar importe y merchant → conciliar → reintentar sin duplicados → reembolso/disputa → aislamiento de dos tenants.

## Recursos oficiales
- https://developer.paypal.com/api/rest/integration/orders-api
- https://developer.paypal.com/api/rest/webhooks/rest/
- https://developer.paypal.com/api/codes/currency/
- https://developer.paypal.com/api/make-api-requests
- https://developer.paypal.com/platforms/seller-onboarding/

**Seguridad:** Sin credenciales, ni ejecución ni cobros. Sin habilitación de Live. No se modifica ni se aplica ninguna migración a producción.

# PayPal Orders v2 — CRM general / Empresia ERP
Estado: **implementado en rama de desarrollo, NO habilitado en producción**.

## Arquitectura
1. Un administrador de la empresa inicia `POST /api/paypal/create-order` con JWT Supabase válido y JSON `{"orderId":"<uuid>"}`.
2. `crm_paypal_prepare_order` verifica membresía activa, empresa activa, orden elegible y saldo pendiente; **no admite importe enviado por el navegador**.
3. El servidor crea una orden PayPal Orders v2, usando `PayPal-Request-Id` estable para reintentos, guarda su `paypal_order_id` y devuelve `approvalUrl` para compartir.
4. El cliente aprueba en PayPal. El webhook HTTPS `/api/paypal/webhook` verifica la firma contra PayPal antes de aceptar cualquier evento.
5. `CHECKOUT.ORDER.APPROVED` dispara captura API autenticada con clave idempotente.
6. Solo un `PAYMENT.CAPTURE.COMPLETED` **firmado**, con `merchant_id`, orden, moneda e importe coincidentes, ejecuta el RPC transaccional `crm_paypal_apply_capture`: incrementa el importe pagado, inserta `customer_payments`, bloquea duplicados e inserta un evento en `crm_paypal_erp_outbox`.
7. El despacho interno protegido `GET /api/internal/paypal/dispatch` envía eventos firmados con HMAC al módulo `EmpresiaPayPal` de Dolibarr; este almacena cada captura como `pending_mapping`. **No crea asiento contable ni paga una factura de Dolibarr automáticamente** hasta instalar y verificar el mapeo.

## Variables de entorno (servidor únicamente)
- `CRM_PAYPAL_SUPABASE_URL`: URL del proyecto CRM Supabase correcto.
- `CRM_PAYPAL_SUPABASE_PUBLISHABLE_KEY`: llave pública del mismo proyecto.
- `CRM_PAYPAL_SUPABASE_SERVICE_ROLE_KEY`: llave privilegiada, **solo en servidor**.
- `PAYPAL_MODE=sandbox` inicialmente; cambiar a `live` solo tras revisión.
- `PAYPAL_CLIENT_ID`: REST App Client ID del modo correspondiente.
- `PAYPAL_CLIENT_SECRET`: secreto REST App; no es contraseña de PayPal.
- `PAYPAL_WEBHOOK_ID`: identificador del webhook de esa REST App.
- `PAYPAL_MERCHANT_ID`: PayPal merchant ID que recibirá los pagos.
- `PAYPAL_PUBLIC_BASE_URL`: dominio HTTPS del CRM, por ejemplo el dominio propio desplegado.
- `PAYPAL_ALLOWED_TENANT_ID`: **una sola empresa autorizada** para estos credenciales comerciales. No habilitar otros tenants: PayPal enviaría el dinero al merchant de esta app.
- `CRM_PAYPAL_RELAY_CRON_SECRET`: token de acceso al despachador interno.
- `EMPRESIA_PAYPAL_BRIDGE_URL`: URL HTTPS del `/custom/empresiapaypal/ingest.php` **desplegado**.
- `EMPRESIA_PAYPAL_BRIDGE_SECRET`: clave HMAC larga de 32+ caracteres, igual en CRM y ERP.
- En el host Dolibarr: `EMPRESIA_PAYPAL_TENANT_ID` igual a la empresa autorizada y `EMPRESIA_PAYPAL_ENTITY` entidad destino, configurada en servidor.

**Nunca** usar `NEXT_PUBLIC_` para secretos, pegar credenciales en un repositorio público, ni deducir una empresa por un `tenant_id` recibido de un cliente sin autenticación.

## Endpoints y eventos
- `POST /api/paypal/create-order`: solo administradores con JWT; responde con `approvalUrl`.
- `POST /api/paypal/webhook`: PayPal REST App. Registrar webhook con eventos:
  - `CHECKOUT.ORDER.APPROVED`
  - `PAYMENT.CAPTURE.COMPLETED`
  - `PAYMENT.CAPTURE.PENDING`
  - `PAYMENT.CAPTURE.DENIED`
- `GET /api/internal/paypal/dispatch`: requiere `Authorization: Bearer <CRM_PAYPAL_RELAY_CRON_SECRET>`; **no programado aún**.
- `POST /custom/empresiapaypal/ingest.php` (Dolibarr): solo eventos de relay firmados; no registrar como webhook directo de PayPal.

## Precondiciones de lanzamiento
1. **No aplicar la migración automáticamente a producción.** Probar `supabase/migrations/20261107030000_paypal_checkout_foundation.sql` primero en un proyecto aislado y revisar RLS, trigger de automatizaciones y permisos de las funciones.
2. En PayPal Developer, crear REST App **Sandbox**, disponer de merchant sandbox y buyer sandbox, registrar URL webhook HTTPS y copiar los cuatro identificadores correctos. La conexión de PayPal con ChatGPT no equivale a claves REST para Vercel.
3. Asegurar que la cuenta puede recibir pagos comerciales en el país de la empresa y en las monedas seleccionadas. DOP no está habilitado en este primer checkout; no se aplica conversión FX implícita.
4. Aprobar una orden ficticia de USD 1.00 (o más si PayPal lo exige) y comprobar una única inserción en `customer_payments`, que el importe no cambia con payload adulterado, y que el segundo webhook no vuelve a cobrar.
5. Repetir con un usuario de otro tenant, usuario sin permisos, evento sin firma, payload de otra moneda, Merchant ID distinto, duplicados y fallos temporales.
6. Instalar y activar el módulo `EmpresiaPayPal` en Dolibarr, configurar HTTPS+HMAC, probar recepción y reintentos, y comprobar que no contabiliza sin mapeo de factura.
7. Revisar reembolsos, disputas y pagos parciales; **NO se contabilizan automáticamente en esta versión**. El modelo actual admite una transacción PayPal por orden; los pagos parciales y reintentos posteriores a una denegación requieren evolución del ledger.
8. Añadir un botón/flujo de cobro protegido en la interfaz de pedidos y una pantalla de estado. Las rutas API de esta rama no implican que la UI exista.
9. Ejecutar `node --experimental-strip-types --test tests/paypal-core.test.mjs`, `npm run typecheck` y `npm run build`, además de E2E y validaciones de dos empresas, antes de fusionar o desplegar.
10. Configurar ejecución periódica y observabilidad del relay. No marcar la sincronización ERP como completada mientras el inbox de Dolibarr permanezca en `pending_mapping`.

## Limitaciones y seguridad
- La integración apunta a **un solo merchant**. Para vender PayPal en nombre de varios clientes se necesitan credenciales/autoridades por negocio y, según el caso, onboarding autorizado de cuentas comerciantes mediante PayPal.
- El módulo PayPal incluido con Dolibarr usa su propio esquema de credenciales de su versión; no copiar ciegamente Client ID/secret de Orders v2 en campos de API Classic.
- No usar el historial PayPal como sustituto de conciliación contable o confirmación bancaria.
- PayPal firma webhooks; la verificación de esta rama utiliza el endpoint oficial de postback, no los datos del navegador.
- Si una factura está en DOP, el pago debe ocurrir tras una cotización/cambio de moneda explícito, documentado, y un pedido denominado en la divisa del cobro.

Fuentes oficiales:
- https://developer.paypal.com/api/rest/integration/orders-api
- https://developer.paypal.com/api/rest/webhooks/rest
- https://developer.paypal.com/api/make-api-requests

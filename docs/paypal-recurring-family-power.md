# PayPal Subscriptions v1 · Family Power y ARM general

## Contrato comercial

- Factura de implementación **0002 / US$197**: debe confirmarse como pagada antes de la suscripción.
- Mensualidad **US$80**, período **1 MONTH**, sin setup fee adicional en este plan.
- Primera cuota periódica: fecha `tenant_subscriptions.current_period_end` guardada por el CRM tras confirmar el pago inicial. No se asume que se cobra automáticamente el mismo día de la implementación.
- El cliente aprueba personalmente la suscripción en PayPal. Un `APPROVAL_PENDING`, un retorno del navegador o un enlace NO indican pago.
- El enlace manual `PLB-CAHFX5WVEL52` **no es una suscripción**; no usarlo como renovación adicional cuando se haya activado el plan automático.

## Componentes

1. `supabase/functions/paypal-subscriptions/index.ts`: `POST` para aprovisionar un plan, preparar autorización y procesar webhooks firmados. **Nuevo endpoint**, NO reemplaza `paypal-billing`, que reconcilia la factura de implementación.
2. `components/platform-billing-reviews.tsx`: botón de creación de producto/plan exclusivo del propietario de la plataforma (permiso RLS comprobado también en servidor).
3. `components/family-power-billing-portal.tsx`: el administrador autorizado solicita aprobación, y el comprador completa el consentimiento en paypal.com.
4. `public.billing_gateway_plans`, `tenant_subscriptions`, `billing_provider_events`: tablas ya existentes. No crear otras tablas ni alterar suscripciones de otros tenants.
5. La función `crm_record_verified_billing_event` almacena eventos firmados con idempotencia. **No acredita dinero ni crea factura mensual por sí sola**. Para reflejar ingresos en el panel financiero todavía requiere reconciliación de transacciones y contabilización con ERP.

## Configuración obligatoria (sin pegar secretos en chat o GitHub)

Proyecto Supabase del CRM: `ygipjqgyreeahslzorik`. Desplegar `paypal-subscriptions` con `verify_jwt=false`; el código verifica JWT de usuario o firma PayPal en cada ruta.

Variables del entorno Edge:
- `PAYPAL_ENVIRONMENT`: `sandbox` para pruebas; `live` solo cuando el comerciante esté autorizado.
- `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`: REST app de la **misma cuenta PayPal Business de Ángel Berigüete** que recibe la factura 0002.
- `PAYPAL_SUBSCRIPTIONS_WEBHOOK_ID`: ID del webhook REST creado para la app y entorno elegidos (distinto al de facturas si hay dos URLs).
- `PAYPAL_SUBSCRIPTIONS_ENABLED`: configurar exactamente `true` **solo después** de revisar Sandbox, Live, permisos y webhooks; sin esta variable no se crea ningún plan ni autorización recurrente.
- `PAYPAL_RETURN_ORIGIN` (opcional): solo se admiten `https://crm-revenue-os.vercel.app` y `https://crm-look.vercel.app`; el primero es predeterminado.
- Supabase agrega sus propias claves de servidor `SUPABASE_URL`, `SUPABASE_ANON_KEY`/`SUPABASE_PUBLISHABLE_KEYS` y `SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_SECRET_KEYS`.

Registrar webhook con URL exacta:
`https://ygipjqgyreeahslzorik.supabase.co/functions/v1/paypal-subscriptions`

Eventos necesarios:
- `BILLING.SUBSCRIPTION.ACTIVATED`
- `BILLING.SUBSCRIPTION.CANCELLED`
- `BILLING.SUBSCRIPTION.EXPIRED`
- `BILLING.SUBSCRIPTION.SUSPENDED`
- `BILLING.SUBSCRIPTION.PAYMENT.FAILED`
- `PAYMENT.SALE.COMPLETED`

## Operación

1. Administrador principal abre el módulo de conciliación de Family Power y pulsa **Crear plan mensual en PayPal** (acción `provision_plan`). Solo es posible cuando la fila de catálogo está `pending`.
2. El servidor obtiene credencial OAuth, crea `SERVICE` en Catalog Products, crea el plan fijo USD80 y verifica por GET que esté **ACTIVE** y tenga precio e intervalo correctos. Cada solicitud tiene clave `PayPal-Request-Id` persistente derivada del UUID de catálogo.
3. El cliente paga primero la factura 0002. El verificador de facturas PayPal o la conciliación administrativa comprobada actualiza `billing_invoices`. El CRM configura el período siguiente y los 8000 centavos.
4. El administrador autorizado de la empresa pulsa **Preparar autorización de US$80/mes**. El servidor valida sesión, rol, tenant activo, factura 0002 pagada, plan, precio y fecha, y crea UNA solicitud de autorización con fecha futura.
5. El comprador revisa en PayPal el precio y período y acepta (o rechaza). No se marca abonado un período hasta recibir evidencia verificable.
6. PayPal remite eventos. El servidor verifica firma por API y consulta la suscripción remota, confirma el plan y registra eventos idempotentes. No acredita el dinero basándose solo en un redirect.

## Aislamiento y fallos

- El primer caso admite únicamente el tenant `family-power`; la función nunca acepta un importe o plan arbitrario desde el navegador.
- Las rutas de usuario validan el JWT y `list_my_tenants` con rol `owner/admin`. El aprovisionamiento exige además la política RLS de propietario de plataforma.
- Las llamadas de creación de producto/plan se bloquean con transición atómica de `pending -> provisioning`. Si queda `error`, **no reintentar automáticamente**: comprobar PayPal y reconciliar recursos primero.
- Una solicitud de suscripción en estado `awaiting_buyer` sin ID almacenado representa resultado incierto: revisar PayPal antes de reintentar.
- Nunca aceptar datos de tarjetas, contraseñas ni secretos en el frontend.
- No activar cobro a terceros ni distribuir dinero de Family Power con credenciales de Ángel. Este acuerdo es factura de Ángel a Family Power por servicios de software.

## Pruebas antes de Live

- `node --test tests/paypal-recurring-contract.test.mjs tests/family-power-paypal-approval.test.mjs`
- `deno check supabase/functions/paypal-subscriptions/index.ts`
- Sandbox: dos empresas, firma webhook válida/alterada, mismos eventos repetidos, intento sin sesión, rol restringido, factura impaga, plan de importe distinto, retorno cancelado, período futuro, pago fallido.
- Verificar cobro real **solo con autorización del titular y del comprador**. No generar suscripciones Live en la auditoría.
- Validar requisitos de cuenta, tasas y si Subscription API está habilitada para el merchant.

Fuentes oficiales: https://developer.paypal.com/api/subscriptions/v1/ y https://developer.paypal.com/subscriptions/webhooks/ .

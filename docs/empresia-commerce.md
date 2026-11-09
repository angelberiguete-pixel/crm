# Empresia Commerce · Compra y suscripción reutilizables

## Qué se ha implementado
- Tienda pública: `/empresia/tienda`
- Checkout con autorización: `/empresia/checkout?offer=<slug>`
- Historial del comprador: `/empresia/mis-compras`
- Catálogo/monitor de ventas del propietario: `/empresia/comercio`
- Supabase Edge Functions: `empresia-commerce`, `paypal-billing`
- Precios en USD definidos por el propietario; ninguna oferta publicada por defecto.

## Pasos para vender un producto propio de Empresia
1. El propietario entra en `/empresia/comercio` con su cuenta autorizada.
2. Crea la oferta con precio real en USD. Se guarda como **borrador**.
3. Para mensualidades, pulsa «Crear plan PayPal», que registra un producto y plan Live en PayPal sin suscribir a nadie.
4. Pulsa **Publicar** tras revisar la descripción, precio y entrega.
5. El comprador abre `/empresia/tienda` y elige la oferta. Puede explorar sin registro.
6. Para pagar o suscribirse, crea o utiliza una cuenta de comprador de Supabase Auth.
7. La Edge Function crea una orden o suscripción con importe tomado únicamente de la base de datos. El comprador autoriza en PayPal.
8. Para pagos únicos, el servidor captura después de la aprobación; solo un resultado **COMPLETED** de PayPal actualiza la factura y el historial.
9. Para suscripciones, se registra ACTIVE después de consultar PayPal. El derecho digital se activa **solo al recibir un evento confirmado PAYMENT.SALE.COMPLETED**.
10. El comprador consulta `/empresia/mis-compras`; si su suscripción está activa, puede solicitar la cancelación a PayPal desde esa pantalla.
11. Los pedidos se contabilizan en el tenant de Empresia (`eurevector`); las empresas clientes no reciben dinero en su nombre ni comparten permisos bancarios.

## PayPal Developer Live: eventos obligatorios del webhook
Usar el webhook existente que apunta a:
`https://ygipjqgyreeahslzorik.supabase.co/functions/v1/paypal-billing`

Habilitar **All Events** o al menos:
- `INVOICING.INVOICE.PAID` para facturas anteriores, incluido Family Power.
- `PAYMENT.CAPTURE.COMPLETED` para compras únicas.
- `BILLING.SUBSCRIPTION.ACTIVATED`
- `BILLING.SUBSCRIPTION.CANCELLED`
- `BILLING.SUBSCRIPTION.SUSPENDED`
- `BILLING.SUBSCRIPTION.EXPIRED`
- `BILLING.SUBSCRIPTION.PAYMENT.FAILED`
- `PAYMENT.SALE.COMPLETED` para cuotas recurrentes.

No compartir el `PAYPAL_CLIENT_SECRET`; las cuatro credenciales Live siguen en Supabase Secrets.
No crear webhooks adicionales ni sustituir el identificador existente sin verificar el cambio.

## Comprobaciones de seguridad
- El importe proviene del catálogo publicado, no del formulario del comprador.
- No hay permisos SQL de INSERT/UPDATE para que un comprador se marque pagado, cree facturas ni se otorgue licencias.
- El servicio valida cada orden/captura con PayPal y reconcilia de forma idempotente.
- Un usuario autenticado solo ve sus propias órdenes y derechos de acceso (RLS).
- Una oferta con pedidos o publicada no puede cambiar precio, modalidad, plan ni condiciones de acceso.
- La creación de un plan no genera un cobro. El comprador debe autorizar su método de pago en PayPal.
- Family Power factura #0002 sigue completamente separada, no duplicar el cobro inicial.
- Los reembolsos, contracargos, devoluciones y disputas requieren integrar un flujo de reversión antes de lanzar entregas digitales irreversibles o accesos totalmente automáticos.
- El derecho de acceso digital registrado **no** sustituye la configuración técnica del producto. Cada módulo SaaS debe comprobar el derecho en su servidor antes de conceder acceso. Implementaciones asistidas quedan en `provisioning` para revisión por el propietario.
- Por ahora no se ofrece checkout de tarjeta guardada directamente en Empresia; el consentimiento se administra en PayPal y sus requisitos dependen del país y la cuenta del comprador.
- Registro DGII e-CF/factura fiscal no se realiza con la factura PayPal y requiere integración separada.

## Pendiente antes de considerar el circuito plenamente verificado
- Confirmar en PayPal Developer los eventos necesarios del webhook.
- Probar con una cuenta de comprador independiente (preferentemente Sandbox) y certificar el recorrido de aprobación, captura, pago conciliado y permiso de acceso.
- Probar cancelación, cobro recurrente, duplicados, pago denegado, reembolso, disputa y suspensión.
- Conectar la tabla `empresia_entitlements` con el middleware de acceso de cada producto.
- Configurar los productos reales y sus precios aprobados. Ninguna oferta ha sido creada automáticamente.

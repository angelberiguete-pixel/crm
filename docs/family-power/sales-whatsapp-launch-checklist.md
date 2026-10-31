# Family Power — Puesta en marcha WhatsApp y ventas verificadas
**Responsable de implementación:** Ángel Berigüete. **Empresa cliente:** Family Power, Dr. Emerson Familia. **Estado:** preparación técnica, sin conexión ni cobros confirmados.

## Inventario real
- El cliente menciona 70 inversores físicos. No asumir que sean 70 modelos; solicitar unidades por SKU, nombre de fabricante y fotos legibles del modelo/placa.
- La marca informada «Indu Electronic» y la aparente marca impresa «INDUETRONIC» aún necesitan cotejarse con factura/manual.
- Los documentos anteriores de octubre de 2026 solo contenían cinco fotografías y referencias preliminares no verificadas (1.5 kW, 3.6 kW). No usar esos datos como fichas listas.
- Cargar SKU, modelo exacto, stock real, precio y moneda en productos existentes. Subir la foto original (PNG/JPG/WebP) y ficha técnica oficial PDF a Archivos, con respaldo y revisión del propietario.
- Una RPC `crm_family_approve_product` coteja producto, precio positivo, stock y archivos privados listos; cualquier cambio de precio, nombre, SKU o stock anula esa aprobación.
- La IA puede orientar inicialmente en preguntas generales, pero **solo cotizar datos aprobados del catálogo**; nunca inventar especificaciones, garantías, autonomía o precio.

## Mensajería y documentos
- Coexistencia: primero vincular WhatsApp Business a **YCloud**, no a iCloud de Apple. El QR debe escanearlo el titular, sin compartir código ni acceso personal.
- Después del QR: verificar WABA y número real, ruta del tenant, webhook firmado, mensajes entrantes/salientes, delivery receipts, permisos de vendedor, historial visible en el panel y escalamiento a humano.
- El backend actual de YCloud recibe **texto** y envía **texto manual**. Aún faltan adapters seguros y pruebas de **media inbound** (foto de comprobante), **media outbound** (foto, PDF técnico y PDF de cotización), y envío por IA controlado; ni el PDF ni su envío están terminados.
- WhatsApp admite mensajes con imágenes/documentos, plantillas y ciertos botones. Para aprobación, utilizar el botón existente «Quiero aprobar», que genera una solicitud verificada; una confirmación contractual final debe ligarse al presupuesto, identidad del remitente, condiciones y consentimiento.
- Para cuentas bancarias, lo más simple y legible es texto separado por cuenta, para copiar desde WhatsApp. No inventar números. También se puede ofrecer página segura con botones de copia; una imagen por sí sola no ofrece controles fiables de copia.

## Ciclo controlado del negocio
1. Consulta → identificación y necesidad → bot o vendedor asignado.
2. Modelo aprobado → foto y PDF técnico oficiales → cotización y PDF.
3. Cotización recibida → botón de intención o solicitud de cambios → aceptación real registrada.
4. Cuentas autorizadas → el cliente envía comprobante → archivo privado en tenant.
5. Contabilidad / owner/admin comprueba movimiento bancario real y registra referencia; vendedores y la IA no aprueban.
6. Con pago total verificado, se registra venta y se crea un evento idempotente en outbox.
7. Meta Conversions API se conecta **después**, mediante cuentas autorizadas, consentimiento, eventos de prueba, atribución y deduplicación. Estado inicial de todos los eventos: `held` (NO enviado). Evitar contar oportunidades abiertas/cotizaciones como compra.

## Condiciones antes de demostrarlo en vivo
- Confirmación escrita del alcance, propiedad y acceso a WhatsApp, tratamiento de datos y responsabilidades de IA.
- Inventario, garantía y precios firmados por Family Power. Cuentas bancarias confirmadas por el propietario y controles contra cambio de destinatario.
- Revisión de SQL, ejecución en staging, tests reales con dos usuarios y prueba de conciliación con transacción de prueba autorizada; no crear venta real sin abono real.
- Autorización de proveedor de IA, límite de presupuesto, supervisión humana, prompt aislado por tenant y política de desactivación.
- Verificación de no duplicación de eventos Meta `Purchase` con identificador estable por orden.
- Separar plan de desarrollo del acuerdo verbal previo, que no aprobó automáticamente todo el alcance del CRM, la IA y las campañas.

**Definición de terminado:** la compra sólo aparece en métricas de ventas después de conciliación; la consola Meta sólo muestra evento de conversión transmitido cuando el proveedor lo acepte y se registre su ID/respuesta.

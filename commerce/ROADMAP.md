# Plan integral — Ángel Commerce / Ángel Academy / Estudio de servicios

**Objetivo:** vender a clientes finales, empresas y audiencias internacionales desde la misma identidad de marca, con PayPal como medio de cobro para productos y servicios propios. Cada dominio funcional debe tener estados operativos verificables, no solo pantallas.

## Núcleo común de la plataforma
1. Catálogo estructurado: servicios, productos digitales, cursos, membresías y productos físicos.
2. Cuentas: cliente y administrador; posteriormente instructor propio/colaborador con RBAC.
3. Precios y ofertas: moneda USD, EUR solo cuando se cree una oferta dirigida a Europa; reglas comerciales, impuestos cuando apliquen.
4. Cobros: PayPal Orders v2, captura, webhook verificado y conciliación. No confiar en el navegador para marcar pagado.
5. Acceso a contenidos: biblioteca privada, URLs firmadas temporales, revocación por devolución.
6. Operaciones: pedidos, brief de servicios, entregas, reclamaciones, facturación fiscal cuando corresponda.
7. Datos y observabilidad: productos vendidos, ingresos brutos, comisiones, ingreso neto, reembolsos, tasa de conversión, soporte.
8. Administración: crear/editar/publicar fichas, multimedia, disponibilidad, reportes.

## Verticales a desarrollar dentro de la misma base
- **Estudio de servicios:** CV, Excel, investigación, marketing, branding, traducción, video, sitios web, automatización, CRM/ERP, ecommerce, asesorías, inmobiliario, servicios administrativos. Necesita formulario de requisitos, asignación, entregables, revisiones, fecha límite.
- **Tienda digital:** ebooks originales, PDFs, calendarios, Excel, plantillas, Notion, Canva cuando la licencia lo permita, kits para emprendedores. Necesita control de versiones, vista previa, entrega en biblioteca y actualizaciones.
- **Ángel Academy:** cursos, talleres en vivo, videos, materiales, cuestionarios, lecciones, progresos, certificados opcionales. Necesita reproductor protegido, accesibilidad y derechos sobre material.
- **Membresías:** bibliotecas mensuales, soporte continuo, planes de contenido, licencias SaaS. Necesita PayPal Subscriptions, planes, renovaciones, cancelaciones, impagos y control de acceso al día.
- **Físicos bajo pedido:** regalos, impresos, productos de proveedores. Necesita inventario, confirmación de stock, dirección, tarifa de envío, seguimiento y devoluciones.
- **Agencias internacionales:** páginas y paquetes comerciales para hispanos de EE. UU., Puerto Rico, España y RD, con condiciones y atención por zona horaria.

## Fases con criterios de aceptación
### F0 — Fundación (código preparado; conexión pendiente)
- [x] Tienda con 15 ofertas de prueba y filtros.
- [x] API de PayPal con comprobación del importe del servidor, verificación de webhooks, protección de entregas.
- [x] Roles de administrador, tablas con RLS, bucket privado y biblioteca.
- [x] Despliegue Vercel de demostración.
- [ ] Instancia dedicada de Supabase, variables de entorno, alta de administrador y pruebas de pago Sandbox.

### F1 — Primera venta segura
- [ ] Crear 3 entregables reales de propiedad propia: plantilla, guía PDF, primer curso corto.
- [ ] Completar políticas comerciales, datos de contacto y requisitos del servicio.
- [ ] Registrar y verificar webhook PayPal Sandbox; ejecutar pagos, duplicados, reembolsos y límites de acceso.
- [ ] Habilitar cuenta Live tras pruebas y validación de disponibilidad.

### F2 — Servicios y operaciones
- [ ] Brief dinámico según servicio, recepción de archivos, panel de pedidos, asignación y revisión.
- [ ] Correos transaccionales y soporte postventa.
- [ ] CRM integrado vía API interna con autorización y trazabilidad.

### F3 — Academia completa
- [ ] Lecciones multimedia ordenables, progreso, cuestionarios, constancias y actualizaciones.
- [ ] Carga de video reanudable, optimización, protección razonable de acceso y analíticas.
- [ ] Dashboard de alumno y administración de cursos.

### F4 — Membresías y SaaS
- [ ] Productos y planes PayPal Billing API, estados de suscripción verificados.
- [ ] Portal de cancelación y renovación, periodos de gracia, conciliación y soporte.
- [ ] Acceso por nivel, permisos por plan y factura recurrente cuando corresponda.

### F5 — Físicos y escala comercial
- [ ] Carrito de múltiples artículos, stock real, envío, confirmación de proveedor y tracking.
- [ ] Automatización de email, referidos, SEO y campañas, embudos de ventas.
- [ ] Reportes de margen, coste de adquisición, impuestos y calidad del servicio.

## Límites comerciales
- No operar como pasarela o agregador de pagos para vendedores externos con la cuenta PayPal personal/Business sin revisar y cumplir las políticas aplicables.
- No cargar copias de material ajeno sin licencia.
- Evitar publicar y cobrar productos sin entrega verificable, alcance comercial definido y política de soporte.
- Los precios iniciales son hipótesis comerciales, no ventas aseguradas.

# Ángel Commerce — tienda y academia digital modular

Aplicación independiente en `commerce/`, construida sobre Next.js 16, React 19, PayPal Orders v2 y Supabase.

## Alcance implementado
- Catálogo responsive en USD con 15 ofertas de demostración y filtros por sector.
- Compras de clientes como invitados: no se exige registro ni contraseña. Solo nombre y correo para el pedido. El acceso de administración sigue protegido mediante Supabase Auth en sus rutas API.
- Entrega digital a compradores invitados mediante cookie HttpOnly aleatoria, verificación del pago en servidor y enlaces de archivo de corta duración; la recuperación por email se implementará en la fase de notificaciones.
- Administración limitada al rol `commerce_roles.admin`: crear productos borrador y carga segura de PDFs pequeños mediante endpoint independiente.
- Checkout: precio y moneda siempre consultados en servidor; compra asociada al usuario; creación de Order PayPal; retorno y captura; comprobación de monto/currency/status; confirmación por webhook con verificación de firma y deduplicación; revocación de acceso en reversos/reembolsos.
- Esquema SQL con RLS y bucket privado; catálogo de ofertas iniciales como borradores.

## Requisitos antes de cobrar
1. Crear un Supabase **dedicado** para esta tienda y ejecutar `supabase/schema.sql`, luego `supabase/seed.sql`.
2. Configurar `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_MODE=sandbox`, y `NEXT_PUBLIC_SITE_URL` en Vercel. Secretos solo en el servidor, nunca en Git.
3. Dar de alta webhook PayPal apuntando a `https://DOMINIO/api/paypal/webhook`, escuchar `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.REFUNDED` y `PAYMENT.CAPTURE.REVERSED`.
4. Crear usuario, asignarle admin mediante SQL autenticado, cargar archivos digitales reales en bucket privado y actualizar `asset_path` en el producto. Publicar solo ofertas revisadas. Los servicios requieren alcance de entrega confirmado.
5. Probar en PayPal Sandbox: pago completo, monto errado, webhooks duplicados, cancelación, reembolso, comprador A vs comprador B, acceso a biblioteca y descarga firmada; después de esa verificación, configurar Live.

## No implementado todavía
- Suscripciones automáticas con PayPal Billing y conciliación mensual (no habilitar productos de categoría membresía).
- Carrito multiartículo y pagos divididos, impuestos/facturación fiscal DGII.
- Gestión avanzada de cursos, videos grandes/reanudables, certificados y rutas pedagógicas. La biblioteca ya lista lecciones y reproduce MP4 con enlaces temporales, pero no ofrece un LMS completo.
- Gestión integral de envíos/stock y logística, flujo completo de brief y entrega de servicios, editor de productos ya existentes, panel de ventas con reportes.
- Marketplace de terceros: no utilizar esta cuenta para procesar ingresos de vendedores ajenos.

## Desarrollo
```bash
npm install
npm test
npm run dev
```
La tienda muestra muestras etiquetadas y **no acepta pagos sin configuración del backend**. No sustituye pruebas de extremo a extremo ni auditoría de seguridad previa a producción.

## Cambio comercial 2026-11-07
- Rediseño visual LATAM: más de nueve ilustraciones SVG originales, hero, tarjetas, beneficios, comparación conceptual, FAQ y CTAs para móviles.
- Catálogo reescrito con nuevos nombres y precios desde US$15; no se afirman resultados garantizados ni testimonios inventados.
- Compras como invitado: el servidor recibe nombre y correo, genera secreto aleatorio de sesión (cookie HttpOnly) y asocia el pedido sin crear usuario.
- PayPal continúa DESHABILITADO hasta configurar Supabase exclusivo, credenciales, webhook y pruebas de Sandbox. Durante la preparación, el botón «Lo quiero» abre un correo de consulta prellenado.
- WhatsApp requiere NEXT_PUBLIC_WHATSAPP_NUMBER con el número comercial real (solo dígitos e indicativo). Sin esta variable, se muestra una advertencia clara y correo alternativo.
- Prompts de las seis imágenes IA originales: docs/PROMPTS-IMAGENES-IA.md; los SVG locales garantizan carga independiente de proveedores externos.

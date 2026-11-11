# Ángel Berigüete Commerce

Tienda **comercialmente independiente** para recursos digitales, servicios y formación con público objetivo en Latinoamérica. La marca, navegación y experiencia del comprador son exclusivas de Commerce: no se muestran accesos al CRM general ni la identidad de agencia.

> Arquitectura actual: aplicación Next.js dentro de `commerce/` del repositorio `angelberiguete-pixel/crm`, con proyecto Vercel `angel-commerce` y base Supabase **dedicada** cuando se configure. La independencia de marca y despliegue NO implica todavía repositorio GitHub separado.

## Identidad visual 2026-11-07
- Nombre: **Ángel Berigüete Commerce**.
- Paleta: índigo profundo, lila, melocotón, menta y fondos claros.
- Tipografía editorial, hero SVG propio, colecciones visuales, tarjetas con ilustraciones, navegación y filtros responsive, CTA de consulta clara.
- Moneda base: USD. No se infiere localización/moneda ni se garantizan cobros en todos los países.
- Catálogo de referencia: **17 ofertas**; CV Express **US$4.90**, acompañamiento laboral distinto **US$24.90**, descargables desde **US$2.90**. Ninguna oferta demo se publica automáticamente.
- El acompañamiento laboral no promete entrevistas, llamadas ni contratación.

## Cobros: desactivados hasta la integración validada
El frontend distingue productos **publicados** y la preparación real del backend antes de ofrecer PayPal. Los productos demo y borradores solo abren una consulta por email. No activar un cobro o entrega automática sin:
1. Crear Supabase exclusivo de Commerce, aplicar `supabase/schema.sql`, luego `supabase/seed.sql` y revisar cada producto.
2. Subir materiales digitales originales y vincular `asset_path`; publicar solo los productos que puedan entregarse.
3. Configurar en Vercel `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_MODE=sandbox` y `NEXT_PUBLIC_SITE_URL`.
4. Verificar webhook PayPal `/api/paypal/webhook` (captura completada, reembolsos y reversos).
5. Probar en sandbox: pedido, pago, resultado, descarga, validación de precios, errores y repetición de webhooks; solo después habilitar credenciales live.
6. Revisar requisitos de venta internacional, impuestos, privacidad, reembolsos y condiciones de cada servicio.
7. Configurar `NEXT_PUBLIC_WHATSAPP_NUMBER` solo si existe un número comercial real.

`seed.sql` actualiza únicamente las ofertas aún no publicadas, sin sobreescribir precios de productos vendidos activos. El precio mostrado en una tienda ya conectada a Supabase se toma de la base de datos, no del catálogo ilustrativo.

## Alcance y límites
- Compra como invitado: nombre y email, sin registro obligatorio.
- Cotización por correo cuando el backend no está preparado.
- PayPal Orders v2, captura, comprobación de importe y firma webhook están programados, pero requieren configuración y pruebas en vivo.
- Entrega digital protegida para productos configurados; recuperación automática por email aún no existe.
- Sin carrito multiartículo, suscripciones automáticas, facturación electrónica ni promesas de empleabilidad.

## Desarrollo
```bash
cd commerce
npm install
npm test
npm run build
npm run dev
```


### Imágenes comerciales IA autohospedadas (2026-11-08)
El hero utiliza `public/art/ai-hero.webp` y las tarjetas de catálogo, página web, reels, cobros y contenido mensual utilizan cinco imágenes `ai-*.webp`. Son originales, convertidas a WebP en GitHub Actions, guardadas dentro del repositorio y no dependen de URL externas. El resto de tarjetas conservan ilustraciones SVG locales. Las escenas de personas y negocios son generadas mediante IA y no representan clientes ni resultados verificados.

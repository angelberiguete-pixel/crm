# Empresia Meta Hub — arquitectura multiempresa y activación

**Estado de esta entrega (2026-11-09):** panel de **solo lectura** conectado a
`tenant_integration_health` y `openreply_bridge_status`. No inicia OAuth, envía
mensajes ni marca cuentas conectadas. El cliente Family Power mantiene su propia
interfaz sin alteraciones.

## Objetivo

Una experiencia de conexión por empresa para Instagram, Facebook Pages/Messenger,
WhatsApp Business y Meta Lead Ads. Cada canal reusa los contactos, conversaciones,
cotizaciones, tareas y agentes supervisados **del CRM existente**. Una ficha comercial
única solo se unifica cuando la identidad del usuario se ha vinculado con evidencia;
coincidencias de nombre o número no autorizan mezclar contactos entre canales.

## Los distintos flujos de Meta

| Producto | Autorización prevista | Ingreso | Estado actual |
| --- | --- | --- | --- |
| Instagram profesional | Instagram Login de OpenReply (scopes `instagram_business_basic`, `instagram_business_manage_comments`, `instagram_business_manage_messages`) | Webhook oficial en servidor OpenReply; extensión firmada hacia Supabase | Receptor y tablas de Empresia preparados; falta app OpenReply, OAuth, ruta habilitada y entrega real |
| WhatsApp | Cloud API por WABA/número; onboarding de clientes mediante Embedded Signup compatible con versión vigente | `meta-whatsapp-inbound` (firma HMAC) o adaptador aprobado con deduplicación | Backend existente; no asumir números conectados por una solicitud |
| Facebook Page y Messenger | Facebook Login for Business + Page permissions, `pages_messaging` y revisión aplicable | Webhook Page verificado; adaptador por Page ID | Parser preparatorio en `lib/meta-webhook.ts`, sin ruta comercial verificada |
| Lead Ads | Facebook Login/Marketing API y `leads_retrieval` con acceso de la página y del formulario | `leadgen_id` → recuperación Graph autorizada → prospecto | Solo contrato de evento, sin recuperación autorizada de datos |
| Publicación/estadísticas | Permisos adicionales según producto | Adaptadores independientes | Fuera de esta primera activación |

**No equivale a una sola aplicación o un solo token.** Meta admite productos,
permisos y revisión diferentes. El equipo debe confirmar el flujo apropiado antes
de solicitar acceso para cada empresa. Instagram Login por sí solo no permite ads.

## Contrato de confianza del CRM

1. Cada tenant tiene `channels`, roles RLS, cuenta externa y autorización
   verificable. Una solicitud solo registra intención: no habilita mensajería.
2. Las claves quedan en el servidor/vault. OAuth valida `state` ligado a la
   sesión/tenant, `redirect_uri` exacta, anti-CSRF y titularidad real. No guardar
   tokens en `settings` legible, frontend, logs ni URLs.
3. Los webhooks verifican firmas en bytes crudos y origen, resuelven WABA,
   número, Page ID o IG Account ID mediante mapeo exclusivo de tenant y usan
   claves idempotentes antes de escribir al CRM. Un callback público nunca acepta
   `tenantId` como autoridad.
4. OpenReply solo pertenece a Instagram. No duplicar el procesado de mensajes
   si también existe un webhook directo de Instagram: elegir un único
   consumidor por evento, con identificadores compartidos para idempotencia.
5. Un mensaje entrante verificado puede registrar conversación/contacto; los
   disparadores deben distinguir comentario, respuesta privada aceptada,
   mensaje de la persona y compra confirmada. Los borradores de cotización
   requieren producto/precio/stock aprobados y **revisión humana**.
6. IA: aislamiento de empresa, asignación por vendedor, presupuestos
   bloqueados por defecto, no crear permisos o enviar mensajes autónomos
   por un estado visual `verified_route`. Respetar ventanas, consentimiento
   y opt-out de Meta.
7. Un permiso revocado, token caducado o API inaccesible se comunica como
   conexión no verificable. Nada se presenta como operativo solo por HTTP 200
   o por pruebas simuladas.

## Evidencia del panel

`components/meta-hub-panel.tsx` usa solamente RPCs existentes:

- `tenant_integration_health`: sesión/membresía, canales y ruta WhatsApp.
- `openreply_bridge_status`: rutas, eventos y borradores de Instagram, aislados por empresa.
- `lib/meta-hub-status.ts`: el estado "Ruta verificada" exige ambas
  condiciones: canal conectado y ruta de servidor habilitada/validada.
  **No afirma recepción ni entrega en vivo**.
- Facebook/Messenger y Ads muestran "Integración pendiente" hasta disponer
  de un mapeo y pruebas oficiales; no existe una verificación fiable todavía.
- El panel está **ausente en el flujo separado de Family Power**.

## Próximos hitos verificables

1. Reconciliar permisos de despliegue Vercel del CRM, sin confundir el nombre
   público del dominio con el ID de proyecto.
2. Publicar OpenReply con PostgreSQL, Redis y worker; registrar URLs OAuth y
   webhook HTTPS exactas en Meta. Conectar una cuenta Instagram propia.
3. Registrar un workspace y ruta IG autorizados en Empresia, con secretos
   HMAC/lectura exclusivamente del lado servidor. Probar comentario auténtico
   → DM permitido → respuesta real → evento firmado → contacto, conversación,
   borrador y tarea. Confirmar aislamiento, duplicados, revocación y aprobaciones.
4. Implementar Facebook Login for Business y OAuth por Page ID; conectar una
   página propia y probar Messenger con respuesta y recibo real.
5. Incorporar WhatsApp Embedded Signup compatible con la configuración actual
   de Meta, con reglas de coexistencia y autorización por WABA/número.
6. Por último, integrar Lead Ads y las métricas de campañas con permiso validado
   y recuperación real de datos Graph (el webhook solo trae identificadores).
7. Ejecutar App Review/Advanced Access antes de ofrecer onboarding de cuentas
   de terceros fuera de los roles de prueba.

## Validación

```sh
node --experimental-strip-types --test tests/meta-hub-status.test.mjs
npm run typecheck
npm run build
```

Las pruebas de estado son locales/de contrato; no demuestran mensajes
entregados por Instagram, Messenger ni WhatsApp.

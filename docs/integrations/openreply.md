# OpenReply dentro del CRM general

Primera integración: consultar campañas y métricas de Instagram desde el centro
de Integraciones del CRM, y probar palabras clave con el motor original de
OpenReply. Esta entrega no envía mensajes, importa prospectos ni activa campañas.

Repositorio CRM: `angelberiguete-pixel/crm`. Base de esta entrega:
`5833dcf7fbf64197d0726def25e00b4c6b406491`.
Family Power conserva su repositorio, despliegue y base independientes. No se
ejecutan migraciones ni se modifican credenciales o proveedores existentes.
El panel y la ruta nueva excluyen explícitamente el tenant `family-power`.

## Qué aporta y qué falta

| Función | OpenReply original | Esta integración | Pendiente |
| --- | --- | --- | --- |
| Comentario con palabra clave → DM y respuesta pública | Sí, por API oficial de Meta | Probador local del mismo motor | Instalación, autorización y entrega real |
| Disparadores de DM e historias | Sí, según campaña y proveedor | Sin cambios al motor de envíos | Prueba real por cuenta |
| Consulta de campañas y estados | REST/MCP de lectura | Panel por empresa con clave exclusiva en servidor | Configurar instalación y clave |
| Estadísticas | Envíos por estado y solicitudes a enlaces | Proyección explícita, sin atribuir ventas | Atribución comercial verificable |
| Leads, contactos e historial del CRM | No los expone la API de lectura | Enlaces a los módulos existentes | Puente de eventos firmado |
| Cotizaciones, inventario, pedidos, IA y WhatsApp | No los implementa esta API | Sin activaciones automáticas | Adaptadores y pruebas por módulo |

Manychat también ofrece IA, captura de leads y construcción de flujos. La ventaja
comercial propuesta es resolver la operación completa del negocio en el CRM:
conversación, dato comercial verificado, oferta, venta y seguimiento. Esa ventaja
debe demostrarse con un recorrido real, no se obtiene únicamente clonando este
repositorio.

## Arquitectura y permisos

El navegador envía su sesión Supabase a
`GET /api/integrations/openreply?tenantId=UUID`. El servidor valida el usuario con
`auth.getUser`, comprueba una membresía activa de propietario/administrador y
consulta `tenant_integration_health` para verificar rol y ciclo de vida de la
empresa. Una respuesta incompleta o un error no conceden acceso.

Solo después selecciona la conexión en el registro de secretos del servidor.
Cada empresa tiene una clave `campaigns:read` de un workspace exclusivo de
OpenReply. La ruta consulta únicamente `/api/v1/campaigns`. Con
`campaignId=ID` consulta `?id=ID&stats=1`. No hay endpoints de escritura.

Las respuestas llevan `Cache-Control: private, no-store` y proyección explícita.
Se excluyen tokens, identificadores de cuentas y campos futuros de la API. Se
limita el cuerpo del proveedor a 512 KiB y la consulta a ocho segundos. Se
rechazan redirecciones y destinos suministrados por el navegador. Los destinos
de conexión solo puede configurarlos el operador del servidor: deben ser
orígenes HTTPS públicos bajo su control, sin IP literales ni nombres locales.

El componente se vuelve a montar al cambiar la empresa y cancela peticiones
pendientes para evitar mostrar resultados del workspace anterior. La clave de
OpenReply nunca se guarda en `localStorage`, el formulario, la URL o código de
cliente. No es la clave de Meta ni una contraseña de Instagram.

## Activación de la consulta

1. Desplegar una copia de OpenReply. Requiere aplicación web HTTPS, PostgreSQL,
   Redis, correo de autenticación y un worker permanente. Vercel puede alojar la
   web; hace falta infraestructura apropiada para el worker. No asumir que un
   plan gratuito lo mantendrá operativo.
2. Elegir API oficial de Meta propia o el proveedor opcional Zernio. OpenReply
   tiene licencia MIT; alojamiento y proveedores pueden tener costos. Esta
   entrega no contrata servicios, no consume IA pagada y no inicia mensajes.
3. Crear un workspace exclusivo por empresa y verificar su cuenta profesional.
   En OpenReply → API & MCP, crear una clave de lectura de 30, 60 o 90 días.
4. En el gestor de secretos del despliegue CRM configurar
   `CRM_OPENREPLY_CONNECTIONS_JSON`. No usar prefijo `NEXT_PUBLIC_`. Su valor es
   un arreglo con esta estructura ilustrativa; los valores son marcadores,
   no credenciales utilizables:

```json
[
  {
    "tenantId": "UUID_REAL_DE_LA_EMPRESA",
    "workspaceId": "ID_REAL_DEL_WORKSPACE_OPENREPLY",
    "baseUrl": "https://openreply.su-dominio.com",
    "serviceKey": "CLAVE_DE_LECTURA_CREADA_EN_OPENREPLY"
  }
]
```

El operador debe comprobar que cada clave pertenece al workspace indicado.
La API de lectura actual no devuelve un workspace ID que permita cotejarlo
automáticamente. El registro rechaza reutilizar tenant, clave o combinación
origen/workspace entre empresas, pero esa validación no sustituye la comprobación
del operador. Revocar la clave y reemplazarla cuando expire o cambie el acceso.

5. Publicar una versión de pruebas e iniciar sesión en ese negocio. Abrir
   `/crm/integrations` y actualizar campañas. Debe indicar «API de campañas
   verificada» únicamente después de una respuesta válida. Esto verifica
   lectura de campañas; no certifica Instagram conectado ni mensajes entregados.
6. Probar que un vendedor, usuario sin sesión y administrador de otra empresa
   no pueden consultar esta conexión. Confirmar que una clave revocada produce
   un estado de error, sin conservar indicadores de consulta verificada.

Sin la variable se muestra «Sin conectar» y no se realiza ninguna petición al
proveedor. No se usa el sitio demo de OpenReply como servicio operativo.

## Siguiente entrega: puente de eventos comerciales

La API nativa no devuelve destinatarios, mensajes individuales ni eventos de
lead. Para captarlos, hace falta una extensión de OpenReply o un receptor de
eventos oficial adecuado; no inferir prospectos a partir de clics agregados.

Propuesta de extensión del fork, todavía no implementada:

- Outbox durable tras eventos confirmados, con `eventId`, `workspaceId`,
  `campaignId`, identificador externo y estado; firma HMAC, fecha y protección
  contra reenvíos. El tenant se resuelve mediante un mapeo verificado del
  workspace/cuenta del emisor, nunca mediante un `tenantId` libre en el cuerpo.
- Inserción idempotente de conversación/contacto y atribución de origen.
  Separar «comentó», «se envió respuesta privada», «respondió el cliente»,
  «solicitó cotización» y «venta confirmada».
- Solo generar tareas/cotizaciones cuando exista información suficiente y
  autorización. Respetar las ventanas, permisos y límites de Meta; probarlos
  contra la documentación vigente antes de habilitar acciones.
- Los agentes consultan únicamente productos, stock y precios aprobados del
  negocio. Descuentos, cobros y cotizaciones finales mantienen revisión humana.
- Aprovechar los módulos de automatizaciones, conversaciones y marketing ya
  existentes, con adaptadores explícitos para cada canal. WhatsApp continúa con
  su integración propia; OpenReply no lo añade.

Criterio de aceptación comercial: comentario real → respuesta privada entregada
→ respuesta del cliente → contacto/conversación del negocio correcto → producto
con datos aprobados → cotización revisada → seguimiento → venta trazable. Recién
entonces comparar tiempos, conversión y costo operativo con Manychat.

## Verificación

```sh
npm run test:openreply
npm run typecheck
npm run build
node tests/openreply-bridge-browser.test.mjs
```

Las pruebas de contrato usan servicios simulados; las de navegador verifican
estados de conexión, acentos, contadores, diseño móvil, respuestas tardías al
cambiar de empresa y exclusión de Family Power. No demuestran entrega por Meta.

## Fuentes y licencia

- [OpenReply](https://github.com/diwenne/openreply), revisión auditada:
  `c78b2d2f68c9764ef7a7dde51dfa5bfa99304a09`.
- [API y MCP de lectura](https://github.com/diwenne/openreply/blob/c78b2d2f68c9764ef7a7dde51dfa5bfa99304a09/docs/integrations.md).
- [Instalación](https://github.com/diwenne/openreply/blob/c78b2d2f68c9764ef7a7dde51dfa5bfa99304a09/docs/setup.md).
- [Proyección nativa de campañas y métricas](https://github.com/diwenne/openreply/blob/c78b2d2f68c9764ef7a7dde51dfa5bfa99304a09/lib/integrations/campaigns.ts).
- [Manychat para Instagram](https://manychat.com/product/instagram) y
  [asistente de construcción de flujos con IA](https://help.manychat.com/en/articles/17742146-manychat-ai-flow-builder-assistant).

El motor de palabras clave se conserva sin modificaciones en
`lib/openreply/keyword-matcher.ts`, con la licencia MIT completa y referencias
de origen en el mismo directorio. Los derechos de Anish Raj y Diwen Huang se
mantienen. El adaptador y la interfaz del CRM están separados del código original.

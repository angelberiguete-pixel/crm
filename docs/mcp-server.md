# MCP interno — Plataforma Empresarial Ángel Berigüete

## Estado y alcance

El servidor MCP está dentro del CRM multiempresa existente: Next.js + Supabase Auth/Postgres/RLS.
Su transporte es Streamable HTTP 2025-11-25 (respuestas JSON, sin estado, sin SSE de servidor).
Esta fase tiene **solo lectura**. No existe ninguna herramienta para crear, borrar, aprobar,
facturar, enviar WhatsApp, enviar SMS o consumir créditos de IA.

**Está desactivado por defecto**: solo responde cuando la variable de entorno de servidor
MCP_INTERNAL_ENABLED=true se establece explícitamente en un entorno autorizado. El endpoint
previsto, después del despliegue, es https://DOMINIO-DEL-CRM/api/mcp. Un 503 sin ese ajuste
es el comportamiento esperado y seguro.

## Herramientas

- crm.get_workspace_context — identifica la empresa que el usuario ya seleccionó y la lista de herramientas autorizadas.
- crm.list_contacts — contactos y datos de contacto.
- crm.list_products — productos, precios y stock resumido.
- crm.list_inventory — existencias y niveles de reposición.
- crm.list_quotations — cotizaciones y estados.
- crm.list_orders — pedidos y pagos resumidos.
- crm.list_agents — estado de agentes; nunca devuelve sus instrucciones, prompts ni credenciales.

La lista que el cliente recibe por tools/list se filtra por permisos y módulos reales.
Cada solicitud verifica el usuario; exige una sola empresa activa, y cada herramienta de datos
requiere su tenant_id. El backend compara el ID solicitado con el tenant activo antes de
consultar Postgres, siempre con RLS usando el JWT del usuario. El máximo por consulta son
25 registros. No se usa la clave service_role ni se crean bases de datos paralelas.

El endpoint exige el header MCP-Protocol-Version: 2025-11-25 después de initialize y
Accept: application/json, text/event-stream en los POST.

## Activación interna controlada

1. Revisar PR, CI y pruebas cruzadas de usuarios reales, incluyendo un empleado de Family Power
   y otro de una empresa distinta, con permisos limitados.
2. Desplegar primero a un entorno de prueba de acceso restringido.
3. Configurar la variable **MCP_INTERNAL_ENABLED=true** solo en ese entorno de servidor.
   Nunca utilizar NEXT_PUBLIC_MCP_INTERNAL_ENABLED ni poner access tokens en variables públicas.
4. Utilizar un cliente MCP interno de confianza capaz de adjuntar el JWT del usuario.
   Proteger su almacenamiento y rotación; jamás pegarlo en chats, capturas o repositorios.
5. Confirmar que un usuario no pueda consultar otra empresa, y que herramientas de módulos
   desactivados no sean visibles ni ejecutables.
6. Mantener la opción desactivada en producción hasta superar auditoría, control de consumo y
   revisión del modelo de autenticación externa.

### Ejemplo de inicialización (entorno interno)

    curl -i -X POST "https://DOMINIO-DE-PRUEBA/api/mcp" \
      -H "Content-Type: application/json" \
      -H "Accept: application/json, text/event-stream" \
      -H "Authorization: Bearer $CRM_SUPABASE_ACCESS_TOKEN" \
      -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"internal-crm-check","version":"1.0"}}}'

Tras inicializar, enviar notifications/initialized (sin id), tools/list y tools/call usando
el header MCP-Protocol-Version: 2025-11-25. Primero llamar a crm.get_workspace_context,
luego a las consultas autorizadas con el tenant_id devuelto.

### Pruebas de código

    node --experimental-strip-types --test tests/mcp-server.test.mjs
    npm run typecheck
    npm run build

El pipeline completo de CI ejecuta también las regresiones del CRM, Family Power y navegador.
Los tests de contrato NO sustituyen las pruebas reales de RLS/autorización con sesiones de dos
empresas y las verificaciones del endpoint desplegado.

## OAuth 2.1 para agentes externos (pendiente, NO habilitado)

La autenticación actual utiliza un JWT de sesión de usuario de Supabase: esto está diseñado
exclusivamente para clientes internos controlados. No es un esquema de OAuth MCP externo
completo; no enviar un token del CRM a ChatGPT, Claude u otro cliente externo todavía.

Supabase Auth ofrece un OAuth 2.1 Server (beta) con Authorization Code + PKCE, consentimiento,
rotación de refresh tokens y registro de clientes. Se evaluará el flujo oficial para agentes
MCP y OAuth Protected Resource Metadata (RFC 9728) antes de habilitarlo. Se requieren:

- Habilitar el servidor OAuth en Supabase por decisión de administración.
- Implementar pantalla de consentimiento y revocación, con autorización explícita del usuario.
- Definir y validar identidades de cliente, recurso/audiencia del token y controles por tenant.
- Limitar scopes a lo necesario; los scopes OIDC de Supabase no sustituyen permisos de base
  de datos ni las políticas RLS.
- Implementar controles distribuidos de tasa/consumo, auditoría persistente y monitoreo.
- Hacer pruebas de seguridad de flujo completo antes de anunciar compatibilidad pública.

Documentación de referencia:
- https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
- https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
- https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication
- https://supabase.com/docs/guides/auth/oauth-server/token-security

## Más adelante

Una vez validada la conexión, estudiar herramientas de escritura con permisos específicos
e intervención humana, idempotencia y registros de auditoría. Odoo o el ERP no son parte de
esta PR. Las integraciones YCloud/httpSMS requieren autorización del propietario del canal
y cumplimiento de políticas antes de permitir envíos.


## Prueba real de dos identidades — guía operativa

La vista previa en Vercel separa el código, pero sigue apuntando al Supabase
general del CRM. No es una base de datos independiente de staging. Usar solamente
cuentas autorizadas, con permiso mínimo y de dos empresas diferentes.

scripts/mcp-family-power-pilot.mjs es un cliente HTTP MCP que realiza dos
inicializaciones, consulta herramientas y empresa activa, hace lecturas propias y
comprueba la denegación cruzada en las dos direcciones. Nunca muestra nombres,
teléfonos, correos, JWTs ni registros comerciales. Exige que las dos sesiones
sean distintas; no utilizar una cuenta de superadministrador global.

Las variables deben configurarse SOLO en una terminal segura, sin enviarlas
por chat ni guardarlas en repositorios:

    MCP_PILOT_URL=https://PREVIEW.vercel.app/api/mcp
    MCP_PILOT_FAMILY_TOKEN=<JWT_DE_PRUEBA_FAMILY_POWER>
    MCP_PILOT_OTHER_TOKEN=<JWT_DE_PRUEBA_OTRA_EMPRESA>
    MCP_PILOT_FAMILY_TENANT_ID=<UUID_FAMILY_POWER>
    MCP_PILOT_OTHER_TENANT_ID=<UUID_OTRA_EMPRESA>
    MCP_PILOT_OTHER_SLUG=sublimaciones-lazala
    MCP_PILOT_VERCEL_BYPASS=<OPCIONAL_SI_PROTEGIDO>

Ejecutar:

    node scripts/mcp-family-power-pilot.mjs

Solo se considera verificado cuando devuelve result=PASS e
isolation=both_directions con dos sesiones de usuario reales. Las pruebas
de CI con respuestas sintéticas son útiles, pero no validan el aislamiento
de datos de producción.

## Adaptador opcional con modelo de IA

scripts/mcp-family-power-agent.mjs implementa funciones del modelo con MCP.
Consulta exclusivamente catálogo, con una llamada MCP y hasta tres productos.
Nunca proporciona JWT al modelo. Requiere consentimiento específico para
enviar los datos del catálogo al proveedor, una clave API propia y activar
MCP_AGENT_RUN=YES y MCP_AGENT_SEND_CATALOG=YES. Sin esos valores permanece
apagado y no incurre en consumo de IA. Ejecutarlo solamente después de la
prueba real de aislamiento.

## Estado

CI: cliente probado con escenarios sintéticos. Vista previa: despliegue
READY. Datos: compartidos con el CRM general, no staging independiente.
Producción: sin cambios. Lecturas con dos cuentas reales: pendientes.


## Verificación desde móvil sin copiar JWT (vista previa protegida)

Se añadió la ruta /mcp-pilot exclusivamente en despliegues Vercel Preview con
MCP_INTERNAL_ENABLED=true. No aparece en producción, aunque el flag se configure
por error, porque exige también VERCEL_ENV=preview.

El propietario puede abrir desde su navegador autorizado la vista previa y
usar **dos cuentas de prueba previamente aprobadas**:
una que tenga Family Power como única empresa activa y otra que tenga
Sublimaciones Lazala. Deben ser dos usuarios diferentes con rol de lectura
de contactos. La pantalla no guarda ni muestra contraseñas, tokens o contactos;
mantiene sesiones temporales independientes en memoria y se desconecta al terminar.

Se ejecutan los mismos controles que en scripts/mcp-family-power-pilot.mjs:
inicialización MCP, catálogo de herramientas, empresa activa, lectura de contactos
propios y rechazo de lecturas cruzadas en ambas direcciones. Un solo fallo
deja el resultado como NO aprobado.

La pantalla sirve para una verificación con datos reales, pero NO crea
usuarios, NO elimina las reglas RLS existentes y NO convierte esta vista previa
en una base de datos aislada. Nunca ingresar credenciales del propietario
global ni cuentas de clientes sin su consentimiento.

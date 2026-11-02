# MCP de la plataforma Ángel Berigüete — Fase 1

Se integra un servidor MCP Streamable HTTP, sin estado y con respuestas JSON, en el CRM general Next.js. No crea otro CRM ni una base de datos paralela. El protocolo implementado es MCP 2025-11-25, con herramientas exclusivamente de consulta.

## Herramientas iniciales

- crm.list_contacts — contactos de la empresa.
- crm.list_products — catálogo de productos.
- crm.list_inventory — existencias.
- crm.list_quotations — cotizaciones y estados.
- crm.list_orders — pedidos.
- crm.list_agents — estado de los agentes sin prompts ni credenciales.

Ruta prevista tras aprobar y desplegar: https://DOMINIO-DEL-CRM/api/mcp

## Seguridad y autorización

Cada solicitud, incluido el saludo de inicialización, requiere un access token válido de Supabase Auth mediante el header Authorization: Bearer TOKEN.

El servidor verifica el token con auth.getUser, exige un tenant_id explícito y comprueba que la empresa está seleccionada como activa mediante la RPC list_my_tenants. Reutiliza las RPC tenant_current_permissions y tenant_effective_modules para respetar el perfil y la configuración de cada negocio. Consulta con el JWT de ese usuario, sin service role, y las políticas RLS siguen protegiendo las filas. Además filtra por tenant_id.

Las herramientas son solamente de lectura; cada consulta tiene un límite máximo de 25 filas. Se seleccionan columnas explícitas para evitar exponer system_prompt, secretos y tokens. Se validan las solicitudes, el Origin y la versión del protocolo. No hay acceso anónimo, ni se permite CORS entre sitios.

Este primer servidor utiliza el token de sesión del CRM, por lo que se dirige a clientes MCP controlados por el equipo técnico. No es todavía un conector público de ChatGPT: para eso faltan autorización OAuth para terceros, renovación de tokens, auditoría, límites de consumo y una revisión de seguridad.

## Pruebas

Ejemplo de inicialización desde una terminal, con las variables DOMINIO_CRM y CRM_SUPABASE_ACCESS_TOKEN configuradas localmente y sin compartir el token:

    curl -i -X POST "https://DOMINIO-DEL-CRM/api/mcp" \
      -H "Content-Type: application/json" \
      -H "Accept: application/json, text/event-stream" \
      -H "Authorization: Bearer $CRM_SUPABASE_ACCESS_TOKEN" \
      -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"crm-check","version":"1.0"}}}'

Para probar contratos sin acceder a datos:

    node --experimental-strip-types --test tests/mcp-server.test.mjs

Antes de activar: probar con usuarios de dos empresas diferentes, una empresa con módulo deshabilitado y un usuario sin permisos. Verificar denegación cruzada, ausencia de escrituras y respuestas correctas mediante tools/list y tools/call.

## Fases siguientes

- OAuth para clientes externos, auditoría, límites de solicitudes y monitoreo.
- Escrituras protegidas por permisos e intervención humana: prospectos sin duplicación, cotizaciones en borrador y operaciones de inventario.
- Adaptadores por tenant de Odoo, YCloud, httpSMS y automatizaciones, únicamente tras su autorización.
- Integración equivalente en Family Power independiente cuando se confirme su esquema; no cruzar las bases de datos general e independiente.

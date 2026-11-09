# Empresia → Dolibarr · Integración real de solo lectura (fase 1)

## Estado y alcance

Este proyecto **NO** lanza todavía un servidor ERP nuevo ni emite facturas.
Conecta Empresia (CRM principal) con la API REST oficial de una instalación
Dolibarr administrada por el propietario, exclusivamente para:

1. Consultar estado de configuración del puente.
2. Verificar por HTTPS que la API de productos responda con clave válida.
3. Consultar hasta 10 productos por acción en la interfaz del CRM.

No sincroniza datos al CRM y no modifica inventario, empresas, facturas,
contabilidad, impuestos ni cobros PayPal.

## Recursos

- Plataforma: `angelberiguete-pixel/crm`, ruta `/crm/erp`.
- Supabase principal: `ygipjqgyreeahslzorik`.
- Función protegida: `empresia-dolibarr`.
- Motor PHP/MariaDB: `angelberiguete-pixel/Empresia-ERP` (Docker Compose).
- Tenant autorizado para esta fase: slug interno `eurevector` (**Empresia**).
- Odoo heredado: sin cambios, base de datos y RPCs de sincronización mantenidos.

## Requisitos antes de encender

1. Tener Dolibarr instalado en servidor con volúmenes persistentes y backups.
   No exponer el contenedor local (que solo escucha en `127.0.0.1:8080`)
   directamente a Internet.
2. Ponerlo detrás de HTTPS con dominio propio, y terminar TLS en proxy seguro.
3. Activar los módulos **API REST** y **Productos** en Dolibarr.
4. Crear un usuario técnico de Dolibarr **con permiso exclusivo de lectura
   de productos**, e introducir su clave API en el gestor de secretos de Supabase.
   La documentación oficial llama a la cabecera de autorización `DOLAPIKEY`.
   No pegar la clave en chat, capturas, repositorios, variables `NEXT_PUBLIC_`
   ni en registros de logs.
5. Activar el puente tras verificar el servidor y la propiedad de la cuenta.

## Variables privadas de la función de Supabase

- `DOLIBARR_READONLY_ENABLED=true` solo al finalizar la configuración.
- `DOLIBARR_EXPECTED_TENANT_ID=<uuid_del_tenant_empresia>`.
- `DOLIBARR_API_BASE_URL=https://erp.dominio-propio.com/api/index.php`
  (URL HTTPS exacta, sin query, puerto especial ni fragmento).
- `DOLIBARR_API_KEY=<clave_usuario_tecnico_de_lectura>`.
- Reutiliza `SUPABASE_URL` y `SUPABASE_ANON_KEY` **servidor** desde Supabase.

La función queda **fail-closed** si falta cualquier variable. No permite
que el navegador elija la URL del servidor ni el token. Solo devuelve productos
normalizados `id, ref, label, price`; no contactos ni campos privados.

**Importante:** una instancia Dolibarr única para una sola empresa piloto no
constituye aislamiento multiempresa. Cuando se amplíe a otros clientes,
cada cliente deberá tener credenciales, permisos y aislamiento de datos
independientes con pruebas técnicas.

## Modelo de datos y permisos

Se aplicó la migración `20261109112351`:

- `erp_connections.provider` acepta `odoo` y `dolibarr`.
- La vista nueva `tenant_dolibarr_status` usa `security_invoker=true`,
  consulta solamente estado sin claves ni URL, revoca SELECT a `anon`
  y exige permisos reales de la tabla `erp_connections`.
- La vista histórica `tenant_erp_status` sigue **Odoo-only** para no romper
  sincronizaciones ni interpretaciones existentes.
- **No** se insertan filas de conexión ni se acredita salud de la API.
  El botón `Probar conexión` valida respuesta real cada vez que se pulsa.

La función revisa un JWT válido en Supabase Auth, membresía activa, rol
`owner/admin`, slug exacto `eurevector` y UUID del tenant autorizado por
configuración. No se apoya en metadatos editables por el usuario.

## Pruebas

```bash
deno test supabase/functions/empresia-dolibarr/protocol.test.ts
deno check supabase/functions/empresia-dolibarr/index.ts
node --test tests/empresia-dolibarr-bridge-contract.test.mjs tests/empresia-erp-module.test.mjs
npm ci && npm run typecheck && npm run build
```

Las pruebas de protocolo usan **fetch simulado** para comprobar validaciones
de URL, HTTPS, respuestas, límites, redacción y aislamiento de productos;
no demuestran conectividad real. La primera evidencia de conectividad real
será `connected_read_only` después de habilitar una instalación propia.

## Próximas fases (no implementadas)

- Persistir metadatos verificables después de conexión real y registrar auditoría.
- Sincronización entrante de productos con mapeo de IDs y deduplicación.
- Cotizaciones hacia Dolibarr mediante cola, aprobación humana e idempotencia.
- Contabilidad, facturas y DGII e-CF requieren procesos separados y controlados.
- Despliegue duradero con base de datos MariaDB y documentos persistentes;
  Vercel continúa ejecutando Next.js, no PHP/MariaDB.

Referencias oficiales:
- https://github.com/Dolibarr/dolibarr/blob/develop/htdocs/api/README.md
- https://wiki.dolibarr.org/index.php/Module_Web_Services_API_REST_(developer)

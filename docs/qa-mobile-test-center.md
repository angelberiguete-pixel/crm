# Centro de Control de Pruebas Móviles — issue #69

## Alcance de V1

Ruta: /qa/mobile (exclusivamente desarrollo local o preview autorizado).
Rama de trabajo: feat/issue-69-qa-mobile-control-20261111.

El centro reutiliza los recorridos existentes de Playwright y registra evidencias y estados de aceptación sin llamar a Supabase, Meta, Odoo ni pasarelas. Los datos del checklist se guardan SOLO en localStorage del navegador con la clave empresia:qa69:fixture-only:v1 y se exportan/importan como JSON de versión 1. No hay sincronización, adjuntos binarios, autenticación de equipo ni ejecución remota desde la interfaz. Un enlace a un resultado CI no es equivalente a ejecución por sí mismo: el operador debe comprobar que corresponde al SHA y viewport citados.

**Este centro NO constituye un entorno staging de datos real.** Los módulos CRM siguen importando lib/supabase.ts, cuyo URL pertenece al proyecto principal; por ello está PROHIBIDO abrirlos desde esta herramienta como supuestos recorridos seguros de staging.

## Encendido protegido

- Vercel: por defecto deshabilitado. Nunca se muestra si VERCEL_ENV=production, incluso si una variable se configuró mal.
- Local/preview NO productivo: configurar EMPRESIA_QA_CENTER_ENABLED=true en el proceso aislado. Proteger cualquier preview con Vercel Deployment Protection o SSO. Jamás poner esa variable en producción.
- Ruta: /qa/mobile. No está en navegación pública ni en el CRM de clientes.
- proxy.ts aplica un bloqueo por defecto SOLO en QA preview activado: cualquier ruta distinta del centro y sus recursos estáticos devuelve 404. Esto evita entrar por accidente en /crm o /family-power y alcanzar el Supabase principal.
- No enlazar ni automatizar rutas de producción; los paths que aparecen son referencias de código.
- vercel.json ya limita el despliegue automático a main. La rama/PR no debe fusionarse ni desplegarse a producción sin revisión.

## Alcance y fuentes

| Escenario | Fuente reutilizada | Qué prueba realmente |
| --- | --- | --- |
| Cambio de tenant y bloqueo RBAC | tests/tenant-context-browser.test.mjs | Contrato de UI a 390x844 con RPC simuladas |
| Empresas, contactos, oportunidades, inbox y tareas | tests/commercial-mobile-browser.test.mjs | Recorrido en Android simulado, mutaciones interceptadas |
| Aislamiento visual | tests/tenant-white-label-browser.test.mjs | Temas de tenants ficticios con stub |
| Pruebas de lógica de selección | tests/tenant-context.test.mjs | Selección, sin BD |
| RLS real / sesiones reales / pagos / servicios externos | Ninguna de las anteriores | **No verificado**, requiere credenciales y servicios QA independientes |

Los casos con ámbito "staging" o "integración" nunca se pueden marcar aprobados en V1. Marcar un fixture aprobado exige resultado observado, dispositivo, responsable, SHA hexadecimal y URL HTTPS de evidencia sin query ni fragmento. El estado "bloqueada" y "fallida" exigen explicación.

## Preparación del staging verdadero (NO implementada en V1)

1. Preparar una **rama de base de datos Supabase QA aislada** (sin datos de producción) y comprobar primero que la creación/migraciones no estén en `MIGRATIONS_FAILED`. No cambiar el proyecto principal ni reutilizar datos/identificadores de `family-power`. Crear QA-A y QA-B con datos y cuentas sintéticos, solo cuando el aislamiento esté verificado.
2. Reutilizar el **proyecto Vercel existente `crm`** mediante un preview protegido de la rama QA, sin crear otro proyecto. `vercel.json` hoy restringe desplegar ramas distintas de `main`: habilitar solo la rama QA cuando su configuración esté revisada. Deben auditarse frontend, servidor y Edge Functions para que todas las conexiones del preview apunten únicamente a Supabase QA; hoy `lib/supabase.ts` codifica el endpoint de producción. Hasta entonces mantener bloqueadas `/crm`, `/api` y `/family-power` en el preview y limitarlo a fixtures.
3. Instalar RLS/migraciones desde una fuente verificada en QA. No ejecutar migraciones ni scripts SQL contra el proyecto principal.
4. Validar por separado credenciales propietario/cliente (no compartir contraseñas), RBAC A/B, CRUD cross-tenant negado y recorridos Android de clientes/contactos/oportunidades/conversaciones/cotizaciones/pedidos.
5. Integraciones Meta/Odoo/PayPal: solo con sandbox y autorización oficial. No disparar mensajes, compras, cobros, WhatsApp o webhook contra producción. Un plan "active" sin evento de cobro no es un pago recibido.
6. Adjuntar a cada prueba SHA de build, CI URL, captura o registro no sensible, tipo de dispositivo, hora y esperado/observado; pruebas de rendimiento básico.
7. Revisar PR #18 sin fusionar por defecto. Reportar explícitamente cumplido, fallido y pendiente. El criterio de beta se verifica fuera del registro de fixtures.

## Cómo usar

En la ruta /qa/mobile seleccione un caso, registre "pendiente", "bloqueada", "fallida" o —solo para fixtures— "aprobada"; escriba la evidencia, pulse "Guardar resultado local" y exporte el JSON para revisión. Puede importar un JSON de la misma versión y el validador rechazará intentos de inyectar aprobaciones reales.

**Nunca introducir contraseñas, JWT, API keys, correos de clientes, números privados ni capturas con datos reales.** El navegador no respalda este registro en el servidor. La issue #69 sigue abierta hasta completar las verificaciones reales y el informe final.


## Auditoría de continuidad — 18 de noviembre de 2026 (solo lectura)

Referencia del repositorio: `angelberiguete-pixel/crm`. **El estado de un CI aprobado NO acredita una prueba autenticada contra staging ni un despliegue operativo del cliente.**

| Área | Hallazgo comprobado | Consecuencia para la entrega |
| --- | --- | --- |
| Publicación | Vercel proyecto `crm` está `READY` en producción (commit `3d7a6ec`); esa etiqueta solo acredita despliegue, no E2E. | Validar SHA publicado, HTTP, login y Android desde sesión autorizada. |
| Aislamiento | `lib/supabase.ts` referencia directamente `ygipjqgyreeahslzorik`, incluso desde código de PR; la rama QA `#203` mantiene preview aislado a fixtures y `vercel.json` bloquea auto-deploy fuera de `main`. | **QA-16 BLOQUEANTE:** no probar CRM real en preview hasta que el backend esté aislado de verdad. |
| Supabase | Proyecto principal `ACTIVE_HEALTHY`; la rama registrada `main` informa `MIGRATIONS_FAILED`. Las últimas migraciones listadas en remoto llegan a `20261110151733`. | Revisar logs/historial y plan de migraciones **en QA**; no corregir ni aplicar SQL en producción a ciegas. |
| ERP | Tablas `inventory_warehouses` y `inventory_stock_locations` ausentes en el esquema público de producción (consulta a `pg_tables`). Las columnas `category` y `product_id` no aparecen en `inventory_items` actual (consulta a `information_schema`). | **QA-17 BLOQUEANTE:** base actual no demuestra el ERP nativo completo. Pruebas SQL aisladas del PR `#198` no sustituyen migración/control de datos. |
| WhatsApp | PR `#209` corrige importación Edge y su CI concluyó con éxito en SHA `76a7e349`, pero empaquetado y recepción oficial no certificados. Incidencias `#67` y `#120` abiertas. | **QA-18 BLOQUEANTE:** HMAC, webhook con ruta verificada y duplicados, Buzón y respuesta real solo con autorización y números de prueba. Sin mensajes a clientes. |
| Seguridad | Advisors reportan 2 funciones `SECURITY DEFINER` accesibles a `anon`, 58 a `authenticated`, 17 tablas con RLS habilitado sin políticas, y advertencia de protección contra contraseñas filtradas. Son **hallazgos de revisión**, no evidencia automática de explotación; algunas funciones o tablas pueden estar restringidas intencionalmente. | **QA-19 BLOQUEANTE:** revisión de privilegios, funciones y comprobación A/B real antes de certificar. |
| QA existente | PR `#203`: CI verde para `0cdfafda`; centro local-only, sin staging real ni preview publicado. PR `#198`: CI verde para `bf212da2`. Son ramas diferentes y todavía borradores. | No usar un verde de rama desactualizada como evidencia sobre el SHA final desplegado. |
| Cliente | No hay certificación de extremo a extremo para Family Power: login, inventario, cotización, pedido, pago, WhatsApp, tareas, permiso cruzado y revisión física Android. | **QA-20 BLOQUEANTE:** ensayo con datos sintéticos y acta GO/NO-GO; el cliente no recibe promesas de módulos no probados. |

### Próxima fase: QA-16 a QA-20

La V2 añade cinco escenarios explícitos al registro local, preservando sus garantías: **nunca** acepta una aprobación de staging o integración mediante un fixture/import JSON. Estos nuevos casos no se consideran ejecutados ni aprobados por aparecer en la lista.

1. **QA-16 / Entorno:** demostrar con Network/servidor/código y SHA que un preview protegido usa exclusivamente Supabase QA; error de configuración = NO-GO. Reutilizar Vercel `crm`.
2. **QA-17 / ERP:** con Postgres QA, migraciones completas, 2 tenants ficticios, pruebas de concurrencia, reservas, entregas, PDF, cobros parciales, reintentos e idempotencia; reconciliar versiones de esquema. No usar productos o cobros de Family Power.
3. **QA-18 / WhatsApp:** probar primero HMAC inválido/no verificado y replays sintéticos; solo con autorización oficial ensayar el circuito inbound firmado → contacto → Buzón → asignación → respuesta confirmada. Automatizaciones apagadas.
4. **QA-19 / Seguridad:** revisar `SECURITY DEFINER` (incluida comprobación interna de roles/tenants), GRANT/REVOKE, RLS, Storage y sesiones A/B. Remediar en migraciones versionadas y ensayar con dos identidades QA.
5. **QA-20 / Salida al cliente:** CI de SHA exacto, preview, Android real, escritorio, prueba negativa, revisión de logs, rollback y acta de aceptación. Demostrar solo los módulos que pasen; cualquier P0 abierto = NO-GO.

### Dependencias y orden para no duplicar trabajo

- `#203` es el centro de evidencia; extenderlo en vez de crear otro panel.
- `#209` entrega el arreglo aislado del import Meta; debe probarse antes de moverlo a otra rama.
- `#198` implementa la base de ERP; `#202`, `#204` y `#207` dependen de esa base y requieren validación conjunta, sin merges a `main` prematuros.
- `#199` sigue sin ser fusionable y la IA se limita a piloto, no a Family Power.
- Mantener `main`, producción y tenant Family Power intactos durante esta fase. No enviar WhatsApp, no activar automatizaciones, no ejecutar cobros ni migraciones reales.

### Evidencia exigida por cada GO

Anotar: fecha/hora, operador, objetivo y pasos, resultado esperado/observado, SHA de fuente y build, entorno y **ref de base QA**, dispositivo/viewport, enlaces a CI/logs anonimizados o capturas sin PII, condición de reversión y persona que acepta. Una pantalla cargada o un test mock `PASS` **no** sustituye E2E autenticado.

**Estado al 18/11/2026: NO-GO para la presentación integral.** Este documento es diagnóstico y plan de verificación, no una certificación de que los casos se hayan ejecutado.

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

1. Crear proyecto Supabase QA físicamente separado, sin duplicar ni consultar la base actual; dos tenants QA-A y QA-B con usuarios distintos y datos sintéticos. No usar "family-power" ni su tenant_id.
2. Configurar un proyecto Vercel QA autónomo con entorno PREVIEW, protección de acceso y variables/endpoint hacia Supabase QA; modificar y AUDITAR la selección de backend antes de acceder a las rutas CRM, ya que hoy lib/supabase.ts codifica el endpoint principal.
3. Instalar RLS/migraciones desde una fuente verificada en QA. No ejecutar migraciones ni scripts SQL contra el proyecto principal.
4. Validar por separado credenciales propietario/cliente (no compartir contraseñas), RBAC A/B, CRUD cross-tenant negado y recorridos Android de clientes/contactos/oportunidades/conversaciones/cotizaciones/pedidos.
5. Integraciones Meta/Odoo/PayPal: solo con sandbox y autorización oficial. No disparar mensajes, compras, cobros, WhatsApp o webhook contra producción. Un plan "active" sin evento de cobro no es un pago recibido.
6. Adjuntar a cada prueba SHA de build, CI URL, captura o registro no sensible, tipo de dispositivo, hora y esperado/observado; pruebas de rendimiento básico.
7. Revisar PR #18 sin fusionar por defecto. Reportar explícitamente cumplido, fallido y pendiente. El criterio de beta se verifica fuera del registro de fixtures.

## Cómo usar

En la ruta /qa/mobile seleccione un caso, registre "pendiente", "bloqueada", "fallida" o —solo para fixtures— "aprobada"; escriba la evidencia, pulse "Guardar resultado local" y exporte el JSON para revisión. Puede importar un JSON de la misma versión y el validador rechazará intentos de inyectar aprobaciones reales.

**Nunca introducir contraseñas, JWT, API keys, correos de clientes, números privados ni capturas con datos reales.** El navegador no respalda este registro en el servidor. La issue #69 sigue abierta hasta completar las verificaciones reales y el informe final.

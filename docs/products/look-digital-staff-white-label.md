# Look Digital Staff — CRM de marca blanca (fase 1)

**Responsable comercial y de servicios:** Ángel Berigüete. **Marca operativa:** Look Social Media. No declarar sociedad nueva constituida ni equipo humano contratado.

## Decisión técnica

Un solo repositorio principal `angelberiguete-pixel/crm` y esquema multiempresa existente en Supabase. Los clientes comparten código mantenido, **nunca información ni accesos**. Para clientes con requerimientos regulatorios, de residencia de datos o aislamiento dedicado: cotizar despliegue y base independientes desde la misma fuente, no mantener un fork artesanal por cliente.

## Lo que incorpora esta rama

- Componente `TenantBrandProvider` únicamente dentro de `TenantPermissionGate`, **después** de validar sesión, rol y tenant.
- Consulta a `tenant_settings` filtrada por tenant actual, utilizando RLS vigente: `private.has_tenant_access(tenant_id)` para lectura y `private.is_tenant_admin(tenant_id)` para cambios.
- Colores y gradientes CSS limitados a un contenedor de la empresa, sin alterar `:root` ni páginas públicas.
- Marca en logotipo, título del navegador, icono de pestaña y menú móvil; logo oficial de Look Social Media intacto en su tenant.
- Los demás tenants utilizan su URL HTTPS aprobada o iniciales con color propio, sin heredar el logo Look.
- Ajustes configurables de nombre, logo, favicon y tres colores; edición verificada con `tenant_id`, validación de URL (HTTPS / ruta local) y colores `#RRGGBB`. Sin contraseñas ni claves.
- Tests unitarios de sanitización y pruebas Playwright Android 390px con Supabase simulado para comprobar cambios de empresa sin mezclar la marca o los datos.
- Sin migraciones y sin modificar registros de producción: se reutilizan columnas existentes.

## Prueba de aceptación antes de comercializar

1. Propietario/administrador accede a su propio tenant y configura nombre, logo y paleta, comprueba vista móvil/escritorio y recarga del navegador.
2. Usuario sin acceso al tenant no puede leer o cambiar `tenant_settings` de esa empresa; realizar prueba RLS con JWT reales en un entorno de pruebas.
3. Cambio A → B → A no deja logo, datos, borradores ni CSS de otra empresa.
4. Los mensajes, contactos, ventas y agentes se filtran por `tenant_id`; verificación E2E independiente del test visual.
5. Imagen remota cargada desde HTTPS segura, con permisos de uso y almacenamiento apropiado; ofrecer alojamiento de archivos de marca propio cuando se implemente.
6. Pantalla de login y URL con dominio propio necesitan una segunda fase: verificación de titularidad del dominio, mapeo seguro de host→tenant, cookies, SSL/DNS, y prevención de acceso a marcas ajenas. **Tener el campo `custom_domain` no es activar un dominio.**
7. Revisión de licencias y crédito de los activos de marca; el cliente aporta autorización sobre su logo.
8. Mantener los consentimientos y permisos independientes para WhatsApp/Meta, correo y agentes IA por empresa; el estatus "conectado" requiere prueba real de proveedor.

## Conexiones posteriores

- **WhatsApp:** adaptador del PR #80, cada Phone Number ID/WABA/Page ID vinculado server-side al tenant verificado; webhook firmado, trazas, ventanas/consentimiento, opt-out y recibos de proveedor.
- **Empleados digitales:** PR #81, usar `ai_agents`, `ai_agent_bindings`, `ai_agent_runs` ya existentes; conocimiento independiente de cada empresa. El gasto de IA pagada permanece **bloqueado por instrucción del usuario**; no cambiar grants de su RPC, no generar tokens de pago ni reactivar sin nueva autorización.
- **Automatizaciones:** aprovechar `automation-engine`, sin duplicar pipeline. Requiere pruebas de idempotencia y control de acciones externas.
- **ERP:** Odoo externo mediante adaptador existente; no recrear contabilidad.
- **Suscripciones:** niveles/entitlements de `plans`, `tenant_subscriptions` ya presentes; cobros reales y facturas requieren autorización e integración verificada.

**Estado:** código en PR #82 (borrador). No está fusionado ni desplegado en `main`. El resultado de CI debe comprobarse contra el commit vigente antes de anunciar listo para producción.


## Family Power — consolidación en el CRM multiempresa (29 octubre 2026)

**Modelo deseado confirmado por Ángel Berigüete:** Inversores & Paneles Family Power, E.I.R.L. será un cliente con espacio privado y marca propia dentro del CRM de Look Social Media. No se mantendrán forks separados por defecto.

**Evidencia auditada:** el proyecto Vercel separado \`family-power-crm-staging\` está marcado READY, pero es un prototipo/demostración y **no prueba CRM operativo con datos de clientes**. El repositorio privado \`angelberiguete-pixel/family-power-crm\` contiene branding y demos en \`main\`; PR #1 (rama \`crm-v048-integration\`) conserva un backend FastAPI/SQLite/PostgreSQL V0.48 no fusionado. Ninguna conexión de Meta, Odoo o IA está verificada; la aprobación contractual de un CRM exclusivo es un punto pendiente del Documento Maestro Family Power V2.

**Lo que incorpora este PR del CRM principal:**
- Sin duplicación de CRM ni alta automática: función admin-only \`platform_create_family_power_tenant\` con ejecución explícita, única por slug \`family-power\`, usa \`platform_create_client_tenant\` original y configura tenant_settings en la misma transacción.
- Las variantes **existentes** de Family Power, aprobadas para uso digital, se copiaron sin alterar sus trazos originales de \`family-power-crm/web/assets/branding/\` a \`public/client-brands/family-power/\` (color, negativa, compacta).
- Logo contrastado en el cliente: \`logo_on_dark_url\` y \`logo_on_light_url\` guardados bajo \`tenant_settings.settings.branding\` (por empresa); la barra lateral elimina el recuadro blanco CSS. El componente \`BrandLogo\` elige por superficie solicitada. No cambiar el logo original de otra empresa.
- Paleta de fuente aprobada: rojo \`#D20A14\`, grafito \`#101115\`, plata \`#DFE1E3\`; es-DO, DOP y America/Santo_Domingo. No cambiar dominios del cliente.
- Plantilla técnica reutilizable \`energia-instalaciones\`: pipeline de consulta, diagnóstico, cotización, aprobación, programación, cierre; módulos de contactos, empresas, productos, cotizaciones, operaciones, informes. \`automations\` y \`ai_agents\` **deshabilitados** al preparar; no pagos ni acciones externas.

**Diferencias que deben verificarse antes de migrar datos:**
| CRM Family Power V0.48 | CRM multiempresa central | Acción |
|---|---|---|
| Clientes/prospectos | contacts/companies | Mapeo de campos, consentimiento, ID origen, duplicados por empresa |
| Productos/servicios | products | Catálogo real y precios solo autorizados; no llenar con datos sintéticos |
| Oportunidades y pipeline | opportunities/pipelines | Etapas de negocio aprobadas |
| Cotizaciones, aprobaciones | quotations, approvals | Comparar cálculo de centavos, auditoría y controles humanos |
| Órdenes e instalaciones | orders, operations y tasks | Validar asignación de técnicos y roles antes de aceptación |
| Usuarios y sesiones FastAPI | Supabase Auth y memberships | **Nunca copiar hashes de contraseña ni sesiones**; invitar usuarios con permisos nuevos |
| Documentos del legado | Storage privado por tenant | Copiar solo con autorización y evidencias de integridad |
| WhatsApp, Odoo, IA | Conectores por tenant | Verificación oficial y prueba real independientes; gasto OpenAI bloqueado |

**Puerta de aceptación:** respaldar fuente legada con hash y conteos; probar asignación de tenant y RLS de cada tabla, dos usuarios con permisos distintos, escritorio/móvil, marca sin fondos cuadrados, privacidad, recuperación, rollback y conformidad del cliente. El \`family-power-crm-staging\` antiguo permanece intacto; apagarlo únicamente cuando la nueva solución sea aceptada y confirmada.

**Estado de esta rama:** preparada para revisión, **NO** es evidencia de que Family Power haya sido creado en la BD, ni de importación, transferencia de contratos o despliegue completado. No ejecutar la función de creación ni cambiar producción sin validación de alcance y acceso.

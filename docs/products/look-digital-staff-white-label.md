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

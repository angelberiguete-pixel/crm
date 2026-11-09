# Empresia

Plataforma empresarial multiempresa de **Empresia**: CRM, ARM, agentes supervisados, automatización y facturación. La integración del motor ERP basado en Dolibarr está en desarrollo, no se presenta como integrada o lista para producción.

## Arquitectura de marca

- **Empresia**: la marca visible única, en Instagram y Facebook (@empresia.rd).
- **CRM**: clientes, contactos, oportunidades, pipeline y seguimiento.
- **ARM**: agentes, automatizaciones, aprobaciones, inbox y comunicación.
- **ERP**: inventario, compras, administración y contabilidad mediante integración progresiva de Dolibarr; no es un producto separado llamado "Empresia ERP".
- **Cada cliente** mantiene nombre, logotipo, permisos y datos aislados por empresa; Family Power conserva su identidad propia.
- Identificadores técnicos históricos como `eurevector`, `look-social-media-lead-capture` y rutas anteriores siguen operativos donde renombrarlos perjudicaría compatibilidad. No son la identidad comercial.

## Stack

- Next.js App Router + TypeScript
- Supabase Auth / PostgreSQL / RLS
- Vercel para frontend
- Recharts, PayPal para facturas e integración de suscripciones en desarrollo
- Dolibarr como motor ERP a integrar; MariaDB persistente en su propio servicio

## Rutas

- `/empresia`: presentación comercial oficial
- `/empresia/start`: vista previa / onboarding
- `/platform-admin`: administración global
- `/agency`: operación comercial interna de Empresia
- `/crm`: área multiempresa de clientes
- `/look-social-media` y `/look-social-media/start`: redirecciones de compatibilidad

## Seguridad

- La marca visible no determina permisos.
- La autenticación se realiza con Supabase Auth; el acceso a datos está sujeto a RLS/RBAC por tenant.
- Ninguna migración de marca cambia `tenant_id`, `tenant_slug`, políticas o credenciales de integraciones.
- La entidad jurídica y el nombre comercial requieren documentación distinta de la identidad visual. Confirmar disponibilidad registral con ONAPI antes de presentar la marca como registrada.

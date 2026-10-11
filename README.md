# Look Social Media CRM

Plataforma CRM multi-tenant de Look Social Media para administrar clientes, ventas, automatizaciones, operaciones, integraciones y servicios de agencia desde un mismo core.

## Stack
- Next.js App Router + TypeScript
- Supabase Auth/Postgres/RLS
- Recharts
- Vercel
- Odoo como ERP externo por tenant cuando aplique

## Arquitectura
- `/platform-admin`: administración global de clientes, planes, módulos e integraciones.
- `/agency`: operación comercial interna de Look Social Media.
- `/crm`: workspace CRM aislado por tenant.
- `/look-social-media`: presencia comercial pública de Look Social Media.

Los identificadores técnicos históricos pueden conservarse internamente cuando cambiarlos implique riesgo de compatibilidad. La identidad visible y comercial de la plataforma es Look Social Media.

## Seguridad
El frontend usa únicamente la publishable key de Supabase. El aislamiento de datos depende de RLS/RBAC por tenant. No se expone service role en el navegador.

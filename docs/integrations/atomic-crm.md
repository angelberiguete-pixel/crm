# Atomic CRM — primera integración selectiva

- Proyecto original: https://github.com/marmelab/atomic-crm
- Revisión inspeccionada: https://github.com/marmelab/atomic-crm/commit/94818e50154093612345cf6ab5a137f152025f77
- Referencias: https://github.com/marmelab/atomic-crm/blob/94818e50154093612345cf6ab5a137f152025f77/src/components/atomic-crm/contacts/contactModel.ts y https://github.com/marmelab/atomic-crm/blob/94818e50154093612345cf6ab5a137f152025f77/src/components/atomic-crm/contacts/ExportVCardButton.tsx
- Autoría original: Francois Zaninotto / Marmelab.
- Licencia: MIT. Aviso íntegro conservado en third_party/atomic-crm/LICENSE.md.

## Alcance implementado

Se adaptó la función de exportar un contacto a vCard 3.0 en
lib/contact-vcard.ts y se añadió una acción **Exportar vCard** a la
lista existente en components/crm-customers.tsx.

La adaptación usa display_name, job_title, company_name, email, phone
y whatsapp_phone de nuestro modelo. No supone que los apellidos estén
desglosados, no importa la base de datos de Atomic CRM, no crea otra
cuenta Supabase ni depende de react-admin o Vite.
Los archivos vCard se generan en el navegador solo con los datos
de contactos ya recibidos para el tenant activo.

Pruebas en tests/contact-vcard.test.mjs cubren estructura, caracteres
especiales, inyección de líneas, Unicode, plegado a 75 octetos
y nombres de archivos seguros.

## Comprobaciones antes de aceptar la PR

1. CI en verde: pruebas vCard, typecheck, build, regresiones tenant.
2. Prueba visual en móvil de 390 px: el botón debe quedar accesible.
3. Probar con un contacto de prueba que el .vcf se importa en Android
   e iPhone con nombre, teléfono, correo y empresa correctos.
4. Confirmar que solo se pueden ver y exportar contactos del tenant activo.
5. Verificar que producción y migraciones SQL siguen sin cambios.

## Próximas integraciones candidatas

- Ficha de contacto enriquecida sin copiar su data provider.
- Filtros y vista de oportunidades.
- Importación de contactos con validación, deduplicación y límites de
  tenant, tras revisar permisos y esquema.

No incorporar la aplicación entera como subdirectorio operativo:
Atomic CRM usa React/Vite/ra-core; el CRM usa Next.js App Router
y políticas Supabase multi-tenant propias. Incorporar todo rompería
la separación de dependencias y dificultaría la auditoría.

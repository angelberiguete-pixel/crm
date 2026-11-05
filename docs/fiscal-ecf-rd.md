# Módulo fiscal e-CF (República Dominicana)

Estado: **fundación de dominio, NO apto para emisión fiscal real**.

## Objetivo
Un núcleo reutilizable para el CRM multi-tenant, integrable con aplicaciones independientes sin compartir datos de clientes.

## Límites actuales
- `src/lib/fiscal/ecf-domain.ts`: tipos e-CF, estados, validación preliminar y cálculo de vista previa.
- No genera XML fiscal, no asigna e-NCF, no firma digitalmente, no transmite a proveedor/DGII.
- La comprobación de formato de RNC/cédula NO valida existencia ni dígito verificador.
- Las tasas 0/16/18 % son una validación preliminar, NO un catálogo normativo completo.
- El redondeo de vista previa NO sustituye reglas del esquema e-CF.
- Los borradores deben permanecer fuera de la contabilidad fiscal hasta emisión y aceptación confirmadas.

## Próximos entregables
1. Auditar estructura real de tenant, RBAC, ventas, cotizaciones y conexión Supabase.
2. Diseñar tablas con `tenant_id` y políticas RLS verificadas con usuarios de empresas distintas.
3. Crear flujo borrador → aprobación humana → solicitud idempotente → estado externo verificado.
4. Implementar interfaz `FiscalProvider` con adaptadores intercambiables y simulador claramente rotulado.
5. Seleccionar proveedor autorizado de DGII y obtener credenciales **sandbox** (nunca en frontend).
6. Implementar webhook autenticado, registro de eventos, reintentos y almacenamiento privado de XML/PDF.
7. Verificar los esquemas y reglas oficiales DGII vigentes, pruebas técnicas, autorización del contribuyente.
8. Pruebas de extremo a extremo, de concurrencia, de permisos y despliegue a staging.
9. Producción solo tras autorización/certificación y aprobación expresa de la empresa emisora.

## Restricciones de seguridad
- Nunca usar `service_role` ni claves fiscales en el navegador.
- Ningún agente de IA emite sin aprobación humana.
- Ninguna factura enviada se elimina; correcciones por el procedimiento fiscal aplicable.
- No permitir cambiar `tenant_id` desde entradas del cliente sin comprobación de pertenencia.
- No simular respuestas DGII como aceptaciones reales.

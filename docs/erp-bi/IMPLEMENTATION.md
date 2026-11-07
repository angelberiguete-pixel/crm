# ERP + BI — implementación incremental
## Fuente y estrategia
- Referencia principal: https://github.com/odoo/odoo
- Referencias de informes: https://github.com/OCA/reporting-engine y https://github.com/OCA/mis-builder
- No se incorpora código de Odoo ni OCA en este PR. Revisar licencias antes de reutilizar.
- Mantener Next.js + Supabase; Odoo NO está instalado ni conectado.

## Entrega en esta rama
- `lib/erp-bi/metrics.ts`: contrato y cálculo puro de KPIs.
- `tests/erp-bi-metrics.test.mjs`: regresiones de cálculo, ceros e inconsistencias.
- Para ejecutar: `node --test tests/erp-bi-metrics.test.mjs` (requiere dependencias npm instaladas).

## Definiciones de métricas (provisionales)
- Ingreso neto: ventas pagadas menos reembolsos.
- Beneficio bruto: ingreso neto menos costo de mercancía vendida.
- Margen bruto: beneficio bruto / ingreso neto.
- Conversión: cotizaciones aceptadas / cotizaciones emitidas.
- Cuentas por cobrar: saldo entregado por origen autorizado.
Los KPIs NO son todavía un informe contable validado.

## Próxima integración obligatoria
1. Identificar esquema real de ventas, pagos, cotizaciones y membresías.
2. Construir agregaciones SQL server-side con tenant derivado de sesión autenticada, nunca de parámetro confiado.
3. Validar RLS con dos empresas y usuario sin membresía.
4. Añadir API y panel de lectura con estados vacío/error y trazabilidad de origen.
5. Agregar productos, movimientos de inventario, compras, facturas y conectores Odoo por etapas.
6. Ejecutar CI, build y pruebas E2E antes de desplegar staging.
7. No fusionar ramas ajenas ni modificar Family Power.

## Seguridad
No usar service role en navegador, no exponer datos de otra empresa, no inventar métricas y no emitir e-CF sin homologación DGII.

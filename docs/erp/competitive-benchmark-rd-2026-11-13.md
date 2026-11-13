# Empresia — benchmark ERP y facturación RD (13 noviembre 2026)

**Decisión:** superar la experiencia comercial/operativa de BRISYSTEM, SIGMA/Zentrix, Alegra y soluciones basadas en Odoo con evidencia de flujos reales. No equiparar marketing de un competidor con producto demostrado. No clonar código, marcas o diseños propietarios.

## Fuentes y hallazgos contrastables

| Referente | Qué aporta al análisis | Limitación de la evidencia | Fuente |
|---|---|---|---|
| SVH / Soluciones Vargas Hernández | Su anuncio aportado por cliente presenta facturador privado: productos/clientes, inventarios, ventas/caja, compras/gastos, CxC/CxP, reportes, pedidos/delivery, WhatsApp y consultas móviles | Son afirmaciones del anuncio; el sitio público confirma servicios empresariales/fiscales, no una demo operativa o API del facturador | https://solucionesvargashernandez.com/ |
| Facturador Gratuito DGII | Emisión de e-CF por contribuyentes elegibles y solicitud vía Oficina Virtual; referente de costos y simplicidad | Empresia **no** está certificado ni habilitado para emisión fiscal de producción | https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Paginas/facturador-gratuito.aspx |
| Alegra RD | Facturación/e-CF, catálogos, cobranza, WhatsApp, POS, API, reportes 606/607, contabilidad, inventario, lotes, conciliación y opciones de IA. ERP publica Inicial US$79/mes, Pro US$129/mes, Plus US$199/mes bajo facturación mensual | Precios y capacidades dependen del plan y están sujetos a cambios; no implican todos los módulos para todos los usuarios | https://www.alegra.com/rdominicana/precios/ |
| CHAI Consulting & Software | Integrador Odoo de RD: implementación por sector, configuración, entrenamiento, soporte y metodologías; Odoo es una referencia para almacenes, contabilidad, POS, proyectos y servicios | CHAI es **integrador**, no evidencia de un ERP propio independiente. No copiar Odoo Enterprise ni reutilizar fuentes sin revisar licencia | https://www.odoo.com/es/partners/chai-consulting-and-software-14439863 |
| BRISYSTEM / RSE Tecnologías | Anuncio: ventas, compras, inventario, contabilidad, clientes | Sin acceso probado a software, precios o API | Fotografía facilitada; investigación previa |
| SIGMA Cloud / Zentrix | Competidor dominicano en ERP y administración | Funciones publicadas no equivalen a prueba de ejecución | https://www.sigmaerpcloud.com/ y https://zentrixerp.net/ |

## Objetivo del producto, por orden

### P0 — un flujo demostrable antes de proclamar superioridad
1. WhatsApp Business oficial → conversación en buzón del tenant → contacto → respuesta supervisada, deduplicación, asignación y auditoría. Issue #67.
2. Pedido aprobado → reserva de inventario → despacho autorizado → factura **comercial** persistente → cobro humano confirmado y trazable, con un único registro por operación. PR #198.
3. Aislamiento multiempresa y experiencia desde Android, con evidencias; no utilizar identidades ni cobros de Family Power como fixtures. Issue #69.

### P1 — paridad administrativa verificable
- Ventas y caja/POS con cierres por cajero y control de movimientos; **offline solo tras** resolver sincronización, idempotencia y conflictos.
- Compras, gastos, proveedores, CxP, inventario por almacén, productos y reportes 606/607 **preparatorios**.
- CxC con antigüedad, recordatorios bajo consentimiento y estado real de cobranza. Nuevo cálculo de esta rama.
- Contabilidad de partida doble persistente, plan de cuentas, bloqueo de períodos, reversión y conciliación bancaria con pruebas de centavos, RLS y auditoría.
- Facturación DGII: XSD vigente, certificados, firma, autorización del emisor, secuencias, recepción/respuestas y verificación con DGII antes de afirmar capacidad fiscal. Preparar integración con PSFE autorizado como alternativa; nunca simular estado de envío.

### P2 — diferenciación y sectores
- Bandeja omnicanal y asistentes IA con permisos mínimos, aprobación humana para precios, descuentos, pedidos, inventario y cobros.
- Portal de cliente, facturas y cotizaciones móviles; solicitudes de entrega, logística y seguimiento.
- Verticales: energía solar/instalación/servicio técnico; minimarket/colmado; restaurante; comercio mayorista. Activar cada uno solo después de procesos transaccionales base.
- Servicios de implantación y capacitación, con checklist de migración/carga de saldos, respaldo y soporte como práctica competitiva aprendida de CHAI.

## Cambio ejecutable de la rama: antigüedad de cuentas por cobrar
- `lib/erp-native/receivables-aging.ts`: derivación pura desde facturas comerciales guardadas, sin escrituras y sin transformar valores con Number; agrupa DOP/USD/EUR por separado.
- `components/erp-native-commercial.tsx`: resumen de deuda por vencer, 1–30, 31–60, 61–90, >90 días. Muestra claramente que el conjunto consultado es **máximo 250 facturas**, no todo el libro mayor.
- `tests/erp-native-receivables-aging.test.mjs`: límites de fechas, saldos pagados, moneda separada, magnitudes elevadas, empresas mezcladas, duplicados e inconsistencias.
- Workflow ERP: ejecuta el test adicional en PR.

**Límites:** no es un sistema de cobranza automática, no calcula intereses ni emite reportes fiscales. No se ha aplicado ninguna migración, desplegado a producción, enviado dinero ni cambiado Family Power. El código depende de PR #198, aún borrador, y requiere sus migraciones de facturación comercial en un entorno de prueba.

## Criterios de salida medibles
- Pruebas unitarias, TypeScript, build y UI móvil completados en CI **para el SHA exacto**.
- SQL/tenant A vs B en base desechable con RLS real, sin usar clientes vivos.
- Contrato `saldo = total - pagos confirmados`, sin mezclar divisas; conciliación de la cartera completa antes de ofrecer un KPI global.
- NCF/e-CF solo en ambiente DGII correspondiente y con autorización real, nunca en demo disfrazada.
- Ningún merge/despliegue principal hasta validar dependencias y confirmar que Family Power no cambia.

## Enlaces internos
- Base del ERP nativo: https://github.com/angelberiguete-pixel/crm/pull/198
- WhatsApp: https://github.com/angelberiguete-pixel/crm/issues/67
- Calidad y beta: https://github.com/angelberiguete-pixel/crm/issues/69

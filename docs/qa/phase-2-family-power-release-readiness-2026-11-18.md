# Empresia / Family Power — auditoría QA de fase 2

**Fecha de corte:** 2026-11-18. **Decisión:** NO-GO para presentar una entrega integral. Este documento se mantiene en una PR borrador; no es una certificación.
**Repo:** `angelberiguete-pixel/crm` · **Vercel:** `crm` · **Supabase principal:** `ygipjqgyreeahslzorik` · **PR:** #203.

## Alcance y fuentes

- Datos de solo lectura consultados en GitHub (PR y CI), proyecto Vercel `crm` y metadatos/Advisors de Supabase principal. No se consultaron ni modificaron registros personales del cliente.
- CI previamente aprobada en SHA `e7d30e9`: [CRM CI](https://github.com/angelberiguete-pixel/crm/actions/runs/44250300284). La certificación del **nuevo** SHA exige otro resultado verde; los fallos intermedios de CI constan en el historial de la PR.
- Producción Vercel `READY` en SHA `3d7a6ecf8c9aaa13fdc7c1abe673645962a4eed3`. READY no acredita login, BD, ERP ni WhatsApp de extremo a extremo.
- Supabase principal tiene 223 migraciones registradas, última `20261110151733`; rama de branching `main` informa `MIGRATIONS_FAILED` desde el 11/11, pese al proyecto principal `ACTIVE_HEALTHY`. Se necesita log de acción/migración de la rama y ensayo aislado antes de resolver; no hacer reset/rebase/migraciones de producción.
- No se ha creado ni desplegado un staging nuevo en esta fase. `vercel.json` mantiene auto-deploy solo para `main` y el centro QA de #203 es fixture-only.

## QA-01 a QA-20: matriz honesta

**Leyenda:** APROBADO = solo en el ámbito indicado con evidencia; BLOQUEADO = no ejecutable sin una dependencia; NO VERIFICADO = no hay evidencia suficiente. Una prueba simulada aprobada nunca es una aprobación E2E.

| ID | Ámbito | Estado | Evidencia y condición de salida |
|---|---|---|---|
| QA-01 | Cambio A/B, fixtures | APROBADO (fixture anterior) | CI `44250300284`; volver a comprobar SHA nuevo; no equivale a RLS real. |
| QA-02 | Empresas/contactos móvil, fixtures | APROBADO (fixture anterior) | CI `44250300284` / prueba navegador simulada; Android físico pendiente. |
| QA-03 | Oportunidades, fixtures | APROBADO (fixture anterior) | CI `44250300284` / APIs simuladas. |
| QA-04 | Buzón, fixtures | APROBADO (fixture anterior) | CI `44250300284` / lectura y estados simulados; no hay recepción oficial. |
| QA-05 | RBAC de UI, fixtures | APROBADO (fixture anterior) | CI `44250300284` / no acredita denegación RLS del servidor. |
| QA-06 | Login propietario/cliente | BLOQUEADO | Dos cuentas y sesiones QA reales aisladas, Android físico. |
| QA-07 | RBAC real | BLOQUEADO | Denegar acceso A/B con identidades distintas en QA. |
| QA-08 | RLS CRUD A/B | BLOQUEADO | SELECT/INSERT/UPDATE/DELETE autorizados/denegados en BD QA. |
| QA-09 | Cotización/pedido real | BLOQUEADO | Persistencia, aprobación y PDF con datos sintéticos. |
| QA-10 | Publicación, SHA, rendimiento | BLOQUEADO | Preview protegida, build SHA exacto, mediciones Android. |
| QA-11 | Pago SaaS vs suscripción | BLOQUEADO | Sandbox y eventos de cobro verificables, no pagos reales. |
| QA-12 | Meta OAuth | BLOQUEADO | Cuenta Meta de prueba y autorización oficial verificadas. |
| QA-13 | Odoo/Dolibarr | BLOQUEADO | Servidores de prueba y espejo de solo lectura; sin motores conectados confirmados. |
| QA-14 | Pasarela de pago | BLOQUEADO | Credenciales sandbox y webhook verificado. |
| QA-15 | PR #18 / duplicaciones | BLOQUEADO | PR #18 abierta y `mergeable=false`; revisión de conflicto antes de fusionar. |
| QA-16 | Aislamiento preview | BLOQUEADO | Selección de Supabase endurecida en #203, pero sin QA desplegada ni verificación de todos los endpoints server/Edge. |
| QA-17 | ERP transaccional | BLOQUEADO | Falta migración QA y prueba concurrente real; esquema principal no cumple nuevas tablas/columnas. |
| QA-18 | WhatsApp oficial | BLOQUEADO | #209 corrige import Edge (CI verde en `76a7e349`), pero faltan despliegue QA, HMAC, routing, Buzón, estados y prueba oficial. |
| QA-19 | Seguridad | BLOQUEADO | Advisors: 2 SECURITY DEFINER anónimas, 58 autenticadas, 17 tablas RLS sin políticas; revisar intención y privilegios sin alterar producción. |
| QA-20 | Cliente GO/NO-GO | BLOQUEADO | Falta circuito en staging, Android físico, acta de aceptación y rollback probado. |

## Registro de defectos, correcciones y dependencias

| Identificador | Hallazgo | Medida implementada o pendiente |
|---|---|---|
| QA-F01 | `lib/supabase.ts` fijaba producción incluso en preview. | **Corregido en código de #203:** selector por target sellado durante build; modo no productivo sin configuración QA usa `.invalid`. Falta CI del último SHA y preview. |
| QA-F02 | Ausencia del flag QA permitía que preview atravesara el proxy. | **Corregido en #203:** denegación 404 por defecto en Vercel preview fixture-only. |
| QA-F03 | Pruebas antiguas interceptaban URL productiva y su token local. | **Corregido en código de #203:** fixtures de navegador actualizadas para interceptar `qa-not-configured.invalid` y sesión sintética. CI final por comprobar. |
| QA-F04 | Contrato de prueba del proxy esperaba la condición antigua. | **Corregido en #203:** aserción adaptada al guard fail-closed. |
| DB-B01 | Branch `main` con `MIGRATIONS_FAILED`. | Bloqueado: identificar paso y versión exacta con logs de la acción en Supabase, sin reset automático. |
| ERP-B01 | No hay `inventory_warehouses` ni `inventory_stock_locations` en esquema principal, ni `inventory_items.category/product_id`. | Bloqueado: migración y pruebas PostgreSQL QA desde #198; no habilitar inventario real. |
| WA-B01 | #209 sin empaquetado Edge ni mensaje oficial aprobado. | Bloqueado: validar primero con fixtures, luego número/cuenta oficial de prueba sin automatización. |
| SEC-B01 | Hallazgos de SECURITY DEFINER y RLS. | Bloqueado: determinar qué permisos son intencionados y agregar tests A/B antes de proponer REVOKE/ALTER. |

## Dependencias entre ramas

- #198 ERP nativo es la base para #202 (Family Power), #204 (Odoo/Dolibarr) y #207 (CxC). Todas permanecen en borrador. Ninguna debe fusionarse por el resultado de otra rama.
- #209 aporta una corrección aislada de import del receptor Meta. Las issues #67 y #120 mantienen los criterios de integración real; un Edge Function listado como `ACTIVE` no prueba que esté desplegado el commit #209.
- #203 controla únicamente la evidencia de QA y los fixtures. La PR #18 todavía requiere reconciliación; no se fusiona.
- Familia Power y `main` se mantienen intactos; no se activan IA automática, cobros, envíos de WhatsApp, integraciones ni migraciones.

## Preparación de staging (pendiente de aprobación y recurso)

1. Obtener evidencia de por qué falló el runner de branching de Supabase; revisar logs de la acción, versión de migración fallida y compatibilidad con las 223 remotas, sin ejecutar cambios en la principal.
2. Crear o habilitar una rama QA real con datos sintéticos y dos tenants de prueba, tras autorización del costo anunciado (consulta actual: **USD 0.01344 por hora**). No se creó ningún recurso facturable.
3. Configurar variables preview del proyecto Vercel existente: `NEXT_PUBLIC_EMPRESIA_QA_PROJECT_REF`, `NEXT_PUBLIC_EMPRESIA_QA_SUPABASE_URL`, `NEXT_PUBLIC_EMPRESIA_QA_SUPABASE_PUBLISHABLE_KEY`. Las tres deben pertenecer a la misma base QA, nunca al ref principal.
4. Auditar también clientes servidor, rutas API y Edge Functions antes de retirar el bloqueo `proxy.ts` sobre rutas CRM. Hasta entonces mantener el centro limitado a `/qa/mobile` y recursos estáticos.
5. Ejecutar pruebas del tenant QA-A y QA-B, observación de red, contrapruebas RBAC/RLS, exportar evidencia sin PII y certificar SHA exacto; **no** usar credenciales o datos de Family Power.

## Ensayo sintético para demostración de Family Power

Con cuentas y registros ficticios: iniciar sesión como owner QA-A; crear contacto; abrir oportunidad; generar cotización y PDF; aprobar; convertir a pedido; reservar stock; ejecutar entrega; generar factura comercial; registrar cobro parcial sintético; crear seguimiento. Probar después el vendedor con permisos limitados y usuario QA-B, verificando que no ve datos del otro tenant. Solo si Meta está autorizado y verificado, mostrar mensaje entrante en Buzón y respuesta con confirmación del proveedor; si no, etiquetar explícitamente 'simulación'. Capturar pantalla móvil y escritorio con fecha/SHA, sin datos personales.

## Condiciones objetivas GO / NO-GO

- **GO técnico:** CI, migraciones QA, RBAC/RLS de servidor, ERP transaccional, auth, móvil real y rollback probados para el SHA desplegado; incidentes P0 cerrados. Integraciones externas no demostradas deben quedar deshabilitadas y etiquetadas como no incluidas.
- **GO cliente:** alcance exacto acordado y demostrado, datos sintéticos retirados, aprobación de los responsables, registro de pendientes y plan de soporte.
- **NO-GO actual:** QA-06 a QA-20 bloqueadas. No confundir `READY`, CI de fixtures, prototipos o funciones Edge activas con una integración funcional validada.

## Fuentes oficiales para revisar hallazgos

- [Supabase RLS sin políticas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
- [Supabase SECURITY DEFINER anónimo](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)
- [Supabase SECURITY DEFINER autenticado](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
- [Protección contraseñas filtradas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
- [Branching y migraciones](https://supabase.com/docs/guides/deployment/branching/working-with-branches)

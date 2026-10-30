# CRM de Ventas Inteligentes — validacion, comisiones y asistente IA
**Responsable y marca comercial:** Ángel Berigüete  
**Tipo:** propuesta de implementacion en el CRM multi-tenant existente, no un producto paralelo.  
**Origen funcional:** video de referencia compartido el 29 de octubre de 2026 (ejemplo ARM/JARVIS).  
**Estado:** especificacion; ninguna funcion de esta propuesta debe describirse como desplegada sin prueba.

## 1. Objetivo
Una empresa registra ventas desde una interfaz movil y eventualmente desde canales autorizados; un lider las revisa; al aprobar, se actualizan historiales, indicadores y asientos de comision auditables. Un asistente IA permite consultar datos autorizados, preparar mensajes e iniciar solicitudes con supervision humana.

## 2. Reutilizar lo existente
- CRM con `tenants`, autenticacion y permisos RLS/RBAC.
- `contacts`, `companies`, `opportunities` y pipelines.
- Studio de automatizacion y worker: usar eventos, no crear otro motor.
- `ai_agents`, `ai_agent_runs`, `ai_agent_bindings` y estudio de empleados digitales.
- Receptor Meta WhatsApp con HMAC, deduplicacion y `meta_whatsapp_routes` verificados; conexion real por cuenta solo despues de autorizacion y prueba end-to-end.
- Dashboards y canal/tenant context del repositorio.
No migrar ni copiar prospectos a un sistema paralelo.

## 3. MVP — flujo basico
1. Vendedor autenticado crea **solicitud de venta** asociada a contacto/oportunidad de su empresa: cliente, concepto, importe, moneda, fecha, origen y observaciones. La interfaz no inventa ningun dato.
2. Guarda como `draft` o envia como `submitted`. El backend valida permisos, monto > 0, pertenencia tenant y clave de idempotencia.
3. Lider/owner/admin autorizado visualiza cola y **aprueba o rechaza** con motivo. El vendedor no puede aprobar sus propias solicitudes salvo configuracion expresa, auditada y revisada.
4. Aprobacion transaccional, una sola vez: registra aprobador y hora, conecta la oportunidad existente sin duplicar cliente, emite evento de negocio, calcula la comision sobre una regla aprobada previamente y guarda snapshot de la regla.
5. Estado `approved` no significa `paid`. La comision pasa por estados separados `pending`, `eligible`, `paid` y `reversed`. No ejecutar transferencias bancarias.
6. El vendedor visualiza confirmacion; el lider ve tableros por vendedor, periodo, fuente y estado.
7. IA: primero responde consultas de lectura y genera **borradores** con citas/enlaces a registros del tenant; cualquier modificacion, confirmacion de venta, mensaje externo o comision requiere validacion humana.

## 4. Contrato propuesto de datos (ajustar a esquema real tras auditoria)
- `sales_submissions`: id, tenant_id, opportunity_id, contact_id, submitted_by, product_or_service, gross_amount, currency, status, submitted_at, idempotency_key, created_at.
- `sales_approval_events`: id, tenant_id, sale_id, actor_id, from_status, to_status, reason, created_at (append-only).
- `commission_rules`: tenant_id, nombre, tipo (porcentaje/fijo), alcance, valor, vigencia, aprobador; almacenar versiones para no reescribir historicos.
- `commission_ledger`: id, tenant_id, sale_id, beneficiary_id, rule_version, base_amount, commission_amount, currency, status, settled_at, adjustment_reason. Unico asiento base por venta-beneficiario-regla.
- `sales_outbox_events`: id, tenant_id, aggregate_id, kind, event_key unico, status, next_attempt_at, attempts para entregas asíncronas idempotentes.
En todos: aislamiento por tenant y politicas RLS; controles sensibles en RPC/servidor con bloqueo transaccional y auditoria. Las relaciones se ajustaran tras examinar esquema y permisos reales.

## 5. Paneles y roles
**Vendedor:** registrar/buscar ventas, seguimiento, comisiones propias, notificaciones.  
**Lider:** cola de aprobacion, motivos de rechazo, resumen del equipo.  
**Owner/admin:** reglas y versiones de comisiones, estadisticas, auditoria y permisos.  
**Agente IA:** permisos minimos; lectura en primera fase, cambios siempre sujetos a autorizacion.

Indicadores: valor y cantidad de solicitudes/ventas aprobadas, tasa de rechazo, tiempo de validacion, venta por vendedor y fuente, comisiones pendientes y pagadas, reversos. No usar valores de prueba como dinero real.

## 6. WhatsApp — fase separada con Meta oficial
- Al principio, **notificaciones internas en el CRM**; no afirmar que WhatsApp esta activo.
- Cuando el responsable conecte y verifique WABA/Phone Number ID/canal, habilitar webhooks firmados, deduplicacion, enlace de usuario autorizado y recibos de entrega.
- Para contactos clientes: consentimiento documentado, ventanas/categorias/plantillas vigentes, opt-out, limites de gasto y paso a humano.
- Para vendedores/lideres: autenticar vinculacion entre WhatsApp y usuario CRM; no aceptar un simple texto 'aprobado' sin token vinculado, expiracion, firma y autorizacion.
- La IA no debe enviar mensajes a prospectos ni aprobar ventas de manera autonoma en MVP.
- Credenciales solo en secretos del servidor; sin envio masivo en frio ni accesos a chats personales.

## 7. Experiencia tipo JARVIS — fase posterior
Intenciones iniciales en modo lectura: 'mis ventas pendientes', 'ventas aprobadas esta semana', 'comisiones por pagar', 'cuales clientes requieren seguimiento'. Respuestas filtradas por tenant/rol y trazables a consultas reales. Intenciones mutables: proponer tarea o reporte, pedir confirmacion explicita y ejecutar por herramienta autorizada con auditoria. Evitar alucinaciones, consultas SQL arbitrarias y acceso entre empresas.

## 8. Secuencia de desarrollo y criterios de aceptacion
**M1 — auditoria tecnica:** verificar esquema, roles, RLS, CI y estado real de integraciones. No afirmar despliegue por presencia de codigo.  
**M2 — ventas y aprobaciones:** migraciones reversibles, RPCs, interfaz responsive y tests de permisos/idempotencia/concurrencia.  
**M3 — comisiones y tableros:** reglas versionadas, libro contable, reversos, exportables y pruebas exactas.  
**M4 — IA supervisada:** preguntas filtradas por tenant; borradores, revision humana, limite de costes.  
**M5 — WhatsApp oficial:** solo con portafolio verificado, consentimiento y prueba extremo a extremo.
En cada hito: typecheck, test, build, pruebas de usuario autenticado, pruebas multi-tenant A/B, y evidencia de despliegue en staging. Produccion requiere autorizacion separada.

## 9. Casos de prueba indispensables
- El mismo evento enviado dos veces crea una sola venta/comision.
- Dos lideres aprobando simultaneamente provocan una sola transicion.
- Vendedor no puede aprobar, alterar montos aprobados o ver otros vendedores sin permiso.
- Empresa A no ve datos, agentes ni mensajes de B.
- Venta rechazada no genera comision; reverso crea ajuste auditado sin borrar registros.
- No hay comision pagada por solamente pulsar 'aprobar'.
- IA no escribe ni envia mensajes sin aprobacion; si falta API/secretos, falla cerrado.
- WhatsApp no aparece como conectado por un mero estado visual.

## 10. Fuera del primer MVP
Transferencias y cobro automatico, lectura de WhatsApp personal, envio a contactos no consentidos, voz en tiempo real, llamadas automaticas y agente que aprueba y paga sin supervision.

## 11. Primer entregable codificable
Iniciar con M1/M2 en una rama independiente; no migrar tablas reales ni fusionar a `main` hasta revisar contratos de datos y tests.

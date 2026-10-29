# Look Digital Staff — Empleados Digitales con IA (MVP 0.1)

**Marca operativa:** Look Social Media. **Prestador y director comercial:** Ángel Berigüete. No presentar como nueva sociedad formalizada ni como personal humano contratado.

## Propuesta comercial
Vender una función de negocio con métricas verificables, no solo un bot. El agente digital trabaja con información autorizada de cada empresa, prepara respuestas y solicitudes, y transfiere a personas los asuntos sensibles.

**Roles:** Recepcionista IA (consultas/citas), Asesor comercial IA (calificación/seguimiento), Secretaria IA (documentos/agenda, futuro), Cobros IA (cuentas autorizadas, futuro), Voz IA (futuro condicionado a proveedor y consentimiento).

**Primer producto:** Look Digital Staff — Atención + Ventas. El MVP comienza con recepcionista y asesor comercial, ya que se pueden probar sin exponer operaciones financieras ni enviar mensajes reales.

## Desarrollo técnico en rama
- Usa las tablas existentes ai_agents, ai_agent_runs, ai_agent_bindings y permisos multiempresa: NO otra base ni otro CRM.
- Ruta CRM /crm/employees. Alta y edición de empleado en modo borrador, sin activar respuestas automáticas. Base de conocimiento estructurada en settings.knowledge del agente; solo información verificada del negocio.
- Función Supabase Edge ai-employee-draft: verifica sesión del usuario, empresa y rol propietario/administrador, estado draft, modalidad human_approval y herramientas vacías antes de usar modelo externo.
- Respuesta guardada en ai_agent_runs con estado awaiting_approval y tokens observables. No envía WhatsApp, correo, cotizaciones ni órdenes.
- Pruebas de límites, aislamiento de código, reglas y flujo comercial manual. La función requiere configurar OPENAI_API_KEY y AI_EMPLOYEE_MODEL en secretos de Supabase tras aprobar gastos; sin claves devuelve ai_provider_not_configured.
- Límite inicial 20 pruebas por tenant por 24 h, sin tarifa variable calculada; contador simple no atómico. Para SaaS vendible debe reemplazarse por reserva de cuota y presupuesto atómicos.

## Lo que NO está activado
Este PR está aislado en GitHub: NO publicado, no migraciones, no gasto de API, no agente real creado, no comunicaciones enviadas y no piloto Sublimaciones Lazala autorizado. La integración Meta/WhatsApp del PR #80 sigue separada y pendiente de cuentas verificadas. Tampoco hay ERP/voz ni cobro automático.

## Suscripciones orientativas para VALIDAR
| Plan | Mensualidad RD$ | Oferta inicial sujeta a capacidad y límites |
| --- | ---: | --- |
| Inicio | 4,900 | 1 agente, conocimiento y borradores, cupo de uso |
| Crecimiento | 9,900 | Atención + ventas, pipeline y supervisión |
| Empresarial | 19,900 | Varios roles, integración autorizada y soporte pactado |

Implementación RD$10,000–30,000 según alcance. No son tarifas verificadas del mercado ni incluyen tráfico ilimitado. Definir mensajes Meta, tokens de IA, voz, alojamiento, soporte y horas de configuración. Simulación ilustrativa 25 x RD$9,900 = RD$247,500 MRR bruto sin costos, cancelaciones o impuestos. Contratos y facturación a nombre del prestador correcto.

## Restricciones y privacidad
- La IA no inventa precios, garantías, horarios, disponibilidad ni confirma citas; siempre solicita aprobación humana para propuestas y mensajes sensibles.
- Los ensayos requieren escenarios ficticios; no utilizar clientes reales ni PII para pruebas sin base legal y consentimiento.
- Las políticas WhatsApp actualizadas al 23 sep 2026 exigen plantillas aprobadas para iniciar conversaciones, 24 horas de ventana de respuesta y vía clara a agente humano. Las tarifas dependen de categoría/mercado y tienen cambios desde octubre de 2026: verificar antes de publicar precios.
- Credenciales solo en Edge Functions Secrets, no en navegador, repositorio ni capturas.
- El producto se prueba primero en entorno sintético; piloto de Sublimaciones Lazala solo con autorización del responsable.

## Criterios de aceptación
1. Un administrador configura empleado con datos verificados de su empresa; otro tenant no puede leer ni modificar su configuración o ejecuciones.
2. El sistema rechaza prompts excesivos, agentes no borrador, permisos insuficientes y herramienta no autorizada.
3. Con un modelo aprobado y credenciales autorizadas, una pregunta ficticia genera un borrador auditable, nunca se envía.
4. Los casos de dato desconocido, precio y cita pasan a consulta humana en pruebas funcionales.
5. CI de GitHub aprueba typecheck, test y build. Verificar E2E autenticado con Supabase y proveedores sandbox antes de fusionar y publicar.
6. Comercializable solamente con Meta/WhatsApp real autorizado, consentimiento y plantillas, trazas de entrega, human handoff, cuotas atómicas, controles de costos, soporte y términos contractuales.

**Referencias:** https://whatsappbusiness.com/policy/ y https://developers.openai.com/api/docs/pricing

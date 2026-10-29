# Activación del proveedor IA de Look Digital Staff (controlada)

Fecha de verificación: 29 octubre 2026. **Estado: código preparado en PR #81, no desplegado; no se ha gastado dinero ni probado una llamada real con una clave de OpenAI.**

## Proveedor recomendado y coste comprobado

- Modelo API fijado: \`gpt-5.4-mini-2026-03-17\`. No se aceptan otros modelos desde el navegador ni se puede cambiar el modelo de forma accidental mediante variables sin actualizar precios, controles y pruebas.
- Tarifas vigentes del modelo: **US$0.75 / 1M tokens de entrada** y **US$4.50 / 1M de salida**. URL oficial: https://developers.openai.com/api/docs/models/gpt-5.4-mini .
- Se usa Responses API \`POST /v1/responses\` con \`store:false\`, \`reasoning.effort:"none"\`, \`max_output_tokens:450\` y JSON Schema estricto para \`draft\`, \`intent\`, \`next_step\`, \`requires_human\`. Los resultados quedan en \`ai_agent_runs\` como borradores \`awaiting_approval\`; NO se envía mensaje ni se actualiza automáticamente el pipeline.
- Para volumen alto también se podrá evaluar gpt-5.4-nano con precios y pruebas propios: **no es intercambiable** con la lógica económica anterior.

## Presupuesto: dos barreras de consumo

**Barrera interna** (SQL transaccional, primer alcance piloto):
- \`AI_EMPLOYEE_TENANT_MONTHLY_BUDGET_USD\`: máximo reservado por tenant / mes UTC, USD exactos con hasta dos decimales.
- \`AI_EMPLOYEE_GLOBAL_MONTHLY_BUDGET_USD\`: máximo reservado para **todos** los tenants / mes UTC.
- Un request reserva antes de la llamada el coste conservador de todos sus tokens de entrada, más 450 tokens de salida. No puede exceder ninguno de los dos presupuestos, ni 20 pruebas/día/tenant. Se serializa por fila global para evitar concurrencia peligrosa.
- No se liberan reservas no utilizadas ni llamadas fallidas en este piloto. Es conservador y puede bloquear antes del límite monetario; el costo real estimado se registra en \`ai_agent_runs.estimated_cost_micros\` para auditoría.
- Sin valores válidos y sin API key, **fail-closed**: el backend devuelve \`ai_budget_not_configured\` o \`ai_provider_not_configured\`, sin contactar el proveedor.
- **Ejemplo de configuración, NO presupuesto autorizado ni aplicado:** tenant=US$2.00 y global=US$5.00 por mes. Una primera validación con un solo negocio puede utilizar valores bajos; el responsable decide el límite de dinero de antemano. La cuenta OpenAI debe tener crédito o facturación configurada.

**Barrera en el proveedor** (obligatoria para un lanzamiento real):
- En https://platform.openai.com/ ve a **Organization settings → Project → Limits → Monthly spend limit**, configura un máximo y activa **Enforce a hard limit**. Configura también alertas (p. ej. 50% y 90%) y permite solamente el modelo fijado en esta integración.
- Según OpenAI, los límites del proveedor se aplican a partir de consumo registrado; el gasto podría superar ligeramente el límite. Por eso usamos también reservas transaccionales internas y un proyecto API separado, con una clave exclusiva.
- Más información oficial: https://help.openai.com/en/articles/9186755-managing-projects-in-the-api-platform y https://help.openai.com/en/articles/6614457-troubleshooting-api-usage-and-spend-limits .

## Conexión segura desde Supabase

1. Revisar y aprobar el PR #81 y las migraciones versionadas, especialmente \`20261028235000_ai_employee_atomic_trials_and_reviews.sql\` y \`20261029041000_ai_employee_budget_reservations.sql\`.
2. Hacer QA de las políticas RLS y la RPC presupuestaria con dos tenants de prueba, incluyendo 21 solicitudes simultáneas, reintentos, límites por USD y errores del proveedor; conservar backups y rollback.
3. Crear un **proyecto OpenAI API separado para Look Digital Staff** y limitar su gasto en la consola OpenAI, con privilegios mínimos. No compartir tokens en chats ni comprometerlos en GitHub/Vercel frontend.
4. En el panel de Supabase del proyecto CRM \`ygipjqgyreeahslzorik\`, abrir **Edge Functions → Secrets**. Configurar mediante consola protegida los valores:
   - \`OPENAI_API_KEY\`: **valor secreto generado en OpenAI**, NUNCA enviarlo por conversación;
   - \`AI_EMPLOYEE_MODEL\`: \`gpt-5.4-mini-2026-03-17\`;
   - \`AI_EMPLOYEE_TENANT_MONTHLY_BUDGET_USD\`: importe en USD **aprobado** (p. ej. \`2.00\`, no preconfigurado);
   - \`AI_EMPLOYEE_GLOBAL_MONTHLY_BUDGET_USD\`: importe en USD **aprobado** (p. ej. \`5.00\`, no preconfigurado).
5. Desplegar la función \`ai-employee-draft\` solo desde el código verificado y con \`verify_jwt=true\`, incluyendo \`lib/digital-employee.ts\` y \`lib/ai-employee-provider.ts\` como dependencias de la función.
6. Crear un agente en borrador en \`/crm/employees\` con datos ficticios, y realizar una consulta con un usuario administrador real de un tenant aislado. Validar \`status=awaiting_approval\`, \`intent\`, \`next_step\`, \`requires_human\`, gastos y tokens en \`ai_agent_runs\`.
7. Con el mismo usuario, aprobar o rechazar manualmente en \`ai_agent_reviews\`; comprobar que **no sale mensaje** de WhatsApp/correo.
8. Probar límite del mes, restricción de tenant, bloqueo por falta de crédito, payload malicioso, y ausencia de permisos para otro tenant. Solo entonces evaluar fusionar y desplegar producción.

## Lo que NO hace esta fase

- No da acceso a las conversaciones de WhatsApp/Instagram/Facebook ni envía mensajes. Depende del PR #80 y OAuth/Meta Business Suite.
- No realiza llamadas telefónicas ni cobra facturas.
- No actualiza automáticamente el estado del prospecto: la IA sugiere \`next_step\`, que exige aprobación y adaptador de CRM con prueba E2E.
- No promete resultados por encima de Manychat sin ensayos comparativos reales.

## Aceptación del producto

Se considera **activado** únicamente cuando la Edge Function está desplegada y conectada con una clave autorizada, responde con un modelo real, los límites de gasto bloquean correctamente, la auditoría recoge tokens y costes, y se demuestra que ningún envío se produjo sin aprobación.

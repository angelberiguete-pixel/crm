# Cita-24 · Empresia — tres integraciones (estado verificable)

**Arquitectura:** una sola base Supabase del CRM general Empresia. La ruta privada es \`/crm/cita24\`; la pública es \`/cita24/[slug]\`. Family Power no se modifica.

## Qué hay implementado
- Agenda administrativa existente con protección transaccional de solapamiento y tareas de seguimiento.
- Formulario público de **solicitud**, no de reserva confirmada. Los datos privados van a \`cita24_visit_requests\` con RLS.
- CAPTCHA Cloudflare Turnstile obligatorio, origen autorizado y cuota diaria por IP + clínica con digest salado.
- Aviso de privacidad HTTPS obligatorio al habilitar portal.
- Bandeja de solicitudes en el CRM; el personal puede convertir una solicitud a contacto y tarea, sin crear automáticamente una cita.
- Borradores de recepción con OpenAI que deben ser revisados por una persona. Sin envío de mensajes.
- Cola SQL de recordatorios WhatsApp con opt-in; trabajador YCloud independiente, deshabilitado por defecto. Solo acepta una plantilla UTILIDAD aprobada para la WABA real.
- Identidad pública Cita-24 · Empresia, sin duplicar un sistema clínico de historiales médicos.

## Estado al crear PR
- Funciones Supabase desplegadas: \`cita24-public-request\` (JWT false, Turnstile obligatorio), \`cita24-reception-draft\` (JWT true, AI flag off), \`cita24-reminder-dispatch\` (JWT false, secreto interno y envío flag off).
- Migraciones **ya aplicadas** a Supabase principal: \`20261109110350\` y \`20261109110824\`.
- Cero configuraciones de clínicas habilitadas, cero solicitudes de pacientes, cero recordatorios enviados.
- El frontend está en una rama/PR draft pendiente de CI y publicación. No inventar URL pública operativa.

## Activar portal por clínica (tras revisión legal/comercial)
1. Obtener cuenta real en Empresia con rol administrativo y control exclusivo de su tenant; validar RLS.
2. Publicar aviso de privacidad completo de la clínica en HTTPS y configurar su URL en \`/crm/cita24\`.
3. Crear widget Cloudflare Turnstile para el dominio real. Configurar
   - Vercel/Web frontend: \`NEXT_PUBLIC_CITA24_TURNSTILE_SITE_KEY\` (pública).
   - Supabase Edge secretos: \`TURNSTILE_SECRET_KEY\` (privado), \`CITA24_RATE_SALT\` (aleatorio de al menos 32 caracteres), \`CITA24_ALLOWED_ORIGINS\` (orígenes HTTPS exactos separados por comas).
4. Habilitar \`enabled\` en el módulo solo después de pruebas. GET devuelve únicamente nombre, lista de servicios, zona y política de privacidad.
5. Probar solicitud con CAPTCHA real; verificar que recepción vea el registro y que otro tenant no pueda consultarlo. No utilizar pacientes reales sin su consentimiento.
6. Probar error de token, fecha inválida, rate-limit, deduplicación y contenido clínico no permitido (formulario no incluye campo libre).

## Activar borradores IA (consumo pagado controlado)
1. Configurar \`OPENAI_API_KEY\` en **Supabase Edge Secrets**, no en \`NEXT_PUBLIC\`.
2. Asegurar política de datos y autorización para usar un proveedor IA: nunca introducir diagnósticos, historias clínicas ni datos de contacto de pacientes.
3. Habilitar \`ai_enabled\` en la configuración de la clínica, y activar global \`CITA24_AI_DRAFT_ENABLED=true\` tras aprobar gasto.
4. Límite programado: máximo **10 solicitudes al día por tenant** con respuesta corta; validar facturación y alertas antes de ampliar el alcance.
5. El borrador NO se envía automáticamente. Debe revisarlo el personal.

## Activar recordatorios WhatsApp oficiales (deshabilitado)
1. La clínica debe autorizar su cuenta empresarial Meta/YCloud y conectar un único número de envío verificado, canal \`connected\` y WABA registrada por tenant.
2. Crear una plantilla **UTILITY**, sin variables en esta primera versión, y obtener estado **APPROVED** en la cuenta WABA. Registrar nombre de plantilla y habilitar cola en ajustes de la clínica.
3. Capturar consentimiento verificable para comunicaciones administrativas y respetar bajas. El sistema revisa el opt-in al programar y también al despachar.
4. Configurar secreto \`YCLOUD_API_KEY\`, \`CITA24_DISPATCH_SECRET\` (aleatorio >=32 caracteres) y flag global \`CITA24_REMINDERS_ENABLED=true\` solo con pruebas positivas.
5. Configurar aparte un scheduler confiable que invoque vía POST \`/functions/v1/cita24-reminder-dispatch\` con cabecera \`x-cita24-dispatch-secret\` — no se ha activado ninguno. El worker devuelve \`submitted\` cuando el proveedor acepta, NO \`delivered\`.
6. Conciliar webhooks de entrega, error y baja, con trazabilidad al \`externalId\` de la cola. Pendiente: estados de entrega verificados y reintentos supervisados.

Referencia proveedor: https://nndocs.ycloud.com/reference/whatsapp_message-send y https://docs.ycloud.com/reference/whatsapp_template-retrieve-by-name-and-language.

## QA / criterios de producción
- CI TypeScript + Next build y pruebas de contrato **verdes**.
- Pruebas de navegador y Android para propietario, recepcionista, paciente y sesión sin autenticación.
- Dos clínicas distintas para demostrar aislamiento de solicitudes, conversaciones, citas y recordatorios (RLS).
- Un turno de recepción real autorizado: solicitud -> revisión -> contacto -> cita -> recordatorio aprobado -> estado conciliado.
- Resistencia a concurrencia, duplicados, mensajes fuera de horario, opt-outs y cambios de contacto.
- No tratar este módulo como una plataforma de historia clínica. No almacenar información sensible de salud.

**No fusionar a main ni vender como automatización plena mientras los puntos E2E y autorizaciones estén pendientes.**

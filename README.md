# Revenue Command Center — RD$1M

Módulo ejecutivo sobre el CRM existente para gestionar el plan hacia RD$1,000,000 de MRR.

## Stack
- Next.js App Router + TypeScript
- Supabase Auth/Postgres/RLS
- Recharts
- Vercel

## Inicio
1. Copia `.env.example` a `.env.local`.
2. Configura `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
3. `npm install`
4. `npm run dev`

El primer usuario crea su tenant desde onboarding. La app invoca `initialize_revenue_command_center` para crear el pipeline y sus etapas de forma idempotente.

## Seguridad
La aplicación usa únicamente la publishable key en cliente. El acceso a filas se controla por las políticas RLS del CRM. No existe service role en frontend.

## AUREVECTOR — avance validado el 15 de septiembre de 2026

Esta ampliación conserva el proyecto existente y añade:
- Contactos y empresas: creación, edición, búsqueda y paginación, con consultas filtradas por organización.
- Oportunidades manuales vinculadas a empresa/contacto, con importes de proyecto y mensualidad separados, duración de contrato y próxima acción.
- Agenda de tareas y seguimientos; tareas con fecha y prioridad.
- Identidad AUREVECTOR, navegación móvil completa y mensajes de error/reintento.
- Recuperación y actualización de contraseña.
- Corrección del onboarding: la suscripción Starter se crea antes de la membresía para que la cuota de usuarios permita registrar al propietario.

### Validación
- `npm run typecheck` y `npm run build` completados.
- `tests/crm-rls-smoke.sql` ejecutado en una transacción revertida: onboarding y escrituras de empresa/contacto/oportunidad/tarea, lectura de la vista e intento de acceso cruzado. Resultado PASS después de corregir onboarding.
- Asesor de seguridad Supabase: sin alertas en esta ejecución.
- No se ha completado una prueba de navegador autenticada: requiere una cuenta del usuario y la configuración de URLs de Auth.

### Pendientes para considerar terminado el CRM completo
- Verificar acceso, confirmación de correo y recuperación con una cuenta real. En Supabase Auth configurar Site URL y Redirect URLs para el dominio definitivo, `/login` y `/reset-password`.
- Cotizaciones/PDF y su conexión con contratación y cobro.
- Inbox y conexión real a WhatsApp; automatizaciones y agentes IA.
- Configuración por organización, selector de organización, equipos/roles desde UI y administración SaaS.
- Suscripciones comerciales, integraciones externas y validación de extremo a extremo.
- Los paneles actuales calculan MRR sobre oportunidades ganadas; no representan todavía contratos activos con cancelaciones o facturación conciliada.
- Las pantallas heredadas de prospectos conservan el piloto de clínicas y sus importes de Cita-24. Para AUREVECTOR utilizar oportunidades manuales con alcance e importes confirmados; los precios del catálogo de la agencia siguen sujetos a calibración.
- Esta migración es incremental sobre el Supabase existente; el repositorio aún no incluye una migración reproducible de todo el esquema inicial.

### Estado de entrega
- Cambios guardados en la rama local `feat/aurevector-crm`.
- La revisión automática bloqueó el push al repositorio público porque requiere autorización explícita para divulgar los cambios. No se ha publicado esta rama en GitHub.
- Vercel creó una versión de prueba protegida por su autenticación; la consulta de estado no pudo recuperarla. No se declara despliegue verificado.
- La publicación de producción fue rechazada por Vercel (403: la conexión no tiene permiso para crear Production Deployments en este proyecto).

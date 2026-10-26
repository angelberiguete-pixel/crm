# LOOK SOCIAL MEDIA — Diagnóstico de acceso CRM (26 octubre 2026)

## Evidencia leída en fuentes conectadas
- Vercel: `crm-revenue-os`, producción `READY` y commit `2d2413a716b378faeb960f9b0229f420b392fe7a`. READY solo indica que el despliegue se completó; no valida Auth ni datos.
- Frontend `lib/supabase.ts`: la URL del proyecto de autenticación es `https://ygipjqgyreeahslzorik.supabase.co`.
- Supabase project `ygipjqgyreeahslzorik`: `INACTIVE` confirmado por el conector el 26 de octubre.
- Supabase `list_tables`: `Database is possibly not accessible at the moment`.
- Captura del propietario: Android muestra `Failed to fetch` al iniciar sesión. No se cuenta con traza de red del dispositivo, credenciales ni sesión real.
- GitHub Actions CI PR #79, ejecución 40329554143: test `owner-first-access-edge-live.test.mjs` falló con `TypeError: fetch failed`, causa `getaddrinfo ENOTFOUND ygipjqgyreeahslzorik.supabase.co` (26/10). Prueba directa de que al menos el runner no resuelve el dominio Auth configurado. No sustituye una traza del móvil.
- Logo `public/look-social-media-logo.svg`: solo 220 × 182 px de WebP incrustado en SVG. SVG no equivale a logo vectorial.
- PR #77 para deduplicación de formularios sigue sin fusionar. No se toca en esta rama.

## Diagnóstico y límites
Un proyecto Supabase `INACTIVE` es una explicación fuerte y reproducible para la falta de acceso, pero aún no existe captura del status HTTP exacto de la solicitud `/auth/v1/token?grant_type=password` del navegador de Ángel.

Las correcciones en este PR:
1. Presentan un mensaje claro y no revelador cuando Auth no está disponible.
2. Evitan dejar botones bloqueados tras excepciones de Auth.
3. Evitan repetir el mensaje bruto `Failed to fetch`.
4. Reducen la ampliación del logo oficial actual en móviles y ajustan espaciado.
5. Añaden pruebas sin usuario/contraseña real ni datos de producción.

**La incidencia de infraestructura y el acceso administrativo siguen BLOQUEADOS.** Este PR no reactiva Supabase, no cambia URL ni claves de producción, no garantiza nitidez Retina y no modifica el activo oficial. Para máxima nitidez falta un logo maestro vectorial autorizado o raster con resolución suficiente.

## Puerta de recuperación de infraestructura (requiere autorización del propietario)
1. Comprobar en Supabase Dashboard el estado, plan, políticas de restauración, posibilidad de conservar datos, región, costes y riesgos.
2. Confirmar backup/restauración o instantánea cuando corresponda; verificar qué datos y Auth se conservarán.
3. Solicitar consentimiento específico para cualquier reactivación con riesgo, coste o impacto productivo.
4. Restaurar **el proyecto existente**, no crear un proyecto vacío.
5. Comprobar health, Auth, esquemas, migraciones, RLS y roles con acceso legítimo, sin exponer secretos.
6. Verificar cuenta propietaria autorizada, `platform_current_access`, acceso `/platform-admin` y `/agency`, logout y reset.
7. Probar de extremo a extremo con ficha interna aislada, permisos cross-tenant negativos, actividad y seguimiento; sin usar datos de pacientes ni clientes reales como test.
8. Validar logo original de mayor calidad antes de reemplazar el actual.
9. Integrar una rama revisada y autorizada, publicar solo tras permiso y realizar validación posdespliegue.

## Estado de aceptación
- CI unitario/browser en rama: pruebas de error, typecheck, build y browser offline pasaron en ejecución inicial; CI completo con test de backend real FALLÓ por DNS ENOTFOUND. Comprobación posterior está separada en job `live-backend-auth` para no ocultar el bloqueo ni impedir las demás pruebas.
- Restauración, RLS real, propietario real, sesiones, persistencia: **BLOQUEADO — BACKEND INACTIVE**.
- Cambio visual nítido final: **PENDIENTE — LOGO MAESTRO**.
- Captura y conciliación de 931 prospectos: **NO INICIADA EN PRODUCCIÓN**.

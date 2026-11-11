# UX y gestión comercial

## 2026-10-14 — ciclo 5

- Base comprobada: main `0de5af0faea17dde21204496a6d8821af37f2445`, CI y smoke aprobados, producción READY.
- PR concurrentes: #18 (Inbox), #62 (automatizaciones). No tocar Inbox, RLS ni automatizaciones.
- Objetivo: foco de teclado, Escape, restauración de foco y bloqueo de desplazamiento en ficha comercial Android 390px; añadir pruebas Chromium con respuestas controladas y ejecución en CI.
- Pendiente: comprobar que las escrituras a Supabase en producción están autorizadas con sesión real; las pruebas browser existentes simulan respuestas.

## 2026-10-14 — ciclo 6

- Rama nueva `ux/customer-history-android-playwright-20261014-c6` basada en ciclo 5 (ancestro de main; sin cambios ajenos).
- Pendiente (NO implementado): ampliar la prueba Chromium Android 390px existente con foco inicial, Shift+Tab/Tab, bloqueo de scroll, Escape y devolución de foco. La actualización del archivo fue bloqueada por controles de seguridad de la herramienta.
- Pendiente (NO implementado): incorporar la prueba estática y `tests/commercial-mobile-browser.test.mjs` al CI; el cambio del workflow fue bloqueado por la herramienta.
- Los mocks no validan permisos RLS reales ni una sesión autenticada en producción; no se cambia esquema SQL.
- Bloqueo: la creación de PR también fue rechazada por controles de seguridad; no hay PR ni CI de esta rama. No fusionar sin pruebas. Producción sigue READY en `0de5af0`.

## 2026-10-15 — validación del PR #73

- PR #73 abierto en borrador; CI `38833615669` y Production HTTP Smoke `38833615665` finalizaron con éxito para `dd5365b8`.
- La prueba comercial Android existente usa viewport 390x844 e intercepta `https://ygipjqgyreeahslzorik.supabase.co/**`; sus escrituras son simuladas y NO acreditan persistencia ni RLS auténticas.
- Falta prueba E2E autenticada contra proyecto de pruebas aislado con usuarios/tenants de QA, verificando alta/edición/lectura posterior, permisos entre tenants y limpieza controlada. No ejecutar escrituras de QA sobre producción.
- Falta prueba dinámica del diálogo comercial: foco inicial, Tab/Shift+Tab, Escape, restauración de foco y bloqueo de scroll a 390px. Mantener PR en borrador hasta evidencia.

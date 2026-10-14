# UX y gestión comercial

## 2026-10-14 — ciclo 5

- Base comprobada: main `0de5af0faea17dde21204496a6d8821af37f2445`, CI y smoke aprobados, producción READY.
- PR concurrentes: #18 (Inbox), #62 (automatizaciones). No tocar Inbox, RLS ni automatizaciones.
- Objetivo: foco de teclado, Escape, restauración de foco y bloqueo de desplazamiento en ficha comercial Android 390px; añadir pruebas Chromium con respuestas controladas y ejecución en CI.
- Pendiente: comprobar que las escrituras a Supabase en producción están autorizadas con sesión real; las pruebas browser existentes simulan respuestas.

## 2026-10-14 — ciclo 6

- Rama nueva `ux/customer-history-android-playwright-20261014-c6` basada en ciclo 5 (ancestro de main; sin cambios ajenos).
- Cobertura de navegador Chromium Android 390px con Supabase simulado: apertura de ficha, foco inicial, Shift+Tab/Tab cíclicos, bloqueo de desplazamiento, Escape y devolución de foco al disparador; conservadas pruebas de tareas/notas mediante llamadas interceptadas.
- CI: agregar ejecución de prueba estática y `tests/commercial-mobile-browser.test.mjs` después de instalar Chromium.
- Los mocks no validan permisos RLS reales ni una sesión autenticada en producción; no se cambia esquema SQL.
- Pendiente: CI verde en PR y verificación de SHA READY tras integración; no fusionar sin esas pruebas.

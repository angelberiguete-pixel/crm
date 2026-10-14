# UX y gestión comercial

## 2026-10-14 — ciclo 5

- Base comprobada: main `0de5af0faea17dde21204496a6d8821af37f2445`, CI y smoke aprobados, producción READY.
- PR concurrentes: #18 (Inbox), #62 (automatizaciones). No tocar Inbox, RLS ni automatizaciones.
- Objetivo: foco de teclado, Escape, restauración de foco y bloqueo de desplazamiento en ficha comercial Android 390px; añadir pruebas Chromium con respuestas controladas y ejecución en CI.
- Pendiente: comprobar que las escrituras a Supabase en producción están autorizadas con sesión real; las pruebas browser existentes simulan respuestas.

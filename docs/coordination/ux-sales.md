# Coordinación de UX y ventas — 2026-10-14

Rama: ux/customer-history-keyboard-20261014.
Base: main a67805ce.
Hecho: contorno de foco visible en la ficha comercial; estilo de movimiento reducido; prueba de estilo tests/customer-history-keyboard-check.mjs; CI configurado para ejecutar además tests/commercial-mobile-browser.test.mjs.
Prueba: verificación local aislada con Chromium de contorno de 3 px. No es prueba E2E de la aplicación autenticada.
Bloqueo: creación de pull request rechazada por el conector; por ello no hay CI de esta rama, ni fusión, ni publicación.
Próximo: crear PR a main, esperar CI verde, verificar pruebas de Android, revisar conflictos y comprobar despliegue READY/SHA. Después añadir gestión de foco y Escape en el diálogo.
Coordinación: PR #62 de automatizaciones y PR #18 de Inbox siguen abiertos. No se modificaron.

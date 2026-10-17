# Registro QA/Release

Fecha: 2026-10-17 02:55 America/Santo_Domingo.
Repositorio: angelberiguete-pixel/crm.
Base revisada: main 0de5af0faea17dde21204496a6d8821af37f2445.

## Resultado
- node --test del arnés local de redirecciones: 11 pruebas correctas, 0 fallidas, Node.js 22.16.0.
- Esta prueba local no equivale a E2E autenticada.
- PR #71 abierta: el workflow de smoke en main todavía incluye pull_request; el smoke consulta producción publicada.
- PR #72 abierta: CI satisfactorio para SHA ed16ddbf27ea1daffa22dabe80d99cf5e2889cbc; descripción desactualizada.
- PR #74 abierta: CI fallido para SHA 876b79a50066bac252658ed9ffd3011541e178f9; autorización interna pendiente.
- La rama main aparece con protected=false; el endpoint de protección devolvió 403 y rulesets no devolvió reglas.
- Vercel: el proyecto aparece en el listado, pero la consulta de deployment, alias y logs no se pudo verificar con el acceso actual.

## Riesgos abiertos
1. Proteger la creación privilegiada de empresas y validar roles sintéticos A/B en una base desechable.
2. Corregir el test de Seguridad y ejecutar CI completo.
3. Integrar PR #71 y #72 solo con revisión y checks verdes del SHA vigente.
4. Configurar y verificar protección de main.
5. Verificar deployment READY, SHA y alias principal con acceso autorizado.
6. Completar E2E autenticadas de propietario, vendedor, aislamiento multiempresa y conversación Android.

No se enviaron mensajes reales, no se modificaron datos comerciales y no se ejecutaron migraciones.
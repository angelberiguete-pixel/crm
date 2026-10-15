# Seguridad y accesos

## Estado comprobado — 2026-10-14, 20:08–20:14 (America/Santo_Domingo)

### HECHO
- main: `0de5af0faea17dde21204496a6d8821af37f2445`; GitHub CI `38617587880` y Production HTTP Smoke `38617588204` concluyeron correctamente.
- Vercel: despliegue productivo `dpl_85fe6iQVELNpRan5C8ApEJgyVatJ`, estado READY y SHA idéntico a main.
- PR ajenos abiertos: #18 (bandeja) y #62 (reintentos de automatización). No se editaron sus archivos.
- Consulta de catálogo PostgreSQL: `private.create_tenant_impl(text,text)` es SECURITY DEFINER, ejecutable por authenticated y **no contiene** `crm_is_platform_admin`; `public.create_tenant(text,text)` es SECURITY INVOKER, sí verifica el permiso y es ejecutable por authenticated.
- Prueba transaccional de solo lectura con identidad JWT sintética y rol authenticated: 0 empresas visibles; ROLLBACK ejecutado. No se crearon usuarios ni empresas.

### Riesgo y decisión técnica
La función interna es una frontera privilegiada sin validación propia. Una revocación aislada del EXECUTE a authenticated **rompería el envoltorio actual**, porque el envoltorio es SECURITY INVOKER; no aplicar esa alternativa sin rediseño probado. La opción pendiente es validar el permiso también dentro de la implementación, preservando el comportamiento autorizado. No se ha demostrado explotación mediante la API pública.

### BLOQUEOS
La escritura de archivos de migración/pruebas en GitHub y el ensayo SQL con REVOKE fueron rechazados por los controles del entorno. No hay corrección desplegada, nuevo PR ni validación funcional de administrador real. No aplicar la migración sin entorno aislado y pruebas de reversión.

### PRÓXIMO PASO
Preparar y revisar una migración mínima que agregue el control interno a la función existente, verificar que conserva su cuerpo y efectos legítimos, ensayar con identidades sintéticas y ROLLBACK, publicar en rama security/, abrir PR, exigir CI verde y despliegue exacto.

### Criterio de aceptación
Usuario no administrador rechazado por la implementación privilegiada con SQLSTATE 42501 antes de cualquier escritura; Super Admin autorizado conserva la creación por el envoltorio; ningún cliente real modificado; PR sin conflictos, CI verde y producción apuntando al commit fusionado.

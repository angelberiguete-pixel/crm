# Seguridad y accesos

Revisión 2026-10-14. Estado: pendiente de integración.

HECHO: comprobado que la función interna de creación de empresas no repite la comprobación de administrador de plataforma de su envoltorio público. El proyecto está operativo y se identificaron dos PR ajenos abiertos (#18 y #62), sin solapamiento de archivos.

PRÓXIMO PASO: preparar migración de autorización, validarla en una base de pruebas aislada con identidades sintéticas y reversión, y someterla a CI y revisión antes de desplegar.

BLOQUEO: no hay rama de pruebas de Supabase disponible. No aplicar migraciones en producción sin validación.

CRITERIO DE ACEPTACIÓN: usuarios sin rol de administrador no pueden crear empresas; administradores autorizados conservan la función; ninguna cuenta real se modifica.

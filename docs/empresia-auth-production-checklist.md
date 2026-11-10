# Empresia · salida a producción de autenticación (10 nov 2026)

## Estado comprobado en Supabase
- Proyecto: `ygipjqgyreeahslzorik`.
- Administrador general: correo confirmado, tiene contraseña, no está bloqueado, membresía activa. El endpoint de Auth devolvió `invalid_credentials`: no se resuelve cambiando roles.
- Propietario de Family Power: cuenta creada, correo pendiente de verificación. En Auth se registró el envío del mensaje de confirmación. Su membresía se crea **solo al verificar** el correo aprobado.

## Acciones sobre el frontend
- Portal general `/login`: errores descriptivos de contraseña, confirmación o límites; recuperación por correo con destino `/reset-password` bajo el dominio visitado.
- Portal Family Power `/family-power/login`: muestra por separado los fallos de contraseña y confirmación. Puede solicitar el reenvío de correo solo para `familypower1@hotmail.com`. Ofrece enlace al inicio del administrador general.
- Registro Family Power `/family-power/registro`: si el correo fue creado, pide verificarlo, permite un reenvío limitado y evita intentar registrar de nuevo.
- Recuperación `/reset-password`: conserva comprobación de sesión y cierre de sesiones anteriores; marca Empresia.

## Acción manual necesaria en Supabase Auth (MCP actual no permite editarla)
Ruta exacta: https://supabase.com/dashboard/project/ygipjqgyreeahslzorik/auth/url-configuration

1. **Site URL:** `https://portal-empresia.vercel.app`
2. **Redirect URLs** permitidas, al menos:
   - `https://portal-empresia.vercel.app/family-power/login`
   - `https://portal-empresia.vercel.app/reset-password`
   - `https://crm-revenue-os.vercel.app/reset-password` (solo si se mantiene compatibilidad con emails antiguos).
3. Revisar **Auth > Email Templates**: el enlace de confirmación debe usar `{{ .ConfirmationURL }}` o la ruta personalizada real con `{{ .RedirectTo }}` correctamente configurada. No debe tener fijo `localhost`.
4. No deshabilitar confirmación por email ni convertir la mera dirección de correo en permiso.
5. Los correos del servicio básico Supabase tienen límites estrictos; producción debe evaluar SMTP propio con remitente legítimo.

## Criterios de aceptación reales
- Desde un navegador limpio, propietario registra `familypower1@hotmail.com` una sola vez.
- Abre su email de confirmación y acaba en la URL productiva, nunca `localhost:3000`.
- `auth.users.email_confirmed_at` se establece; trigger verificado asigna membresía `owner` para tenant `family-power`, y únicamente ese.
- Inicio `/family-power/login` con contraseña correcta -> `/crm` con tenant Family Power seleccionado.
- Administrador `/login` con contraseña correcta -> `/platform-admin`. Si es incorrecta, recuperación envía email al dominio productivo, y solo el destinatario puede cambiarla.
- Ningún usuario de otro tenant obtiene acceso por visitar la URL o alterar el correo del formulario.

**No marcar el circuito de autenticación como probado de extremo a extremo hasta completar una prueba real de cada cuenta.**

# Family Power — alta presencial del propietario (propuesta técnica)

Estado: **rama de revisión, NO desplegada y SIN propietario creado**.

Objetivo: el propietario elige su contraseña de acceso al CRM sin recibir un enlace por correo. No se modifica la autenticación de otros clientes de Look Social Media.

## Flujo previsto
1. Administrador de plataforma autenticado entra a `/platform-admin/family-power-propietario`.
2. Verifica personalmente la identidad del propietario, su nombre y la dirección de acceso **bajo control del dueño o la empresa**. Un correo que pertenezca a un tercero no es aceptable, aunque el propietario no use correo.
3. Genera un token aleatorio de 256 bits, con SHA-256 en una tabla privada, de un solo uso y 15 minutos de validez. Entrega el enlace personalmente, no por mensaje público.
4. El dueño abre `/family-power/activar-propietario#ticket=<token>`, y la página elimina el fragmento del historial antes de pedir correo y contraseña; nunca muestra la contraseña al administrador.
5. La Edge Function crea una cuenta Supabase Auth nueva con contraseña elegida por el dueño y completa la transferencia del propietario al nuevo usuario de Family Power mediante una transacción SQL.
6. La cuenta de Look Social Media queda como **administrador de soporte**, no como propietario.
7. El dueño cierra el alta y verifica inicio de sesión ordinario en `/family-power/login`, cierre, reingreso y permisos.

**Importante:** el flag `email_confirm:true` de Supabase es una habilitación administrativa necesaria para el login sin emails, **NO** evidencia de que la persona controla la bandeja. Se registra `email_ownership_verified:false`. El procedimiento de recuperación debe verificarse presencialmente; de lo contrario, la recuperación por correo podría llegar a quien controle esa dirección.

## Puertas de seguridad y publicación
- No aplicar esta migración ni desplegar la Edge Function sin revisión de seguridad de los triggers, políticas, inventario de usuarios y flujo de restauración.
- El sistema no ejecuta ninguna creación de usuarios en el despliegue del código.
- No introducir contraseñas ni tickets en chats, GitHub, logs, URL query string, analytics o capturas.
- No usar un email ajeno o sin dominio controlado. Si no existe tal dirección, gestionar antes un identificador corporativo seguro.
- No entregar el token a distancia sin un canal de entrega verificado.
- La identidad debe comprobarse durante la reunión y documentarse sin almacenar documentos personales innecesarios.
- Verificar en un entorno aislado: token válido, expirado, reutilizado, emails distintos, cuenta ya existente, transferencias concurrentes, fallo a mitad de creación, rollback y separación entre empresas.
- El despliegue solo podrá activarse tras aprobación del responsable; no transferir el rol real antes de verificar personalmente al dueño.

## Enlaces
- CRM: https://crm-revenue-os.vercel.app/family-power/login
- Proyecto: https://github.com/angelberiguete-pixel/crm

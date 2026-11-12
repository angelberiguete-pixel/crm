# Family Power — preparación de demostración, 12 de noviembre de 2026 · 11:00 a. m.

## Estado confirmado
- Proyecto oficial Vercel: `crm` → `portal-empresia.vercel.app`.
- Dueño de Family Power: cuenta Supabase confirmada, contraseña definida, membresía `owner` activa; **aún no registra acceso exitoso**. No afirmar que inició sesión sin prueba con el doctor.
- Catálogo: 3 productos. Actividad del CRM en los módulos de clientes, oportunidades, cotizaciones, pedidos, entregas y customer_payments: sin registros al momento de la verificación.
- Integración WhatsApp, detección de incendio y conciliación bancaria de Family Power: ninguna verificada.
- No se instaló un nuevo módulo de IA autónoma de la PR #199, que sigue siendo piloto exclusivo de Empresia.

## Aceptación de mañana
1. Doctor inicia sesión desde `https://portal-empresia.vercel.app/family-power/login` usando **su contraseña propia**, sin acceso por enlace obligatorio. No ingresar ni compartir la contraseña del doctor con asistentes.
2. Confirmar redirección al dashboard de Family Power y rol propietario, sin entrar a otro tenant.
3. Mostrar cuatro indicadores de actividad, gráficos basados en datos reales, ruta consulta→cotización→pedido→instalación. Vacíos legítimos son válidos, sin cifras ficticias.
4. Abrir Reportes con gráficos reales.
5. Abrir Finanzas: órdenes, pagos anotados, saldos y cotizaciones. Verificar filtro de moneda y separación de gastos, bancos y suscripción de Empresia. Requiere owner/admin.
6. Abrir Seguridad técnica: sin sensores enlazados; crear tarea autorizada de inspección y confirmar que aparece en Tareas. No usar una simulación de incendio.
7. Revisar catálogo/fichas: productos existentes, precios y verificaciones; no improvisar cotizaciones con precios incompletos.
8. Verificar navegación móvil, contraste, carga en Wi-Fi y datos móviles. Registrar los problemas que observe el doctor.

## Si falla el login
- Verificar el correo del doctor y la contraseña **desde el teléfono del doctor**. Cuenta confirmada y membresía activa no prueban que se conoce la contraseña.
- Si el sistema indica credenciales inválidas, utilizar recuperación de contraseña del portal una vez y volver a entrar con contraseña. El ingreso normal sigue sin email de enlace.
- Si aparece «sin acceso», comprobar el contexto activo y pertenencia al tenant: no cambiar roles ni desactivar la seguridad para forzar una demostración.
- Si aparece error de red, confirmar HTTPS, caché de navegador e integridad del despliegue; registrar mensaje exacto sin compartir secretos.

## Qué aclarar sobre sensores
Pedir marca/modelo y manual de los inversores, modelo/certificación de detector o central de alarma, existencia de salida de relé o API, comunicación Zigbee/Z-Wave/MQTT/Modbus, conectividad, ubicación del gabinete, quién recibe la alerta y protocolo de emergencia. **NO asumir que el inversor incluye detectores de humo o puede conectarse directamente.**

Un CRM solo puede visualizar telemetría complementaria de un sistema de protección certificado y probado. La seguridad de vida debe funcionar localmente aun sin Internet o Empresia; verificar cumplimiento de R-032 y requerimientos técnicos con especialistas.

## Finanzas — trabajo pendiente después de esta demo
- Registro de gastos/proveedores, cuentas por pagar/cobrar, conciliación de bancos y cierres de períodos.
- Diario contable y mayor bajo partida doble, con permisos de aprobación, auditoría y verificaciones fiscales DGII.
- Agente financiero supervisado: preparar conciliaciones, anomalías y recomendaciones; **no emitir e-CF, modificar contabilidad cerrada ni transferir dinero sin aprobación humana**.
- Dashboard financiero actual es visual y respaldado por registros, **no un sistema contable completo**.

## Condiciones de publicación
- CI completa, compilación, políticas RLS, navegación y preview verificados.
- No modificar datos de Family Power para generar cifras decorativas.
- No activar sensores, IA financiera ni cobros reales por software de demostración.
- Proteger las rutas financieras para owner/admin y el tenant Family Power.

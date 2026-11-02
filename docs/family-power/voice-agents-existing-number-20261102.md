# Family Power — integración de voz con número actual (revisión 2026-11-02)

**Estado: preparación técnica en rama de revisión. SIN ACTIVACIÓN, SIN LLAMADAS REALES, SIN CONTRATACIÓN NI GASTOS.** Este documento no demuestra funcionamiento productivo.

## Decisión y entorno real
- Family Power usa el CRM multiempresa en `crm-revenue-os.vercel.app/family-power/login` (repositorio `angelberiguete-pixel/crm`). No desplegar un sistema telefónico aislado ni confundirlo con el prototipo histórico independiente.
- Conservar el número comercial **en el operador actual**. No portar el número ni modificar WhatsApp sin validar coexistencia; la portabilidad NO es un requisito para comenzar.
- La empresa aún no ha confirmado **operador**, **línea móvil/fija/PBX**, **titularidad**, **funciones de desvío** y **si el mismo número aloja WhatsApp Business**. Nunca inferir operador por prefijo debido a portabilidad.
- Meta/YCloud no tiene rutas WhatsApp reales verificadas para este tenant. El servicio de voz no podrá declarar conexión de WhatsApp por compartir un teléfono.
- Selección técnica candidata: **Retell AI** para una prueba privada con voz en español y telefonía SIP; Vapi queda como alternativa por SIP. No están contratados ni configurados.

## Enrutamiento propuesto (de menor riesgo a mayor)
1. **Desvío condicional de llamadas** a un destino de prueba con agente de voz (solo si el operador lo habilita). El número público permanece igual y el teléfono humano responde primero. Debe existir un destino de voz adicional técnico, NO otro número comercial publicado; verificar costo de llamada desviada.
2. **Desvío total** al destino de voz, únicamente después de pasar pruebas y disponer de devolución y transferencia al vendedor. No ejecutar en esta fase.
3. **SIP trunk / PBX** del proveedor actual hacia Retell si el operador puede conectarlo. Mantiene titularidad del número. Confirmar soporte SIP, autenticación, códecs, REFER, traslado y caller ID. Si no es posible usar SIP, valorar proveedor intermedio compatible.
4. **Llamadas salientes**: etapa posterior con numeración e identidad del llamante verificadas, opt-in/consentimiento rastreable y límites de gasto y frecuencia; jamás activar de forma automática.

## Adaptador seguro al CRM
- El número de destino (DID) debe mapearse a un **tenant previamente verificado por el servidor**, con registro único y `enabled=false` predeterminado. No aceptar `tenant_id`, `company_name` ni tipo de rol enviados por la llamada o el modelo.
- Verificar `x-retell-signature` **sobre el cuerpo exacto del webhook** mediante el SDK oficial del proveedor, con secreto solo en backend. Aplicar límite de tamaño, tiempos y rate limit; sin secreto la ruta responde de forma cerrada.
- Escuchar `call_analyzed` para resumen posterior; `call_ended` no prueba que el análisis esté disponible. Idempotencia única por `provider + call_id + event`; registrar eventos en tenant y garantizar transacciones o reintentos seguros.
- `lib/voice-call-contract.ts` normaliza **solamente** ID de llamada, dirección, origen, destino y resumen acotado; **NO** verifica firma, no asigna empresa y **NO** envía eventos, actualiza contactos ni guarda grabaciones. Usar solo detrás de la verificación y ruta a tenant que aún deben implementarse.
- Tras autorización de datos, vincular `contacts` por número confirmado dentro del tenant; pedir nombre si falta, verificar datos antes de reemplazar un nombre existente. Crear tarea de devolución de llamada cuando solicite un humano o una cotización, con responsable y pendiente real. No marcar tareas completadas sin evidencia.
- Registro de llamada: contacto, dirección, marca temporal, estado, duración verificada, agente y resumen revisable; grabación/transcripción desactivadas inicialmente, salvo aviso/consentimiento y período de retención expresamente aprobado. No usar audio sensible para entrenamiento sin autorización.
- No dar precios, garantías, inventario, disponibilidad ni potencia de paneles/inversores que no consten en fuentes aprobadas; transferir cualquier asesoría técnica dudosa a vendedor.

## Mensaje inicial de prueba (texto aprobado pendiente)
“Gracias por llamar a Family Power. Soy un asistente virtual de atención. Puedo tomar sus datos, ayudarle a explicar lo que necesita y pasar su solicitud a nuestro equipo. ¿Cómo podemos ayudarle?”
- Antes de grabar o almacenar/transcribir, informar claramente y obtener/registrar el consentimiento exigible. El texto final debe revisarse por cumplimiento dominicano y responsable comercial.
- Probar español dominicano y pronunciación de nombres/marcas; permitir hablar con una persona de forma fácil.

## Puertas de aceptación / rollback
1. Operador confirma por escrito desvío o SIP sobre la **línea concreta**, reglas de tarifa, llamadas simultáneas, horario, portabilidad/caller-ID, reversión y efectos sobre buzón de voz/WhatsApp.
2. Cuenta de proveedor de voz y saldo/cargos autorizados por el titular (el piloto de IA de texto US$5 NO autoriza costos de voz).
3. Probar con línea secundaria de ensayo, nunca con el número comercial de inmediato: recibo, agente IA identificable, transferencia a humano, tono ocupado, no contesta, llamada abandonada, latencia y seguridad webhooks.
4. Verificar aislamiento: evento de número sin ruta o con ruta desactivada no escribe en ningún tenant; replay del mismo call ID no duplica contacto/tarea; las rutas de otros tenants permanecen inaccesibles.
5. Registro de consentimiento, acceso mínimo a llamadas, política de retención y eliminación; revisión legal de Ley 172-13 y reglas sectoriales.
6. Prueba E2E `llamada → resumen autorizado → CRM → tarea visible`, y verificación en móvil de una cuenta Family Power con rol correcto.
7. Activar por horario o llamadas no atendidas, monitorizar; **desactivar desvío** con procedimiento probado si falla, revirtiendo a atención humana. Eliminar credenciales de prueba y audios no autorizados.

## Fuentes técnicas para validar en la fecha de despliegue
- https://www.retellai.com/learn/how-to-keep-your-existing-phone-number-using-a-sip-connection
- https://www.retellai.com/es/blog/crm-to-voice-ai-workflow
- https://docs.vapi.ai/advanced/sip
- https://www.claro.com.do/personas/servicios/servicios-hogar/voz-residencial/
- https://www.altice.com.do/negocios/soluciones/voz-fija/planes/pospago

## Coordinación de proyecto / documento maestro
Registrar: decisión de usar número actual; modelo de integración condicionado a operador; proveedor Retell solo **candidato**; no tocar WhatsApp ni portabilidad; preparación técnica en PR pendiente; sin llamadas, gasto, integración real o despliegue. Dirección debe aprobar gasto, línea, privacidad y piloto; Ingeniería implementa webhook de firma y tenant; Ventas valida guion y transferencia; QA comprueba casos reales. Mantener esta pieza técnica fuera del expediente aprobado del cliente hasta revisión y aceptación.

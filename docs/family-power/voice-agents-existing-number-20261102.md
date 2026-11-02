# Family Power — integración de voz con dos números actuales (revisión 2026-11-02)

**Estado: preparación técnica en rama de revisión. SIN ACTIVACIÓN, SIN LLAMADAS REALES, SIN CONTRATACIÓN NI GASTOS.** Este documento no demuestra funcionamiento productivo.

## Decisión y entorno real
- Family Power usa el CRM multiempresa en `crm-revenue-os.vercel.app/family-power/login` (repositorio `angelberiguete-pixel/crm`). No desplegar un sistema telefónico aislado ni confundirlo con el prototipo histórico independiente.
- El responsable confirma **dos números actuales: uno fijo y otro celular**, distribuidos entre **Claro y Altice**. **No se ha confirmado cuál operador corresponde al fijo y cuál al celular**, ni cuáles reciben más llamadas comerciales. Conservar **ambos números** en sus operadores; no portar ninguno ni modificar WhatsApp sin validar la coexistencia. La portabilidad NO es requisito para iniciar.
- Pendiente: asignar operador exacto por línea, confirmar titularidad y plan fijo/móvil, funciones de desvío, llamadas simultáneas, desvío a destino nacional o internacional, costes y cuál número utiliza WhatsApp Business. Nunca inferir operador por prefijo (portabilidad).
- Meta/YCloud no tiene rutas WhatsApp reales verificadas para este tenant. El servicio de voz no podrá declarar conexión de WhatsApp por compartir un teléfono.
- Selección técnica candidata: **Retell AI** para una prueba privada con voz en español y telefonía SIP; Vapi queda como alternativa por SIP. No están contratados ni configurados.

## Enrutamiento de DOS líneas (de menor riesgo a mayor)
- **Piloto sugerido, no decidido:** evaluar primero la línea fija para atención con IA (si dispone de desvío o SIP) y mantener el celular atendido por personas/WhatsApp. Si la mayoría de consultas llegan al celular, reordenar la prueba según el tráfico real; no limitar la IA a un número sin esa validación.
- Se podrá conectar cada una de las dos líneas a un mismo agente de voz o a flujos diferentes **solo después** de confirmar compatibilidad y pruebas por línea. Nunca desviar automáticamente la línea móvil al fijo ni viceversa: eso puede crear bucles y cargos inesperados.
- Con desvío, el número de terminación técnica podría no mostrar cuál de las dos líneas originales recibió la llamada. El sistema debe conservar de manera verificada el número originalmente marcado (si el operador/proveedor lo expone) o usar destinos técnicos distintos por línea. No fiarse de un campo original_number enviado por la IA o el llamante.
1. **Desvío condicional de llamadas** a un destino de prueba con agente de voz (solo si el operador lo habilita). El número público permanece igual y el teléfono humano responde primero. Debe existir un destino de voz adicional técnico, NO otro número comercial publicado; verificar costo de llamada desviada.
2. **Desvío total** al destino de voz, únicamente después de pasar pruebas y disponer de devolución y transferencia al vendedor. No ejecutar en esta fase.
3. **SIP trunk / PBX** del proveedor actual hacia Retell si el operador puede conectarlo. Mantiene titularidad del número. Confirmar soporte SIP, autenticación, códecs, REFER, traslado y caller ID. Si no es posible usar SIP, valorar proveedor intermedio compatible.
4. **Llamadas salientes**: etapa posterior con numeración e identidad del llamante verificadas, opt-in/consentimiento rastreable y límites de gasto y frecuencia; jamás activar de forma automática.

## Adaptador seguro al CRM
- Para cada una de las dos líneas, el DID original / identificador del enrutamiento verificado debe mapearse a **Family Power** mediante una ruta de servidor controlada, única por operador/número y con `enabled=false` por defecto. Distinguir origen de llamada, línea comercial originalmente marcada y destino técnico final; no usar coincidencias ambiguas cuando un desvío pierde información. No aceptar `tenant_id`, `company_name` ni tipo de rol enviados por la llamada o el modelo.
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

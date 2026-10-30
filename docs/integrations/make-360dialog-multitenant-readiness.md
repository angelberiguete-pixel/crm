# Make + 360dialog + Look CRM: preparación segura de recepción y asistentes

Fecha: 30 octubre 2026. Estado: **diseño y código bajo revisión**, sin automatización de mensajes, sin IA pagada ni tarifa comercial 360dialog. No marcar WhatsApp conectado en el CRM solo porque Meta autorice el número.

## Realidad comprobada
- Cuenta Make `My Team`: el Sandbox tiene un escenario existente inactivo (**6843691**) con webhook; no duplicarlo.
- Existe nuevo escenario **6843771**: `Look Social Media · 360dialog REAL → CRM · preparación segura (inactivo)`. Solo tiene trigger; no reenviará eventos hasta que llegue un payload de prueba y se configure la acción HTTP.
- La cuenta de Look Social Media en Supabase `eurevector` tiene canal WhatsApp creado pero `disconnected`. Family Power tiene su propio canal `disconnected`. Ninguna ruta verificada para números reales.
- El PR de integración 360dialog (#89) contiene Edge Function `360dialog-whatsapp-inbound` + normalizador + RPC eco; sigue sin desplegar. El webhook oficial `meta-whatsapp-inbound` de producción **no** es compatible con este proveedor sin adaptador.
- El CRM tiene `/crm/inbox` y `/crm/employees`. El receptor verificado crea conversación e indicador de seguimiento humano; no contesta ni cobra.

## Diagrama de responsabilidad
```
[360dialog Sandbox] -> [Make Sandbox webhook 6843691] -> [Inspector de eventos falsos]
                                                               (SIN CRM PROD)

[360dialog Coexistence REAL] -> [Make LIVE webhook 6843771]
  -> [HTTP POST JSON crudo + Authorization: Bearer del lado servidor Make]
  -> [Supabase Edge Function /functions/v1/360dialog-whatsapp-inbound]
  -> [RPC ingest_verified_whatsapp_text / ingest_verified_whatsapp_echo]
  -> [tenant verificado por WABA + Phone Number ID]
  -> [Contactos, conversaciones, mensajes y seguimiento humano]
  -> [Borrador de respuesta IA, condicionado a autorización]
  -> [Aprobación humana + envío API con restricciones y auditoría PENDIENTE]
```

**No enviar eventos Sandbox al receptor REAL**; el Sandbox no prueba la titularidad de WABA y Phone Number ID de Look ni de Family Power. En Make, prohibido pasar `tenant_id`, `channel_id`, `conversation_id`, `is_verified` y `is_enabled` como verdad desde el cuerpo externo.

## Cuando el usuario vuelva a la laptop
1. En My Team, abrir Sandbox **6843691** y copiar la URL del webhook. Ejecutar la configuración desde su propio navegador Make HTTP o desde la herramienta local PR #91, sin mostrar clave API en ChatGPT.
2. La página de documentación de 360dialog Sandbox actualmente documenta hasta **200 mensajes**, pero límites y disponibilidad pueden variar según cuenta; comprobar en el propio Hub. No gastar cupos en pruebas repetitivas.
3. Enviar **un único** mensaje ficticio al número oficial Sandbox. Usar `scenario_trigger_inspect` para obtener la estructura real del evento; solo después añadir módulos en Make. No guardar contactos reales en Make durante pruebas.
4. Para conexión comercial, verificar autorización/estado de canal en Hub, coste aceptado, WABA ID/Phone Number ID reales, permisos de propietario y el webhook por número.
5. Desplegar PR #89 solo tras revisión, pruebas, secretos server-side y autorización. Configurar en Edge `D360_WEBHOOK_BEARER_TOKEN` (mínimo 32 caracteres), sin exponerlo a cliente; registrar como secreto en el módulo HTTP de Make con esa cabecera. El webhook LIVE **6843771** tendrá que mapear el cuerpo original 360dialog hacia el Edge URL sin cambios y sin confiar en metadatos cliente; usar test de una sola entrada y verificar respuesta 200.
6. Solo después insertar ruta en `meta_whatsapp_routes` con WABA+Phone Number ID cotejados y `channels.status='connected'`. Debe probarse duplicidad e aislamiento multitenant. Dejar Family Power aparte hasta autorización de su dueño.
7. Antes de IA: revisar conocimiento real y consentimiento por empresa, flujo de aprobación humana, presupuesto de tokens, reglas de ventana de 24 h de WhatsApp, opt-out, clasificación y asignación. Cualquier respuesta externa desde Make exige consentimiento y aprobación de un humano hasta habilitar un controlador de envío probado y expresamente aprobado.

## Reglas de atención y traspaso (nuevo módulo de código)
`lib/whatsapp-agent-handoff.ts` contiene heurísticas **solo informativas** de texto para detectar:
- petición expresa de agente humano;
- mención de aceptación de cotización (debe verificarse contra una cotización real; un texto no es una aprobación jurídica);
- solicitud de precios/cotizaciones;
- citas sin calendario conectado;
- reclamos, pagos y facturación.

La clasificación marca `requiresHuman` sin enviar nada. Estas sugerencias **todavía no están conectadas** al Edge/CRM. `checkWhatsAppAgentDraftReadiness` devuelve posibilidad de preparar borrador solo cuando existen ruta verificada, consentimiento, conocimiento, proveedor y presupuesto aprobados; jamás autoriza envío automático.

## Criterios de aceptación reales
- Al menos un POST Sandbox recibido por Make y confirmado en el inspector (sin exponer el secreto).
- WhatsApp real no aparece conectado hasta completar 360dialog, enlace con Make, recepción verificada y tenant.
- Entrada real produce 1 contacto, 1 conversación y 1 mensaje; repetición produce 0 adicionales.
- Eco desde el celular del doctor aparece como salida `external`, no como respuesta de IA.
- Texto del usuario solicitando humano se deriva por un operador con permisos de la empresa; la mención de cotización aprobada no crea una venta automáticamente.
- Solicitud de asistencia IA sin configuración o sin presupuesto no genera llamadas pagadas.
- Toda respuesta enviada de verdad requiere salida API autorizada, idempotencia, aprobación y auditoría, función que aún falta construir y validar.

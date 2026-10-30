# Look Social Media — laboratorio GRATIS WhatsApp Sandbox 360dialog

**Solo para el número personal autorizado de pruebas.** **No activa** la API del número real de Look Social Media ni de Family Power. No vincular a mensajes reales, clientes, agentes IA, costos, planes comerciales o entornos de producción.

## Límites confirmados (documentación oficial actualizada al 30/oct/2026)
- Documentación: https://docs.360dialog.com/docs/get-started/sandbox
- **25 solicitudes de mensajes**, incluso si el endpoint rechazó la solicitud. Una solicitud enviada = un intento del cupo. La cifra antigua de 200 está desactualizada.
- El envío es únicamente al número del titular registrado con \`START\` o a su identificador BSUID. El mensaje \`START\` especifica el modo; algunos no comparten número y requieren \`recipient\` en lugar de \`to\`.
- Los eventos Sandbox entrantes carecen de WABA y Phone Number ID verificados y **no deben** pasarse al RPC de producción \`ingest_verified_whatsapp_text\` ni al webhook \`meta-whatsapp-inbound\`. Cualquier relación simulada con un CRM debe estar aislada y etiquetada demo.
- NO conectar directamente esta prueba a Family Power. Cero envíos automáticos, secretos de plataforma, pagos o inferencia IA.

## Paso 1. Reemplazar URL de Webhook.site previamente expuesta
Abrir https://webhook.site y generar una URL **nueva** HTTPS. No publicar dirección, mensaje personal o contenido de clientes. Mantener la pestaña abierta. Los datos enviados a Webhook.site quedan en un servicio de terceros de pruebas; utilizar mensajes inocuos.

## Paso 2. Registrar webhook Sandbox desde el equipo local
Sin subir claves a Github ni a ChatGPT, usa Node >=22 en el equipo del operador:

\`\`\`sh
node scripts/360dialog-sandbox-lab.mjs webhook
\`\`\`

Se solicita la API key del mensaje \`START\` en una entrada que no muestra caracteres ni guarda el valor. Luego se solicita la nueva URL HTTPS y confirmación \`SI\`. El registro efectúa \`POST https://waba-sandbox.360dialog.io/v1/configs/webhook\`, JSON \`{"url":"..."}\` y cabecera \`D360-API-KEY\`. Solo HTTP 200 equivale a configuración recibida.

## Paso 3. Probar recepción sin consumir solicitud de envío API
Desde el mismo WhatsApp que envió \`START\`, enviar al chat oficial \`+551146733492\` el texto **PRUEBA LOOK 01**. En Webhook.site debe llegar un POST JSON: \`entry[].changes[].value.messages[].text.body\` igual al texto enviado. No publicar capturas con números, identificadores o tokens. Si no llega, confirmar que el registro devolvió 200 y que la URL es la nueva.

Los eventos pueden usar \`messages[].from\` (número) **o** \`messages[].from_user_id\` (BSUID); nunca inferir que el Sandbox tenga el WABA del negocio.

## Paso 4. Probar salida (consume un intento)
\`\`\`sh
node scripts/360dialog-sandbox-lab.mjs send
\`\`\`
Elegir \`phone\` si el API key del mensaje \`START\` está asociado al número propio, o \`bsuid\` si es la variante de identificador. Escribir el número propio como \`+18495706550\` cuando proceda, o el BSUID asignado, y un texto ficticio. Confirmar escribiendo \`ENVIAR\`. El servidor debería devolver HTTP 201 y llegar la respuesta a tu WhatsApp. No probar con números de clientes ni reintentar a ciegas.

## Paso 5. Entrada al CRM
- La bandeja \`/crm/inbox\` ya existe y el canal interno de Look Social Media se encuentra \`disconnected\`.
- El conector 360dialog con rutas verificadas está en revisión separada (PR #89), sin activar.
- **El Sandbox no es prueba de recepción en CRM**: no proporciona WABA/Phone ID verificables, a diferencia del flujo de un canal real. Si el negocio aprueba un canal real, aplicar y verificar el conector desde una sesión administradora y una ruta servidor verificada.
- No guardar la API key Sandbox en capturas, código, variables \`NEXT_PUBLIC_*\`, terceros ni tablas públicas.

## Criterios de aceptación para cerrar esta fase
- [ ] Webhook nuevo registrado y HTTP 200
- [ ] Un evento de texto recibido en webhook.site desde el único WhatsApp autorizado
- [ ] Un envío de texto a la cuenta de pruebas con HTTP 201
- [ ] WhatsApp Business del teléfono sigue funcionando
- [ ] Cero mensajes de prueba ingeridos erróneamente como clientes en CRM
- [ ] Cero modificaciones a Family Power, cero gastos o automatizaciones

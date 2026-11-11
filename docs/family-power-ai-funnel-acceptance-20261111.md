# Family Power — Criterios de aceptación del circuito comercial con IA
Fecha: 2026-11-11 · Proyecto: Empresia / Family Power
Estado: en desarrollo; no validado para producción.

## Recorrido prometido
Visibilidad → Interacción → Conversación → Contacto → Oportunidad/pipeline → Cotización → Pedido confirmado → Cobro → Factura e-CF autorizada → Entrega → Satisfacción y fidelización.

No presentar este recorrido como autónomo hasta superar pruebas reales. La visualización del embudo incorporada en esta rama muestra contadores de eventos independientes, NO una cohorte única ni tasas de conversión.

## Evidencia auditada
- El tenant Family Power está activo y su propietario tiene membresía owner activa.
- Registros de contactos, conversaciones, oportunidades, cotizaciones, pedidos, entregas, eventos de marketing, ejecuciones IA: 0.
- Un agente IA en borrador, ninguno activo.
- Sin conexión Meta ni rutas verificadas WhatsApp para Family Power.
- Hay un sitio instrumentado, pero sin visitas registradas.
- No se ha comprobado emisión e-CF, sincronización pública en tiempo real ni encuestas de satisfacción.

## Lo incorporado en la rama
- Embudo visual en Inicio y Reportes; controles de 30/90 días y todo el histórico.
- Lectura filtrada por tenant y sujeta a RLS, nunca datos de otros clientes.
- Enlaces de navegación mostrados únicamente con permiso positivo.
- “Sin dato” para mediciones no disponibles; la fuente de impresiones Meta no se inventa.
- Estado verificable de agentes IA activos, en borrador y sus ejecuciones.
- Regresión de contratos agregada a la suite existente.

## Política de autonomía del agente
- Acciones internas reversibles: clasificación, sugerencia de etiquetas, tareas, prioridad de oportunidades, borradores de respuesta, alertas; guardar evento y permitir corrección.
- Acciones de comunicación: solo con conexión autorizada, destinatario verificado, políticas de consentimiento, límites y registro de entrega; no escribir a clientes por canales desconectados.
- Necesitan aprobación humana: descuentos y cambios de precio, compromisos de venta, cotizaciones finales, emisión de e-CF, reembolsos, cobros y cambios de permisos.
- Retroalimentación: intervención supervisada → resultado observado → evaluación de reglas/prompts versionados. No afirmar aprendizaje autónomo de pesos ni autoasignación de permisos.
- Segurança: aislamiento tenant, auditoría, mínimos permisos, protección de mensajes y privacidad.

## QA independiente antes de producción
No se ha contratado ni invitado un probador humano. Debe identificarse una persona diferente del propietario, con autorización y una cuenta de pruebas de permisos mínimos. Nunca compartir la contraseña del doctor.

| Caso | Resultado mínimo | Prioridad |
|---|---|---|
| Login, cambio de empresa y cierre de sesión | Sin filtraciones entre tenants | P0 |
| Todos los botones visibles en móvil y PC | Abren rutas permitidas, ninguna acción vacía | P0 |
| Visita/Meta → Inbox | Evento auténtico trazable a origen y empresa | P0 |
| WhatsApp/Instagram | Recepción, respuesta, consentimiento y sin duplicados | P0 |
| Inbox → contacto → oportunidad | Identidades enlazadas, etapa y auditoría | P0 |
| Cotización de inversor | Foto/ficha correcta, PDF, revisión y aprobación | P0 |
| Pedido y pago | Cobro conciliado con proveedor, no inferido de un clic | P0 |
| Facturación DGII | Emisión e-CF exclusivamente con certificación y evidencia oficial | P0 |
| Entrega y satisfacción | Constancia y seguimiento del cliente | P1 |
| IA supervisada | Propone, humano aprueba, ejecuta tarea, mide resultado | P0 |
| Seguridad de roles | Deniega funciones y datos ajenos | P0 |
| Android 390 px y escritorio 1280 px | Sin desbordamiento ni controles ocultos | P1 |

## Bloqueos de lanzamiento
- [ ] Build y CI aprobados.
- [ ] Revisión autenticada con la cuenta del propietario.
- [ ] QA humano independiente aprobado y realizado.
- [ ] Meta/WhatsApp oficial y atribución de leads probada.
- [ ] Ciclo cotización → pedido → cobro verificado → entrega.
- [ ] e-CF con emisor/proveedor autorizado y prueba DGII.
- [ ] Confirmar publicación real y ruta de reversión en Vercel.

No se envió ningún mensaje, emitió ninguna factura ni se ejecutó ningún cobro como parte de esta PR.

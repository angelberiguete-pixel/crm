# CRM/ARM general — intervenciones supervisadas

## Flujo operativo
1. El motor de reglas `crm_arm_next_actions` sugiere una acción para una oportunidad abierta de la empresa activa.
2. Un usuario autorizado pulsa **Proponer**. El servidor vuelve a comprobar la recomendación y bloquea duplicados activos para la misma oportunidad y acción.
3. Solo el propietario o administrador del tenant puede **Aprobar** o **Rechazar**.
4. Tras aprobación, un usuario con permiso comercial pulsa **Crear tarea autorizada**. La ejecución es **únicamente una tarea interna del CRM** con fecha límite; no envía mensajes, no cambia el valor/estado de una oportunidad, no llama a un LLM, no crea facturas.
5. La tarea puede marcarse como realizada por la persona asignada o un administrador. Esa marca es una **declaración de ejecución humana**, no prueba independiente de que se contactó al cliente.
6. El comando **Evaluar resultado** consulta el estado comercial real: venta ganada, venta perdida o avance a una posición posterior de la misma pipeline. Si no hay avance, exige siete días transcurridos desde la finalización de la tarea antes de etiquetar “sin progreso observado”.
7. Cada transición queda en `crm_arm_intervention_events`. La tabla `crm_arm_interventions` conserva la propuesta, quién la aprobó/ejecutó/midió, la tarea y el resultado observable.

## Aprendizaje con evidencia, no causalidad
La vista `crm_arm_intervention_learning` agrupa resultados por `tenant_id` y tipo de intervención. El panel solo muestra un porcentaje de avance cuando hay al menos 10 mediciones; con menos, muestra “Muestra insuficiente”.

Esta es una **tasa histórica descriptiva, no un modelo predictivo y no una estimación causal**. Diferentes equipos, clientes y condiciones comerciales pueden explicar variaciones. El sistema existente de ML de ventas mantiene su entrenamiento y validación independientes; estas mediciones no se introducen automáticamente como etiquetas de ventas.

## Seguridad
- `crm_arm_interventions` y `crm_arm_intervention_events`: RLS habilitada, solo SELECT a usuarios autenticados de la empresa activa, ninguna escritura directa.
- Cinco RPCs `public.crm_arm_*` de tipo `SECURITY INVOKER` llaman a funciones privadas `SECURITY DEFINER`. Se valida `auth.uid()`, rol y tenant activo dentro de cada función privada.
- La aprobación exige `owner/admin`; propuestas, ejecución, confirmación y medición exigen roles comerciales autorizados. Finalizar una tarea asignada requiere al asignado o a un administrador.
- Los registros de oportunidad se verifican en el servidor y la propuesta caduca si la etapa, proceso o recomendación cambian.
- Locks transaccionales e índice único parcial previenen ejecuciones repetidas y tareas duplicadas al reintentar la misma acción.
- La tabla y la vista no tienen permiso de lectura anónimo. No se pasa información a un proveedor externo.
- Los comentarios de resultado no son necesarios: **la etiqueta se calcula de datos del CRM**, no de un “éxito” escrito por un agente.

## Estado de verificación
Verificado: pruebas estáticas, TypeScript y build; migraciones aplicadas; grants/RLS y ausencia de avisos nuevos en funciones RPC públicas.

Por verificar con personas y cuentas reales: prueba completa de propuesta/aprobación/ejecución/finalización/medición con oportunidades no ficticias, permisos cruzados entre empresas y la autorización comercial de los agentes. No atribuir conversiones causales sin un estudio experimental.

## Próximas mejoras
Conectar la ejecución a canales oficiales mediante permisos explícitos, idempotencia del proveedor y evidencias verificables de entrega; permitir periodos de observación configurables por tipo de acción; introducir controles de atribución y experimentos aleatorizados solo con consentimiento. Mantener aprobación humana para comunicaciones, precios y acciones irreversibles.

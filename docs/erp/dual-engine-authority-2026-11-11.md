# Empresia · Integración Odoo 20 + Dolibarr 24 sin duplicados

**Fecha:** 2026-11-11  
**Entorno:** código en rama; NO migrado a Supabase principal  
**Empresia ERP:** plataforma oficial `angelberiguete-pixel/crm`  
**Motor PHP/MariaDB + nuevo Odoo/Postgres:** `angelberiguete-pixel/Empresia-ERP`, PR #6  
**Alcance de piloto:** Empresa propia Empresia (`eurevector`). Family Power y clientes terceros deshabilitados.

## Modelo de datos: quién manda

| Dominio | Fuente canónica propuesta | Odoo 20 | Dolibarr 24 |
| --- | --- | --- | --- |
| Contactos / empresas | Empresia Supabase | Consulta o espejo verificado, sin nuevas identidades | Complemento de terceros, mapeado |
| Productos y precios autorizados | Empresia Supabase | Planificación / catálogo proyectado | Consulta de fichas de producto |
| Inventario, reservas, movimientos | Empresia Supabase | Abastecimiento y planificación, sin contabilizar movimientos independientes | Consulta y procesos no solapados |
| Pedidos / cotizaciones | Empresia Supabase | Planeamiento/compras en espejo | Gestión auxiliar, sin segundo pedido vinculante |
| Cobros, reembolsos, facturas y e-CF | Empresia, después de activar libros y autoridad fiscal | Funciones contables en modo observación hasta conciliación validada | Documentos no fiscales y tareas auxiliares |
| Contabilidad (diario/Mayor) | **Pendiente de implementación en Empresia** | No operar como contabilidad paralela mientras siga pendiente | No contabilizar la misma operación |
| Instalaciones, garantías, documentos | Empresia como operación primaria | Planificación de trabajos | Archivo/documentación complementaria |

**Importante:** el dominio contable no está listo por existir una fila que diga `canonical_system='empresia'`. No se debe contabilizar, facturar fiscalmente ni ofrecer balances hasta construir el libro persistido, probar sus cierres y validar DGII. Las reglas de unicidad y permisos no sustituyen las transacciones financieras.

## Implementación v1 creada
- `private.erp_dual_tenant_enrollments`: vacío al desplegar. Solo un DBA autorizado puede habilitar un tenant; los triggers salen inmediatamente si no está habilitado.
- `public.erp_dual_domain_policy`: dueño fijo Empresia, sincronización `disabled` inicialmente; requiere aprobación registrada para activar observación/espejo.
- `public.erp_dual_external_ids`: mapeos `(tenant,provider,domain,canonical_id)` y `(tenant,provider,domain,model,external_id)` únicos para evitar crear dobles documentos o asociar IDs ajenos.
- Trigger valida que la conexión pertenece a la misma empresa y proveedor.
- `public.erp_dual_outbox`: eventos de orders, inventory_movements y customer_payments sin importar nombre, importe, claves o contenido; idempotentes. No ejecuta llamadas externas.
- `erp_sync_jobs`: para empresas incorporadas al piloto, prohíbe rutas Odoo heredadas `push`, `pull` o `full_sync` sobre productos, cotizaciones, facturas, pagos e inventario hasta tener un adaptador certificado.
- Vista `erp_dual_connection_status` invocadora de RLS; nunca expone contraseñas ni URL internas.
- `/crm/erp` incluye un panel real de conexión para owner/admin de `eurevector`; no cambia el UI del cliente Family Power.
- Scripts de habilitación (verifica dos conexiones saludables) y parada de emergencia, preparados pero no ejecutados.

## Secuencia para funcionar realmente

### 1. Infraestructura y seguridad
- Hospedar Odoo Community 20 + PostgreSQL 17 y Dolibarr 24 + MariaDB con discos persistentes, copias de seguridad y TLS.
- Al momento del intento, Railway bloquea nuevos proyectos en el plan Free por límite de recursos. NO se intentará reutilizar proyectos ajenos ni desplegar con credenciales por defecto.
- Configurar instalación inicial, roles técnicos de solo lectura y políticas de acceso a bases de datos. Una instancia por cliente o separación demostrada y auditada.

### 2. Conexiones comprobadas
- Reutilizar las Edge Functions existentes `platform-odoo-onboarding`, `odoo-sync-worker` y `empresia-dolibarr` (actualmente Odoo permite trabajos heredados; evitar bidireccionalidad durante piloto).
- Odoo 20 API `/json/2/<model>/<method>` con clave privada y usuario técnico de mínimo permiso. Dolibarr REST `/api/index.php/products` con `DOLAPIKEY` solo en servidor.
- Guardar credenciales exclusivamente en Vault/secretos de backend. No guardar claves en cliente, SQL de Git ni variables NEXT_PUBLIC.
- Validar en tiempo real salud, versión, credenciales, permisos, límites de respuesta, TLS, conexión y usuarios separados.

### 3. Adapter de espejo y reconciliación
- El próximo adaptador de ejecución debe leer los eventos de la bandeja de salida, comprobar política `mirror`, estado de conexión, idempotency key y mapeo externo.
- Validar esquema/IDs/moneda e impuestos; crear un registro externo solo cuando tenga una operación aprobada y no exista mapeo; registrar external ID bajo unique constraints.
- Ante error, reintentar sin duplicar; ante conflicto, bloquear y solicitar revisión humana. No aceptar reenvíos que cambien el total o modifiquen registro canónico silenciosamente.
- Odoo y Dolibarr deben consumir distintos servicios funcionales; no emitir el mismo comprobante en los dos.
- No escribir contabilidad hasta cerrar y auditar mayor, conciliación bancaria y trazabilidad DGII.

### 4. Pruebas
- PostgreSQL 17 desechable: pruebas de 2 empresas, outbox, deduplicación, protección contra jobs anteriores, RLS y kill switch.
- Ensayo de servidor con dos APIs reales: producto referenciado desde dos proveedores sin inventario duplicado, rechazo de segunda orden, facturación solo después de aprobación y conciliación exacta.
- Móvil Android y PC: inicio de sesión, usuario con permiso, cambiar tenant y verificar sin filtraciones.
- Prueba de recuperación, respaldo, monitoreo, reconciliación y parada de emergencia.

## Estado real
**Código de integración y pruebas preparado; servidores externos NO provisionados; migración NO aplicada; ninguna empresa habilitada; ninguna operación real sincronizada.** Ninguno de esos pasos debe marcarse como completo con pruebas simuladas.

## Documentación oficial
- Odoo JSON-2: https://www.odoo.com/documentation/20.0/developer/reference/external_api.html
- Odoo imagen Docker: https://hub.docker.com/_/odoo
- Dolibarr Docker oficial: https://github.com/Dolibarr/dolibarr-docker

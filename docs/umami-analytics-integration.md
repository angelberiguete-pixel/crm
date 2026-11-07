# Umami Analytics como módulo interno del CRM

La pantalla CRM / Marketing incorpora un panel de datos web por empresa. No reemplaza los módulos comerciales, no crea clientes duplicados ni expone claves de Umami en el navegador.

## Configuración necesaria

1. Aplicar la migración supabase/migrations/20261107073000_umami_analytics_tenant_bindings.sql.
2. Desplegar Umami v3 con HTTPS y una base PostgreSQL persistente, o conectarse a un servicio compatible con la API.
3. En el servidor Next.js (Vercel), añadir variables PRIVADAS UMAMI_API_BASE_URL y UMAMI_API_KEY. No utilizar el prefijo NEXT_PUBLIC_.
4. UMAMI_API_BASE_URL incluye el prefijo API: ejemplo https://analytics.example.com/api para Umami autoalojado; para Cloud, consultar https://api.umami.is/v1.
5. Habilitar el módulo umami_analytics para cada empresa autorizada desde administración central.
6. Solo el administrador de plataforma vincula filas en public.marketing_umami_websites: tenant_id, umami_website_id, site_name y hostname. Los usuarios de empresa nunca pueden modificar esta asignación.
7. Insertar el script de seguimiento oficial que proporciona Umami en las webs públicas medidas; revisar los requisitos de privacidad.

El identificador de sitio de Umami es único en la plataforma: impide que se asigne el mismo sitio a más de una empresa.

## Validación previa a publicación

- Sin JWT válido: 401. Sin membresía activa, rol permitido o módulo habilitado: 403.
- Un miembro de la empresa A que solicite site_id de la empresa B recibe 403.
- Un administrador de una empresa no puede crear ni cambiar enlaces de Umami a través de Supabase.
- Con la API sin configurar, se debe mostrar el estado real 'Sin conectar', no cifras simuladas.
- Comprobar con dos empresas y dos webs que no se mezclen los datos.
- La API no devuelve ni registra UMAMI_API_KEY; las respuestas no se cachean.
- Confirmar los datos con visitas reales antes de certificar la integración.

Las métricas de visitas NO equivalen a ventas ni pagos. Las conversiones requieren instrumentación de eventos autorizada.

Docs: https://docs.umami.is/docs/guides/embed-analytics-in-your-app
# Empresia · Captación comercial Santo Domingo (piloto)

Fecha de referencia: 2026-11-09. Documento de operación y verificación; no es una campaña enviada.

## Contexto estadístico
Fuente: ONE, Directorio y Demografía Empresarial Formal (DyDEF 2025),
https://www.one.gob.do/media/klqbuaet/informe-directorio-y-demografi-a-empresarial-formal-2025.pdf

- Distrito Nacional: 40,569 empresas formales empleadoras.
- Provincia Santo Domingo: 21,784.
- **Total: 62,353**. No equivale a 62,353 destinatarios de correo.
- Empresas de 11 a 50 empleados: 6,459 + 2,871 = 9,330.
- Estadísticas por domicilio declarado, no por audiencia o posibilidad de compra.

## Datos observados en CRM
Proyecto Supabase del ARM general; tenant Empresia, identificador técnico eurevector.
- 891 empresas importadas (dato disponible al auditar).
- 894 prospectos en Agency OS; fuente dominante NEGOCIOS REPUBLICA DOMINICANA.xlsx.
- Ciudad con texto de Santo Domingo: 397 empresas; 397 nombres distintos, **sin deduplicación verificada por razón social/RNC**.
- Con email: 51; con teléfono: 391; con dominio o web: 202.
- 397 registros NO son 397 empresas geográficamente confirmadas ni 397 autorizaciones de envío.

## Segmentos disponibles en Santo Domingo
- Odontólogos y odontólogas: 64 + 37 (clasificación de fuente, requiere normalizar).
- Centros de estética: 60.
- Cirujanos plásticos: 60.
- Agencias de turismo: 60.
- Restaurantes gourmet: 59.
- Gimnasios: 54.
- Casos adicionales en Santo Domingo Este/Norte: 3.

Primera recomendación operativa: contrastar ciudad, sector, actividad y canales públicos, sin duplicar registros. Si se confirma que los 397 registros son utilizables, faltarían 103 empresas para la meta de 500.

## Embudo y métricas
1. Segmento verificado: empresa con nombre, localización, sitio o ficha pública confiable, sector y fecha de validación.
2. Alcance: impresión y clic de Meta Ads o contacto permitido; no contar direcciones sin autorización como envíos realizables.
3. Captación: formulario /empresia/soluciones. Autorización solo para responder a la solicitud de evaluación.
4. Calificación: conversación real + necesidad + responsable + siguiente acción en CRM/Agency OS.
5. Conversión: solicitud de demo -> demo celebrada -> propuesta enviada -> contrato -> pago confirmado.
6. Retención: cliente activo, actividad comercial y MRR cobrado, nunca estimado por solicitudes.

**Atribución:** el formulario prepara los campos utm_source, utm_medium, utm_campaign, utm_content y utm_term, pero la Edge Function heredada NO los persiste todavía. No reportar atribución de campañas como funcional hasta que haya trazabilidad real.

## Seguridad y cumplimiento
- República Dominicana: Ley 310-14 sobre correo comercial no solicitado; solo campañas bajo base jurídica y condiciones del proveedor.
- Gmail: autenticación SPF o DKIM para remitentes, y requisitos más estrictos a partir de 5,000 correos diarios a Gmail, entre ellos DMARC y baja con un clic.
- No alternar Gmail para eludir límites.
- Mantener exclusiones, rebotes, quejas y bajas en el registro único del CRM.
- La Edge Function actual requiere CAPTCHA/rate limiting robusto antes de escalar tráfico público.
- No enviar campañas, ni importar contactos artificiales, ni presentar metas como conversiones verificadas.

## Hipótesis comercial
Piloto sujeto a propuesta: US$99/mes + implementación desde US$197. No hay Checkout/plan publicado en la landing ni venta ejecutada.

### Experimento de 30 días
- Empresas verificadas objetivo: 500.
- Calificadas: 100.
- Solicitudes de demo: 8.
- Propuestas: 5.
- Clientes pagos: 2.

Estas metas son hipótesis para aprender y no tienen garantía; registrar valores reales por fecha.

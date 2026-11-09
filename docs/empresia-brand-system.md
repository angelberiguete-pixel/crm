# Empresia · Sistema de identidad (versión provisional v0.1)

## Decisión de marca

**EMPRESIA** es la **única marca comercial** de la plataforma. CRM, ARM, ERP, IA, facturación y automatizaciones son capacidades o módulos: no son empresas ni marcas independientes.

- Nombre en interfaz, redes y comunicación: **Empresia**
- Handle comunicado por el propietario: **@empresia.rd**
- Descripción breve: **Plataforma inteligente de gestión empresarial**
- Propuesta de valor: **Conecta clientes, ventas y operaciones en una sola plataforma**
- Slogan de campaña opcional: **Tu empresa conectada. Tus decisiones más claras.**
- Público: pymes y negocios con equipos que requieren centralizar ventas, clientes y tareas, con integración de operaciones ERP por fases.
- Voz: práctica, transparente, directa; no prometer automatizaciones, ERP, facturación electrónica ni IA autónoma antes de tenerlas probadas.

## Sistema visual original

**Paleta base**
- Azul petróleo / base: `#102938` — confianza, fondo de barra lateral, titulares sobre claro.
- Verde azulado / interacción: `#117D82` — enlaces, botones, selección.
- Menta / acento: `#22D3BE` — símbolo, indicadores activos, énfasis puntual.
- Blanco frío: `#F6FAF9` — fondos de presentación.
- Gris oscuro: `#20303B` — texto principal.
- Blanco: `#FFFFFF`.

**Tipografía**
- Inter o sans-serif equivalente para interfaz y piezas comerciales.
- Titulares en semibold/bold; evitar mayúsculas excesivas en párrafos.
- Espaciado amplio, tarjetas limpias, gráficos legibles en móvil.

**Marca gráfica provisional**
- SVG claro: `/empresia-logo.svg`.
- SVG oscuro: `/empresia-logo-light.svg`.
- Favicon: `/empresia-icon.svg`.
- El símbolo se diseñó desde cero como una «E» de tres trazos y un punto de conexión; no tomar referencias de las marcas internacionales coincidentes.
- Estos activos son provisionales hasta la revisión comercial y verificación legal.

## Arquitectura de navegación

`Empresia` (plataforma) → `Clientes/CRM`, `Relaciones y agentes/ARM`, `Operaciones/ERP`, `Facturación`, `Análisis`, `Configuración`.

Las secciones deben aparecer según permiso, habilitación y estado de integración. Nunca mostrar ERP operativo ni cobros automáticos reales si falta su verificación.

## Perfiles sociales

**Bio sugerida**
«Software de gestión empresarial. CRM, automatización y herramientas de IA para conectar ventas y operaciones. República Dominicana | Próximamente ERP integrado.»

No usar “marca registrada”, “Empresa SRL” u otras afirmaciones legales no verificadas. Mantener mensajes claros sobre funcionalidad disponible.

## Relación con los clientes

- Family Power y otras empresas conservan sus identidades, logos, colores, credenciales y accesos.
- El proveedor de la plataforma y los contratos pueden identificar a la persona física titular de los servicios, según la documentación real.
- No cambiar identificadores internos, rutas webhook, secretos, políticas RLS o PayPal REST App por motivos de marca.
- El motor Dolibarr se integra como infraestructura ERP, no se comercializa bajo una segunda marca.

## Protección legal y lanzamiento

El nombre **Empresia** fue elegido por el propietario, y ya se utiliza para la identidad social; su disponibilidad como signo registral en República Dominicana requiere confirmación ante ONAPI. No interpretar la disponibilidad de Instagram como titularidad de marca.

Antes de un lanzamiento irreversible: validar búsqueda de antecedentes fonéticos y clases 9/35/42, confirmar dominio, revisar identidad gráfica en fondos claros/oscuros y probar accesibilidad y navegación.

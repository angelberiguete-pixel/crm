# Empresia — Sistema de identidad corporativa oficial (V3, 9 de noviembre de 2026)

## Decisión de marca

**Empresia** es la marca visible y comercial única de la plataforma empresarial principal. El nombre **AXIOM** fue un código de propuesta descartado y no integra la identidad. No utilizar **Look Social Media** en nuevas páginas públicas, pantallas de acceso, portadas, cotizaciones o redes.

- Nombre: **Empresia** (capitalización preferida).
- Usuario social: **@empresia.rd**.
- Lema: **Tu negocio, todo conectado.**
- Posicionamiento: software y servicios para organizar clientes, ventas, relaciones, operaciones y automatizaciones, con IA supervisada y módulos habilitados según su implementación.
- Mercado inicial: República Dominicana y Latinoamérica.
- Voz: clara, profesional, precisa y cercana; no atribuir resultados, cifras, autorizaciones o capacidades no verificadas.

## Identidad visual aprobada

La identidad aprobada es **la del primer diseño original refinado V3**, no los conceptos AXIOM, ATLAS o FORMA.

### Construcción del símbolo
Tres trazos diagonales redondeados dispuestos como una E abstracta: **azul · menta · azul**. La marca denominativa es **Empresia**, no todo en mayúsculas por defecto.

### Colores
| Rol | Token | HEX |
| --- | --- | --- |
| Azul medianoche / tinta | `--brand-ink` | `#101828` |
| Azul eléctrico | `--brand-blue` | `#315BFF` |
| Verde menta | `--brand-cyan` | `#35D9B7` |
| Azul secundario | `--brand-violet` (alias técnico heredado) | `#3385FF` |
| Gris nieve | fondo editorial | `#F7F9FC` |
| Blanco | `--brand-white` | `#FFFFFF` |

Los nombres internos de variables CSS pueden conservarse para compatibilidad. El símbolo y la paleta no deben sustituirse por los SVG provisionales petróleo/turquesa.

### Tipografía
**Inter Display** para titulares y **Inter** para interfaz y textos, con alternativas sans-serif del sistema cuando no estén disponibles. No se distribuyen archivos de fuentes de terceros.

### Recursos en el proyecto
- `/empresia-logo.svg`: logo oscuro, para fondo claro.
- `/empresia-logo-light.svg`: logo blanco, para fondo oscuro.
- `/empresia-icon.svg`: isotipo sobre fondo de marca, para favicon o icono.

Los SVG de este repositorio proceden de los activos aprobados del proyecto guardados en Google Drive:
[Identidad oficial](https://drive.google.com/drive/folders/16iJ8VYxf9XoHxWWuyDSHlZnYwUNst7w2).
Se mantienen el símbolo y sus proporciones de origen.

## Arquitectura comercial

**Empresia** es marca matriz; CRM, ARM, ERP, Flow, IA y Pagos son capacidades o módulos. Solo anunciar un módulo como operativo cuando haya validación funcional y comercial. ERP/Dolibarr permanece en integración progresiva.

Cada cliente, incluidos Family Power y otras empresas, conserva sus marcas, logotipos, permisos y datos aislados. No cambiar slugs, claves, rutas internas de webhook, políticas RLS ni credenciales por un cambio cosmético.

## Reglas para Instagram

- Nombre visible sugerido: **Empresia | Software Empresarial**.
- Usuario existente: **@empresia.rd**.
- Foto de perfil: `08_Avatar_Instagram_1080.png` de la carpeta oficial.
- Biografía: **Software para conectar clientes, ventas y operaciones. CRM, automatización e IA supervisada. 🇩🇴 Tu negocio, todo conectado.**
- Primera publicación: presentación de la marca y qué problema resuelve; no indicar empresas/clientes, resultados o funciones no comprobados.
- Link de la biografía: solo la página comercial cuando esté publicada y verificada.

## Estado de aplicación

El paquete gráfico y la rama de código son distintos de producción. No atribuir un despliegue o cambio en Instagram al código hasta comprobarlo. La actualización del nombre visible, biografía y foto dentro de Instagram requiere la sesión del propietario o una integración autorizada.

**Nota legal:** no usar ® ni declarar marca registrada mientras ONAPI no haya confirmado la situación registral. No presentar Empresia como SRL si presta servicios una persona física y no está constituida así.

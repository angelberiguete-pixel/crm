# Family Power — Auditoría de fuentes en Google Drive
**Fecha:** 31-oct-2026 · **Responsable:** Ángel Berigüete · **Estado:** interno, ninguna ficha liberada para ventas.

## Fuentes identificadas en la carpeta existente
- Proyecto integral: https://drive.google.com/drive/folders/1zHwlxSINb3_e15RPMN2TrFBo2y4ciK-_
- Documento maestro V2: https://docs.google.com/document/d/1TBpCcZs8oNLhTaheznWP36MUOn-veExzGTXoj9tnVnI/edit
- Inventario documental Dirección General (17-oct): https://docs.google.com/document/d/1f3D126uMn8nuFUfS3MEYy-ZQASRDS_VpRgImi2Wf-NY/edit
- Matriz existente **Family Power Matriz Validacion SKU V1.xlsx**: https://docs.google.com/spreadsheets/d/150bhasMQq6aJWK-sHcSPdcNxsfyi1i_S/edit
- Solicitud de validación de productos: https://docs.google.com/document/d/1bGhQTMBulkqsu1V0fkC2LFpbx67ZXqF-GTfDkZU_Ckc/edit
- Carpeta de fotos originales: https://drive.google.com/drive/folders/10kwV3jribHKNGmuQRnJOx1IaNl8kiRsj
- Carpeta de documentos aprobados: https://drive.google.com/drive/folders/1QognOvwuo8_CiLIDB19EWnHrzcDQaAY-

## Resultados de lectura
La solicitud de validación (18-oct) menciona **cinco fotografías** (1000080152, 1000080149, 1000080107, 1000080108, 1000080129.jpg), **ocho identificadores provisionales PEND-01 a PEND-08**, **cero SKU aprobados y cero publicados**. Ninguna foto demuestra por sí sola nombre de marca, modelo, existencia, garantía o precio. Las menciones 1.5 kW y 3.6 kW son datos del borrador, no modelos certificados.

La ficha `FamilyPower_INDUETRONIC_1-5kW_12V_V2_Fondo_Blanco.pdf` figura en Drive, pero se presenta con **datos declarados**, número de baterías «por confirmar» y especificaciones aún por cotejar con placa/manual. No debe enviarse como **ficha oficial del fabricante** ni alimentar respuestas técnicas automáticas.

La cifra comunicada de **70 inversores** todavía no está asociada a 70 SKU ni a conteo físico aprobado. Es incorrecto convertirla automáticamente en 70 modelos o inventario disponible.

## Contrato de importación posterior
1. Leer Drive solo de las carpetas permitidas; mostrar vista previa y diferencias antes de cambiar CRM.
2. Conservar procedencia (file ID, revisión/modificado), fotos de placa y manual, y correspondencia SKU–archivo.
3. No importar precio ni inventario cero como «verificados». La ausencia de dato es **pendiente**.
4. Exigir aprobación explícita del propietario para desbloquear productos, fichas y cotizaciones reales.
5. No sincronizar automáticamente eliminaciones o ediciones de Drive a precios aprobados sin reconciliación y auditoría.
6. No publicar archivos de clientes ni números de serie visibles en un CDN abierto sin autorización.

**Estado técnico:** repositorio CRM tiene tablas de productos y tenant_files, pero no existe evidencia de importador de Google Drive en producción. Este documento no ejecuta importaciones ni modifica datos.

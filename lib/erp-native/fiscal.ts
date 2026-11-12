/** DGII certification preparation. This module cannot sign, submit or allocate fiscal sequences. */
export const DGII_SPEC_REVIEWED_AT = "2026-11-11";
export const DGII_OFFICIAL_DOCUMENTATION = "https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Paginas/documentacionSobreE-CF.aspx";
export const DGII_SERVICES_SPEC = "https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Informe%20y%20Descripci%C3%B3n%20T%C3%A9cnica/Descripcion%20Tecnica%20Servicios%20DGII.pdf";
export const DGII_FORMAT_SPEC = "https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Formatos%20XML/Formato%20Comprobante%20Fiscal%20Electr%C3%B3nico%20(e-CF)%20V1.0.pdf";

export type CertificationConfiguration = Readonly<{
  tenantId: string;
  environment: "precertification" | "certification";
  rnc: string;
  legalName: string;
  address: string;
}>;

export function dgiiCertificationUrls(environment: CertificationConfiguration["environment"]) {
  const segment = environment === "precertification" ? "testecf" : environment === "certification" ? "certecf" : null;
  if (!segment) throw new Error("production_fiscal_operations_disabled");
  return Object.freeze({
    authentication: `https://ecf.dgii.gov.do/${segment}/autenticacion`,
    reception: `https://ecf.dgii.gov.do/${segment}/recepcion`,
    consumptionReception: `https://fc.dgii.gov.do/${segment}/recepcionfc/`,
  });
}

/** Formatting only. A persistent, locked, tenant/environment scoped allocator is still required. */
export function formatEncf(type: "31" | "32", sequence: string) {
  if (!["31", "32"].includes(type) || !/^[1-9][0-9]{0,9}$/.test(sequence)) throw new Error("invalid_encf_components");
  return `E${type}${sequence.padStart(10, "0")}`;
}

function text(value: string, max: number) {
  if (typeof value !== "string" || !value.trim() || value.length > max
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/.test(value)) throw new Error("invalid_fiscal_text");
  return value.trim().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function fiscalDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value + "T00:00:00Z"))
    || new Date(value + "T00:00:00Z").toISOString().slice(0, 10) !== value) throw new Error("invalid_fiscal_date");
  return `${value.slice(8, 10)}-${value.slice(5, 7)}-${value.slice(0, 4)}`;
}

function minor(value: string) {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,15})$/.test(value)) throw new Error("invalid_fiscal_amount");
  return BigInt(value);
}
const money = (value: bigint) => `${value / 100n}.${(value % 100n).toString().padStart(2, "0")}`;

/**
 * Narrow XML draft: type 31, DOP, exempt goods/services, integer quantities, cash terms.
 * It is not XSD-validated, signed, authorized or suitable for submission.
 */
export function prepareExemptCertificationXml(config: CertificationConfiguration, input: {
  tenantId: string; encf: string; issueDate: string; sequenceExpiresAt: string;
  buyerRnc: string; buyerLegalName: string;
  lines: readonly { name: string; quantity: number; unitPriceMinor: string; kind: "good" | "service" }[];
}) {
  dgiiCertificationUrls(config.environment);
  if (!config.tenantId || config.tenantId !== input.tenantId) throw new Error("tenant_mismatch");
  if (!/^(\d{9}|\d{11})$/.test(config.rnc) || !/^(\d{9}|\d{11})$/.test(input.buyerRnc)) throw new Error("invalid_rnc_format");
  if (!/^E31[0-9]{10}$/.test(input.encf) || /^E310{10}$/.test(input.encf)) throw new Error("invalid_certification_encf");
  const date = fiscalDate(input.issueDate), expiry = fiscalDate(input.sequenceExpiresAt);
  if (input.sequenceExpiresAt < input.issueDate) throw new Error("fiscal_sequence_expired");
  if (input.lines.length < 1 || input.lines.length > 100) throw new Error("invalid_fiscal_lines");
  let total = 0n;
  const details = input.lines.map((line, index) => {
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 999_999 || !["good", "service"].includes(line.kind)) throw new Error("invalid_fiscal_line");
    const price = minor(line.unitPriceMinor), amount = price * BigInt(line.quantity);
    if (price === 0n || amount > 9_999_999_999_999_999n) throw new Error("invalid_fiscal_amount");
    total += amount;
    return `<Item><NumeroLinea>${index + 1}</NumeroLinea><IndicadorFacturacion>4</IndicadorFacturacion><NombreItem>${text(line.name, 80)}</NombreItem><IndicadorBienoServicio>${line.kind === "good" ? "1" : "2"}</IndicadorBienoServicio><CantidadItem>${line.quantity}</CantidadItem><PrecioUnitarioItem>${money(price)}</PrecioUnitarioItem><MontoItem>${money(amount)}</MontoItem></Item>`;
  }).join("");
  if (total > 9_999_999_999_999_999n) throw new Error("invalid_fiscal_total");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<!-- BORRADOR DE CERTIFICACION: SIN FIRMA Y SIN VALIDEZ FISCAL -->\n<ECF><Encabezado><Version>1.0</Version><IdDoc><TipoeCF>31</TipoeCF><eNCF>${input.encf}</eNCF><FechaVencimientoSecuencia>${expiry}</FechaVencimientoSecuencia><TipoIngresos>01</TipoIngresos><TipoPago>1</TipoPago></IdDoc><Emisor><RNCEmisor>${config.rnc}</RNCEmisor><RazonSocialEmisor>${text(config.legalName, 150)}</RazonSocialEmisor><DireccionEmisor>${text(config.address, 100)}</DireccionEmisor><FechaEmision>${date}</FechaEmision></Emisor><Comprador><RNCComprador>${input.buyerRnc}</RNCComprador><RazonSocialComprador>${text(input.buyerLegalName, 150)}</RazonSocialComprador></Comprador><Totales><MontoExento>${money(total)}</MontoExento><MontoTotal>${money(total)}</MontoTotal></Totales></Encabezado><DetallesItems>${details}</DetallesItems></ECF>`;
  return Object.freeze({
    tenantId: config.tenantId, environment: config.environment, xml,
    totalMinor: total.toString(), schemaValidated: false as const, signed: false as const,
    submittable: false as const, requiresHumanApproval: true as const,
    pending: Object.freeze(["official_xsd_validation", "persistent_sequence_allocation", "certificate_signature", "certification_authorization"]),
  });
}

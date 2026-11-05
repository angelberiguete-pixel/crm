/**
 * Dominican Republic electronic invoicing domain core.
 * Pure calculations and validation only. NOT a certified DGII emitter.
 * No credentials, e-NCF allocation, XML signing or fiscal submission here.
 */
export const ECF_TYPES = {
  E31: "Crédito fiscal",
  E32: "Consumo",
  E33: "Nota de débito",
  E34: "Nota de crédito",
  E41: "Compras",
  E43: "Gastos menores",
  E44: "Regímenes especiales",
  E45: "Gubernamental",
  E46: "Exportaciones",
  E47: "Pagos al exterior",
} as const;

export type EcfType = keyof typeof ECF_TYPES;
export type FiscalStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "submitting"
  | "submitted"
  | "accepted"
  | "rejected"
  | "requires_review"
  | "cancelled_draft";

export interface FiscalParty {
  legalName: string;
  rnc: string;
  address?: string;
}
export interface FiscalLine {
  description: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  itbisRate?: number;
}
export interface FiscalDraft {
  tenantId: string;
  type: EcfType;
  issuer: FiscalParty;
  buyer?: FiscalParty;
  currency: "DOP";
  lines: FiscalLine[];
  referenceEcf?: string;
}
export interface FiscalTotals {
  subtotal: number;
  discounts: number;
  taxableBase: number;
  itbis: number;
  total: number;
}
const roundMoney = (amount: number): number => Math.round((amount + Number.EPSILON) * 100) / 100;
const finiteNonnegative = (value: number) => Number.isFinite(value) && value >= 0;

/** Preview arithmetic only. Provider/DGII schemas govern official tax calculations and rounding. */
export function calculateFiscalPreview(lines: FiscalLine[]): FiscalTotals {
  if (!lines.length) throw new Error("La factura debe incluir al menos una línea.");
  let subtotal = 0;
  let discounts = 0;
  let taxableBase = 0;
  let itbis = 0;
  for (const line of lines) {
    const discount = line.discount ?? 0;
    const rate = line.itbisRate ?? 0;
    if (!Number.isFinite(line.quantity) || line.quantity <= 0 ||
        !finiteNonnegative(line.unitPrice) || !finiteNonnegative(discount) ||
        ![0, 0.16, 0.18].includes(rate)) {
      throw new Error("Cantidad, precio, descuento o tasa de ITBIS inválidos.");
    }
    const gross = roundMoney(line.quantity * line.unitPrice);
    if (discount > gross) throw new Error("El descuento supera el importe de la línea.");
    const base = roundMoney(gross - discount);
    subtotal += gross;
    discounts += discount;
    taxableBase += base;
    itbis += roundMoney(base * rate);
  }
  return {
    subtotal: roundMoney(subtotal),
    discounts: roundMoney(discounts),
    taxableBase: roundMoney(taxableBase),
    itbis: roundMoney(itbis),
    total: roundMoney(taxableBase + itbis),
  };
}
export function validateFiscalDraft(draft: FiscalDraft): string[] {
  const errors: string[] = [];
  if (!draft.tenantId.trim()) errors.push("Falta el identificador de empresa.");
  if (!draft.issuer.legalName.trim()) errors.push("Falta la razón social del emisor.");
  if (!/^[0-9]{9}([0-9]{2})?$/.test(draft.issuer.rnc.replace(/[-\s]/g, "")))
    errors.push("El RNC/cédula del emisor tiene un formato inválido.");
  if (draft.type === "E31" && (!draft.buyer?.legalName || !draft.buyer?.rnc))
    errors.push("E31 requiere identificación fiscal del comprador.");
  if ((draft.type === "E33" || draft.type === "E34") && !draft.referenceEcf)
    errors.push("La nota debe referenciar el comprobante original.");
  try { calculateFiscalPreview(draft.lines); } catch (error) {
    errors.push(error instanceof Error ? error.message : "Líneas inválidas.");
  }
  return errors;
}

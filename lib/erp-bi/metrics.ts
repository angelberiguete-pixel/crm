/**
 * ERP / Business Intelligence metric contracts.
 * Pure functions; no cross-tenant queries, network access or fabricated data.
 * All monetary inputs must use the same currency and minor-unit precision.
 */
export type Currency = "DOP" | "USD";
export type Period = { from: string; to: string };
export type TenantMetricInput = {
  tenantId: string;
  currency: Currency;
  period: Period;
  paidSalesMinor: number;
  refundsMinor: number;
  costOfGoodsMinor: number;
  quotesIssued: number;
  quotesAccepted: number;
  receivablesMinor: number;
};
export type BusinessSnapshot = {
  tenantId: string;
  currency: Currency;
  period: Period;
  netRevenueMinor: number;
  grossProfitMinor: number;
  grossMarginPercent: number | null;
  quoteConversionPercent: number | null;
  receivablesMinor: number;
};
const safeNonnegative = (value: number, name: string) => {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid ${name}`);
  return value;
};
export function calculateBusinessSnapshot(input: TenantMetricInput): BusinessSnapshot {
  if (!input.tenantId.trim()) throw new Error("Tenant required");
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(input.period.from) ||
      !/^\\d{4}-\\d{2}-\\d{2}$/.test(input.period.to) ||
      input.period.from > input.period.to) throw new Error("Invalid period");
  const paid = safeNonnegative(input.paidSalesMinor, "paidSalesMinor");
  const refunds = safeNonnegative(input.refundsMinor, "refundsMinor");
  const cogs = safeNonnegative(input.costOfGoodsMinor, "costOfGoodsMinor");
  const issued = safeNonnegative(input.quotesIssued, "quotesIssued");
  const accepted = safeNonnegative(input.quotesAccepted, "quotesAccepted");
  const receivables = safeNonnegative(input.receivablesMinor, "receivablesMinor");
  if (refunds > paid || accepted > issued) throw new Error("Inconsistent totals");
  const netRevenueMinor = paid - refunds;
  const grossProfitMinor = netRevenueMinor - cogs;
  return {
    tenantId: input.tenantId, currency: input.currency, period: input.period,
    netRevenueMinor, grossProfitMinor,
    grossMarginPercent: netRevenueMinor ? (grossProfitMinor / netRevenueMinor) * 100 : null,
    quoteConversionPercent: issued ? (accepted / issued) * 100 : null,
    receivablesMinor: receivables
  };
}

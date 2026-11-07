// Pure PayPal contracts. All money is represented in integer minor units.
// PayPal checkout in this phase supports only 2-decimal currencies.
export const PAYPAL_CURRENCIES = ["USD","EUR","GBP","CAD","AUD"] as const;
export type PayPalCurrency = (typeof PAYPAL_CURRENCIES)[number];

export function isPayPalCurrency(value: unknown): value is PayPalCurrency {
  return typeof value === "string" &&
    (PAYPAL_CURRENCIES as readonly string[]).includes(value);
}

export function minorToPayPalAmount(value: number): string {
  if (!Number.isSafeInteger(value) || value < 1 || value > 10000000) {
    throw new Error("Invalid payment amount in minor units");
  }
  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2,"0")}`;
}

export function payPalAmountToMinor(value: unknown): number {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,5})\.[0-9]{2}$/.test(value)) {
    throw new Error("Invalid PayPal decimal amount");
  }
  const [major,minor] = value.split(".");
  const cents = Number(major) * 100 + Number(minor);
  if (!Number.isSafeInteger(cents) || cents < 1 || cents > 10000000) {
    throw new Error("PayPal amount outside allowed range");
  }
  return cents;
}

export type VerifiedCapture = {
  orderId: string;
  captureId: string;
  currency: PayPalCurrency;
  amountMinor: number;
  merchantId: string | null;
  status: "COMPLETED" | "PENDING" | "DENIED";
};

export function extractPayPalCapture(event: unknown): VerifiedCapture | null {
  if (!event || typeof event !== "object") return null;
  const e = event as Record<string,unknown>;
  const eventType = e.event_type;
  const requiredStatus = eventType === "PAYMENT.CAPTURE.COMPLETED" ? "COMPLETED" :
    eventType === "PAYMENT.CAPTURE.PENDING" ? "PENDING" :
    eventType === "PAYMENT.CAPTURE.DENIED" ? "DENIED" : null;
  if (!requiredStatus || !e.resource || typeof e.resource !== "object") return null;
  const resource = e.resource as Record<string,unknown>;
  const supplementary = resource.supplementary_data as Record<string,unknown> | undefined;
  const related = supplementary?.related_ids as Record<string,unknown> | undefined;
  const amount = resource.amount as Record<string,unknown> | undefined;
  const payee = resource.payee as Record<string,unknown> | undefined;
  if (resource.status !== requiredStatus ||
      typeof resource.id !== "string" || !/^[A-Za-z0-9]{6,64}$/.test(resource.id) ||
      typeof related?.order_id !== "string" || !/^[A-Za-z0-9]{6,64}$/.test(related.order_id) ||
      !isPayPalCurrency(amount?.currency_code)) return null;
  try {
    return {
      orderId: related.order_id,
      captureId: resource.id,
      currency: amount.currency_code,
      amountMinor: payPalAmountToMinor(amount.value),
      merchantId: typeof payee?.merchant_id === "string" ? payee.merchant_id : null,
      status: requiredStatus
    };
  } catch { return null; }
}

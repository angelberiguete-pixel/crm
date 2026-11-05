import type { EcfType, FiscalDraft } from "./ecf-domain";

/** Provider-neutral contract; no real implementation or DGII connection yet. */
export type ProviderSubmissionResult = {
  providerReference: string;
  status: "submitted" | "accepted" | "rejected" | "requires_review";
  externalMessage?: string;
  ecfNumber?: string;
};
export type ProviderStatusResult = {
  providerReference: string;
  status: ProviderSubmissionResult["status"];
  updatedAt: string;
  externalMessage?: string;
};
export interface FiscalProvider {
  readonly providerId: string;
  submit(input: {
    tenantId: string;
    invoiceId: string;
    idempotencyKey: string;
    draft: FiscalDraft;
    authorizedType: EcfType;
  }): Promise<ProviderSubmissionResult>;
  getStatus(input: { tenantId: string; providerReference: string }): Promise<ProviderStatusResult>;
}

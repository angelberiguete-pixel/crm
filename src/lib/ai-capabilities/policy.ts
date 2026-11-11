/** Pure capability policy. This module does not connect to customer data. */
export const CAPABILITIES = ["agent-browser", "security-audit", "openviking-memory", "agent-harness", "diagram-design"] as const;
export type Capability = typeof CAPABILITIES[number];
export type TenantCapabilityPolicy = Readonly<{
  tenantId: string;
  enabled: readonly Capability[];
  version: string;
  approvedBy: string;
  approvedAt: string;
}>;
export type CapabilityDecision = Readonly<{ allowed: boolean; reason: string }>;
export function evaluateCapability(input: {
  authenticatedTenantId: string | null | undefined;
  requestedTenantId: string;
  capability: Capability;
  policy: TenantCapabilityPolicy | null | undefined;
}): CapabilityDecision {
  if (!input.authenticatedTenantId || input.authenticatedTenantId !== input.requestedTenantId) {
    return { allowed: false, reason: "tenant_mismatch" };
  }
  if (!input.policy || input.policy.tenantId !== input.requestedTenantId) {
    return { allowed: false, reason: "policy_missing_or_mismatch" };
  }
  if (!input.policy.approvedBy || !input.policy.approvedAt || !input.policy.version) {
    return { allowed: false, reason: "policy_not_approved" };
  }
  if (!CAPABILITIES.includes(input.capability) || !input.policy.enabled.includes(input.capability)) {
    return { allowed: false, reason: "capability_disabled" };
  }
  return { allowed: true, reason: "allowed" };
}

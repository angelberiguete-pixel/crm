/** Foundation for CRM automation/agent execution. This module grants no database or network privileges. */
export type HubAction = "catalog.read" | "agent.run" | "run.read" | "run.approve" | "connector.manage";
export type HubRole = "owner" | "admin" | "manager" | "operator" | "viewer";
export type HubIdentity = { userId: string; tenantId: string; role: HubRole; activeMembership: boolean };
export type HubRequest = { tenantId: string; action: HubAction; actor?: HubIdentity | null; enabled: boolean };
const rolePermissions: Readonly<Record<HubRole, readonly HubAction[]>> = {
  owner: ["catalog.read","agent.run","run.read","run.approve","connector.manage"],
  admin: ["catalog.read","agent.run","run.read","run.approve","connector.manage"],
  manager: ["catalog.read","agent.run","run.read","run.approve"],
  operator: ["catalog.read","agent.run","run.read"],
  viewer: ["catalog.read","run.read"],
};
export function canUseAutomationHub(request: HubRequest): boolean {
  const {actor,tenantId,action,enabled}=request;
  return enabled === true && !!actor && actor.activeMembership === true
    && typeof actor.userId === "string" && actor.userId.length > 0
    && typeof tenantId === "string" && tenantId.length > 0
    && actor.tenantId === tenantId
    && Array.isArray(rolePermissions[actor.role])
    && rolePermissions[actor.role].includes(action);
}
export type AgentExecutionRequest = { tenantId: string; agentId: string; input: string; maxInputChars: number; requiresApproval: boolean; approved: boolean };
export function validateAgentExecution(request: HubRequest, run: AgentExecutionRequest): {allowed:boolean;reason:string} {
  if (!canUseAutomationHub({...request,action:"agent.run"})) return {allowed:false,reason:"unauthorized"};
  if (run.tenantId !== request.tenantId) return {allowed:false,reason:"tenant_mismatch"};
  if (!run.agentId || !run.input || run.input.length > run.maxInputChars || run.maxInputChars <= 0 || run.maxInputChars > 20000) return {allowed:false,reason:"invalid_input"};
  if (run.requiresApproval && !run.approved) return {allowed:false,reason:"approval_required"};
  return {allowed:true,reason:"eligible_only"};
}
/** eligible_only is NOT authorization to invoke an external provider: backend must recheck identity, quotas, tools and approvals. */

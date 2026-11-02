// Pure access-control helpers for the MCP server. A selected membership is necessary,
// but never sufficient: table RLS and module/role permissions are checked independently.
import { MCP_DATASETS, type McpDataset } from "./mcp-protocol.ts";

export type McpWorkspace = {
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  membership_role: string;
};

export function selectedMcpWorkspace(value: unknown): McpWorkspace | null {
  if (!Array.isArray(value)) return null;
  const active = value.filter((row): row is Record<string, unknown> =>
    Boolean(row) && typeof row === "object" && !Array.isArray(row) &&
    row.is_active === true);
  // Do not guess if the backend reports no active company or more than one.
  if (active.length !== 1) return null;
  const row = active[0];
  if (typeof row.tenant_id !== "string" ||
      typeof row.tenant_name !== "string" ||
      typeof row.tenant_slug !== "string" ||
      typeof row.membership_role !== "string") return null;
  return {
    tenant_id: row.tenant_id,
    tenant_name: row.tenant_name,
    tenant_slug: row.tenant_slug,
    membership_role: row.membership_role
  };
}

export function allowedMcpDatasets(permissions: unknown, modules: unknown): readonly McpDataset[] {
  if (!permissions || typeof permissions !== "object" || Array.isArray(permissions) ||
      !Array.isArray(modules)) return [];
  const grants = permissions as Record<string, unknown>;
  return MCP_DATASETS.filter((dataset) =>
    (grants.all === true || grants[dataset.permission] === true) &&
    modules.some((row: unknown) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) return false;
      const module = row as Record<string, unknown>;
      return module.module_key === dataset.module && module.enabled === true;
    }));
}

export function validateMcpWorkspaceAccess(
  workspace: McpWorkspace | null,
  tenantId: string,
  allowed: readonly McpDataset[],
  toolName: string
): boolean {
  return workspace !== null &&
    workspace.tenant_id === tenantId &&
    allowed.some((entry) => entry.name === toolName);
}

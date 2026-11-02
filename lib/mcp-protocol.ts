// Minimal, dependency-free MCP Streamable HTTP protocol helpers (2025-11-25).
// Business data and authorization live exclusively in the server route.
export const MCP_PROTOCOL_VERSION = "2025-11-25";

export type McpRequest = {
  jsonrpc: "2.0";
  method: string;
  id?: string | number;
  params?: unknown;
};

export type McpTool = {
  name: string;
  title: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties: false;
  };
  annotations: {
    readOnlyHint: true;
    destructiveHint: false;
    openWorldHint: false;
  };
};

export type McpDataset = {
  name: string;
  table: "contacts" | "products" | "inventory_items" | "quotations" | "orders" | "ai_agents";
  columns: string;
  permission: string;
  module: string;
  searchField?: string;
};

const uuidSchema = {
  type: "string",
  pattern: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
  description: "ID explícito de la empresa actualmente seleccionada."
};
const limitSchema = { type: "integer", minimum: 1, maximum: 25, default: 10 };
const querySchema = { type: "string", minLength: 1, maxLength: 80 };

export const MCP_DATASETS: readonly McpDataset[] = [
  { name: "crm.list_contacts", table: "contacts",
    columns: "id,tenant_id,display_name,first_name,last_name,email,phone,status,updated_at",
    permission: "contacts", module: "contacts", searchField: "display_name" },
  { name: "crm.list_products", table: "products",
    columns: "id,tenant_id,sku,name,description,status,sale_price,currency,stock_snapshot,updated_at",
    permission: "products", module: "products", searchField: "name" },
  { name: "crm.list_inventory", table: "inventory_items",
    columns: "id,tenant_id,sku,name,unit,on_hand,reserved,reorder_level,active,updated_at",
    permission: "operations", module: "operations", searchField: "name" },
  { name: "crm.list_quotations", table: "quotations",
    columns: "id,tenant_id,quote_number,contact_id,status,currency,total,valid_until,updated_at",
    permission: "quotations", module: "quotations" },
  { name: "crm.list_orders", table: "orders",
    columns: "id,tenant_id,order_number,contact_id,status,currency,total,amount_paid,updated_at",
    permission: "operations", module: "operations" },
  { name: "crm.list_agents", table: "ai_agents",
    columns: "id,tenant_id,name,purpose,status,model_provider,approval_mode,updated_at",
    permission: "settings", module: "ai_agents" }
];

const titles: Record<string, [string, string]> = {
  "crm.list_contacts": ["Consultar contactos", "Lista contactos autorizados de la empresa activa."],
  "crm.list_products": ["Consultar productos", "Consulta catálogo y existencias registradas, sin modificar productos."],
  "crm.list_inventory": ["Consultar inventario", "Consulta inventario y niveles de existencias de la empresa."],
  "crm.list_quotations": ["Consultar cotizaciones", "Lista estados y totales de cotizaciones, sin emitir ni aprobar."],
  "crm.list_orders": ["Consultar pedidos", "Lista pedidos y totales, sin registrar ventas ni pagos."],
  "crm.list_agents": ["Consultar agentes de IA", "Lista perfiles y estados, sin exponer prompts ni credenciales."]
};

export const MCP_TOOLS: readonly McpTool[] = MCP_DATASETS.map((dataset) => {
  const [title, description] = titles[dataset.name];
  return {
    name: dataset.name, title, description,
    inputSchema: {
      type: "object" as const,
      properties: {
        tenant_id: uuidSchema,
        limit: limitSchema,
        ...(dataset.searchField ? { query: querySchema } : {})
      },
      required: ["tenant_id"],
      additionalProperties: false as const
    },
    annotations: {
      readOnlyHint: true as const,
      destructiveHint: false as const,
      openWorldHint: false as const
    }
  };
});

export function parseMcpRequest(body: unknown): McpRequest | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  if (input.jsonrpc !== "2.0" || typeof input.method !== "string" || !input.method) return null;
  if ("id" in input && (typeof input.id !== "string" && typeof input.id !== "number")) return null;
  if (typeof input.id === "number" && !Number.isSafeInteger(input.id)) return null;
  return input as McpRequest;
}

export function rpcResult(id: string | number | null, result: unknown) {
  return { jsonrpc: "2.0" as const, id, result };
}

export function rpcError(id: string | number | null, code: number, message: string) {
  return { jsonrpc: "2.0" as const, id, error: { code, message } };
}

export function validMcpOrigin(origin: string | null, requestUrl: string): boolean {
  if (!origin) return true; // Non-browser MCP clients normally omit Origin.
  try {
    return new URL(origin).origin === new URL(requestUrl).origin;
  } catch {
    return false;
  }
}

export type ValidToolCall = { dataset: McpDataset; tenantId: string; limit: number; query: string | null };

export function validateMcpToolCall(params: unknown): ValidToolCall | null {
  if (!params || typeof params !== "object" || Array.isArray(params)) return null;
  const { name, arguments: args } = params as Record<string, unknown>;
  const dataset = MCP_DATASETS.find((entry) => entry.name === name);
  if (!dataset || !args || typeof args !== "object" || Array.isArray(args)) return null;
  const input = args as Record<string, unknown>;
  const validFields = dataset.searchField ? ["tenant_id", "limit", "query"] : ["tenant_id", "limit"];
  if (Object.keys(input).some((key) => !validFields.includes(key))) return null;
  if (typeof input.tenant_id !== "string" || !new RegExp(uuidSchema.pattern).test(input.tenant_id)) return null;
  const limit = input.limit === undefined ? 10 : input.limit;
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 25) return null;
  if (input.query !== undefined &&
      (!dataset.searchField || typeof input.query !== "string" ||
       input.query.trim().length < 1 || input.query.length > 80)) return null;
  return { dataset, tenantId: input.tenant_id, limit, query: typeof input.query === "string" ? input.query.trim() : null };
}

export function mcpToolText(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }] };
}

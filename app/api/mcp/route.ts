import { createClient } from "@supabase/supabase-js";
import { CRM_SUPABASE_URL, CRM_SUPABASE_PUBLISHABLE_KEY } from "@/lib/supabase";
import {
  MCP_PROTOCOL_VERSION, MCP_TOOLS, MCP_WORKSPACE_TOOL,
  parseMcpRequest, rpcError, rpcResult, validateMcpToolCall,
  validMcpOrigin, validWorkspaceToolArgs, mcpToolText, type ValidToolCall
} from "@/lib/mcp-protocol";
import {
  selectedMcpWorkspace, allowedMcpDatasets, validateMcpWorkspaceAccess
} from "@/lib/mcp-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// This is an internal, read-only MCP pilot using an end-user Supabase JWT.
// It is not a public OAuth resource server; do not share CRM session JWTs
// with third-party MCP hosts. An explicit server-side enable flag is required.
const enabled = () => process.env.MCP_INTERNAL_ENABLED === "true";
const NO_CACHE = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const JSON_HEADERS = { ...NO_CACHE, "Content-Type": "application/json; charset=utf-8" };

function json(body: unknown, status = 200, headers: Record<string,string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } });
}

function unavailable() {
  return json(rpcError(null, -32000, "MCP no está habilitado en este entorno."), 503);
}

function deniedTool(message: string) {
  return { ...mcpToolText({ error: message }), isError: true };
}

function bearer(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([A-Za-z0-9_.-]+)$/.exec(header);
  return match && match[1].length <= 8192 ? match[1] : null;
}

function userDb(accessToken: string) {
  return createClient(CRM_SUPABASE_URL, CRM_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: "Bearer " + accessToken } }
  });
}
type UserDb = ReturnType<typeof userDb>;

function sanitizedSearch(value: string): string {
  // Escape wildcards; never build PostgREST filter expressions from user input.
  return value.replace(/[\%_]/g, "\\$&");
}

async function accessContext(db: UserDb) {
  const membershipsResult = await db.rpc("list_my_tenants");
  if (membershipsResult.error) return null;
  const workspace = selectedMcpWorkspace(membershipsResult.data);
  if (!workspace) return null; // Fail closed when no company or an ambiguous selection.
  const [permissionResult, moduleResult] = await Promise.all([
    db.rpc("tenant_current_permissions", { p_tenant_id: workspace.tenant_id }),
    db.rpc("tenant_effective_modules", { p_tenant_id: workspace.tenant_id })
  ]);
  if (permissionResult.error || moduleResult.error) return null;
  const allowed = allowedMcpDatasets(permissionResult.data, moduleResult.data);
  return { workspace, allowed };
}

async function readTool(db: UserDb, call: ValidToolCall, context: NonNullable<Awaited<ReturnType<typeof accessContext>>>) {
  if (!validateMcpWorkspaceAccess(context.workspace, call.tenantId, context.allowed, call.dataset.name)) {
    return deniedTool("Función no habilitada o empresa distinta de la seleccionada.");
  }
  // RLS is evaluated using this end-user JWT. No service key or privileged RPC.
  let query = db.from(call.dataset.table).select(call.dataset.columns).eq("tenant_id", call.tenantId);
  if (call.query && call.dataset.searchField) {
    query = query.ilike(call.dataset.searchField, "%" + sanitizedSearch(call.query) + "%");
  }
  const result = await query.order("updated_at", { ascending: false }).limit(call.limit);
  if (result.error) return deniedTool("No fue posible completar la consulta autorizada.");

  return mcpToolText({
    tenant_id: call.tenantId,
    source: call.dataset.table,
    count: result.data?.length ?? 0,
    records: result.data ?? []
  });
}

export async function POST(request: Request) {
  if (!enabled()) return unavailable();
  if (!validMcpOrigin(request.headers.get("origin"), request.url)) {
    return json(rpcError(null, -32000, "Origin no permitido."), 403);
  }

  const contentType = (request.headers.get("content-type") ?? "").split(";")[0].trim();
  const accept = request.headers.get("accept") ?? "";
  if (contentType !== "application/json" ||
      !accept.includes("application/json") || !accept.includes("text/event-stream")) {
    return json(rpcError(null, -32600, "Se requiere JSON y Accept: application/json, text/event-stream."), 400);
  }

  let raw: string;
  try {
    if (Number(request.headers.get("content-length") || 0) > 16384) {
      return json(rpcError(null, -32600, "Solicitud demasiado grande."), 413);
    }
    raw = await request.text();
    if (raw.length > 16384) return json(rpcError(null, -32600, "Solicitud demasiado grande."), 413);
  } catch {
    return json(rpcError(null, -32700, "No se pudo leer la solicitud."), 400);
  }

  let body: unknown;
  try { body = JSON.parse(raw); }
  catch { return json(rpcError(null, -32700, "JSON no válido."), 400); }
  const message = parseMcpRequest(body);
  if (!message) return json(rpcError(null, -32600, "Solicitud JSON-RPC no válida."), 400);

  const version = request.headers.get("mcp-protocol-version");
  if ((version && version !== MCP_PROTOCOL_VERSION) ||
      (message.method !== "initialize" && version !== MCP_PROTOCOL_VERSION)) {
    return json(rpcError(message.id ?? null, -32600, "Versión MCP no soportada o ausente."), 400);
  }

  const accessToken = bearer(request);
  if (!accessToken) {
    return json(rpcError(message.id ?? null, -32001, "Autenticación requerida."), 401,
      { "WWW-Authenticate": 'Bearer realm="crm-mcp"' });
  }
  const db = userDb(accessToken);
  const verified = await db.auth.getUser(accessToken);
  if (verified.error || !verified.data.user) {
    return json(rpcError(message.id ?? null, -32001, "Sesión no válida."), 401,
      { "WWW-Authenticate": 'Bearer realm="crm-mcp", error="invalid_token"' });
  }

  if (message.id === undefined) {
    // Notifications have no JSON-RPC response.
    return new Response(null, { status: 202, headers: NO_CACHE });
  }

  const id = message.id;
  if (message.method === "initialize") {
    return json(rpcResult(id, {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "angel-beriguete-business-platform", version: "0.2.0" },
      instructions: "Solo lectura. Selecciona primero una empresa en el CRM. Consulta crm.get_workspace_context para obtener el ID y las herramientas autorizadas."
    }));
  }
  if (message.method === "ping") return json(rpcResult(id, {}));

  if (message.method !== "tools/list" && message.method !== "tools/call") {
    return json(rpcError(id, -32601, "Método MCP no soportado."));
  }

  try {
    const context = await accessContext(db);
    if (message.method === "tools/list") {
      return json(rpcResult(id, { tools: context
        ? [MCP_WORKSPACE_TOOL, ...MCP_TOOLS.filter((tool) =>
          context.allowed.some((entry) => entry.name === tool.name))]
        : [] }));
    }
    const params = message.params;
    if (validWorkspaceToolArgs(params)) {
      return json(rpcResult(id, context ? mcpToolText({
        company: context.workspace,
        read_only_tools: context.allowed.map((entry) => entry.name)
      }) : deniedTool("No existe una empresa activa autorizada.")));
    }
    const call = validateMcpToolCall(params);
    if (!call) return json(rpcError(id, -32602, "Herramienta o argumentos no válidos."));
    if (!context) return json(rpcResult(id, deniedTool("No existe una empresa activa autorizada.")));
    const result = await readTool(db, call, context);
    // Only metadata goes to logs; never log JWTs, contact data, prompts or tool responses.
    console.info("crm_mcp_tool_call", {
      tool: call.dataset.name,
      tenant_id: call.tenantId,
      user_id: verified.data.user.id,
      status: "isError" in result ? "denied" : "ok"
    });
    return json(rpcResult(id, result));
  } catch {
    return json(rpcResult(id, deniedTool("Fallo temporal al consultar la empresa.")));
  }
}

export function GET(request: Request) {
  if (!enabled()) return unavailable();
  if (!validMcpOrigin(request.headers.get("origin"), request.url)) {
    return json(rpcError(null, -32000, "Origin no permitido."), 403);
  }
  return new Response(null, { status: 405, headers: { ...NO_CACHE, Allow: "POST" } });
}

export function DELETE(request: Request) {
  if (!enabled()) return unavailable();
  if (!validMcpOrigin(request.headers.get("origin"), request.url)) {
    return json(rpcError(null, -32000, "Origin no permitido."), 403);
  }
  return new Response(null, { status: 405, headers: { ...NO_CACHE, Allow: "POST" } });
}

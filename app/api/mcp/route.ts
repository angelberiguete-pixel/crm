import { createClient } from "@supabase/supabase-js";
import { CRM_SUPABASE_URL, CRM_SUPABASE_PUBLISHABLE_KEY } from "@/lib/supabase";
import {
  MCP_PROTOCOL_VERSION, MCP_TOOLS, parseMcpRequest, rpcError, rpcResult,
  validateMcpToolCall, validMcpOrigin, mcpToolText, type ValidToolCall
} from "@/lib/mcp-protocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stateless MCP 2025-11-25 Streamable HTTP / JSON mode.
// Authenticated requests use the end user's JWT; database RLS stays in force.
// This endpoint is read-only. OAuth for third-party MCP hosts is a separate rollout.
const NO_CACHE = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const JSON_HEADERS = { ...NO_CACHE, "Content-Type": "application/json; charset=utf-8" };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function deniedTool(message: string) {
  return { ...mcpToolText({ error: message }), isError: true };
}

function bearer(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([A-Za-z0-9_.-]+)$/.exec(header);
  return match && match[1].length <= 8192 ? match[1] : null;
}

function sanitizedSearch(value: string): string {
  // Quote LIKE wildcards; do not build PostgREST "or" expressions from user input.
  return value.replace(/[\%_]/g, "\\$&");
}

async function callReadTool(request: Request, call: ValidToolCall) {
  const accessToken = bearer(request);
  if (!accessToken) return deniedTool("Se requiere una sesión válida.");
  const db = createClient(CRM_SUPABASE_URL, CRM_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: "Bearer " + accessToken } }
  });

  const { data: userResult, error: userError } = await db.auth.getUser(accessToken);
  if (userError || !userResult.user) return deniedTool("Sesión no válida.");

  // Reuse the very same tenant selection RPC used by the CRM UI.
  // A membership in another company never grants access to this company.
  const { data: memberships, error: membershipError } = await db.rpc("list_my_tenants");
  const selected = Array.isArray(memberships) &&
    memberships.some((membership) =>
      membership.tenant_id === call.tenantId && membership.is_active === true);
  if (membershipError || !selected) return deniedTool("Selecciona primero esta empresa en el CRM.");

  const [permissionsResult, modulesResult] = await Promise.all([
    db.rpc("tenant_current_permissions", { p_tenant_id: call.tenantId }),
    db.rpc("tenant_effective_modules", { p_tenant_id: call.tenantId })
  ]);
  if (permissionsResult.error || modulesResult.error) {
    return deniedTool("No se pudieron verificar los permisos.");
  }

  const permissions = permissionsResult.data;
  const modules = modulesResult.data;
  if (!permissions || typeof permissions !== "object" || Array.isArray(permissions) ||
      !Array.isArray(modules)) return deniedTool("Permisos de empresa no disponibles.");
  const grants = permissions as Record<string, unknown>;
  const allowed = grants.all === true || grants[call.dataset.permission] === true;
  const module = modules.find((row) => row.module_key === call.dataset.module);
  // Do not expose modules that are disabled or missing from the effective list.
  if (!allowed || !module || module.enabled !== true) {
    return deniedTool("La función no está habilitada para tu rol o empresa.");
  }

  let query = db.from(call.dataset.table)
    .select(call.dataset.columns)
    .eq("tenant_id", call.tenantId);
  if (call.query && call.dataset.searchField) {
    query = query.ilike(call.dataset.searchField, "%" + sanitizedSearch(call.query) + "%");
  }
  const result = await query.order("updated_at", { ascending: false }).limit(call.limit);
  if (result.error) return deniedTool("No se pudo completar la consulta autorizada.");

  return mcpToolText({
    tenant_id: call.tenantId,
    source: call.dataset.table,
    count: result.data?.length ?? 0,
    records: result.data ?? []
  });
}

export async function POST(request: Request) {
  if (!validMcpOrigin(request.headers.get("origin"), request.url)) {
    return json(rpcError(null, -32000, "Origin no permitido."), 403);
  }

  const contentType = (request.headers.get("content-type") ?? "").split(";")[0].trim();
  const accept = request.headers.get("accept") ?? "";
  if (contentType !== "application/json" ||
      (!accept.includes("application/json") && !accept.includes("*/*"))) {
    return json(rpcError(null, -32600, "Se requiere JSON y Accept: application/json."), 400);
  }

  const version = request.headers.get("mcp-protocol-version");
  if (version && version !== MCP_PROTOCOL_VERSION && version !== "2025-03-26") {
    return json(rpcError(null, -32600, "Versión MCP no soportada."), 400);
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
  try {
    body = JSON.parse(raw);
  } catch {
    return json(rpcError(null, -32700, "JSON no válido."), 400);
  }
  const message = parseMcpRequest(body);
  if (!message) return json(rpcError(null, -32600, "Solicitud JSON-RPC no válida."), 400);

  // No data or tool catalogue is exposed without a valid CRM login.
  const accessToken = bearer(request);
  if (!accessToken) return json(rpcError(message.id ?? null, -32001, "Autenticación requerida."), 401);

  const db = createClient(CRM_SUPABASE_URL, CRM_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: "Bearer " + accessToken } }
  });
  const verified = await db.auth.getUser(accessToken);
  if (verified.error || !verified.data.user) {
    return json(rpcError(message.id ?? null, -32001, "Sesión no válida."), 401);
  }

  if (message.id === undefined) {
    // MCP notifications do not receive a JSON-RPC response.
    return new Response(null, { status: 202, headers: NO_CACHE });
  }

  const id = message.id;
  if (message.method === "initialize") {
    return json(rpcResult(id, {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "angel-beriguete-business-platform", version: "0.1.0" },
      instructions: "Herramientas únicamente de lectura. Debes indicar la empresa activa; se respetan los permisos del usuario y los módulos de cada cliente."
    }));
  }
  if (message.method === "ping") return json(rpcResult(id, {}));
  if (message.method === "tools/list") return json(rpcResult(id, { tools: MCP_TOOLS }));
  if (message.method === "tools/call") {
    const call = validateMcpToolCall(message.params);
    if (!call) return json(rpcError(id, -32602, "Herramienta o argumentos no válidos."));
    try {
      return json(rpcResult(id, await callReadTool(request, call)));
    } catch {
      return json(rpcResult(id, deniedTool("Fallo temporal al consultar la empresa.")));
    }
  }
  return json(rpcError(id, -32601, "Método MCP no soportado."));
}

export function GET() {
  return new Response(null, { status: 405, headers: { ...NO_CACHE, Allow: "POST" } });
}

export function DELETE() {
  return new Response(null, { status: 405, headers: { ...NO_CACHE, Allow: "POST" } });
}

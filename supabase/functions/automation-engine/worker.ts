import type { SupabaseClient } from "@supabase/supabase-js";

export type EventRow = {
  id: string; tenant_id: string; event_type: string; entity_type: string | null; entity_id: string | null;
  payload: Record<string, unknown>; mode: "live" | "test"; target_rule_id: string | null; attempts: number;
};
type Rule = { id: string; tenant_id: string; name: string; status: string; trigger_event: string | null };
type Node = { id: string; node_type: string; action_type: string | null; label: string; config: Record<string, unknown>; is_enabled: boolean };
type Edge = { source_node_id: string; target_node_id: string; source_handle: string };
type Summary = { event_id: string; status: string; rules: number; error?: string };

const INTERNAL_ACTIONS = new Set(["create_task", "assign_owner", "update_contact", "update_opportunity", "move_stage", "create_notification"]);
export const MAX_FLOW_STEPS = 100;
export const MAX_FLOW_DURATION_MS = 60_000;
export const MAX_EVENT_DEPTH = 10;

function getPath(source: unknown, path: string): unknown {
  return path.split(".").reduce((value: unknown, key) => value && typeof value === "object" && Object.hasOwn(value, key) ? (value as Record<string, unknown>)[key] : undefined, source);
}
export function compare(actual: unknown, operator: string, expected: unknown): boolean {
  if (operator === "exists") return actual !== undefined && actual !== null && actual !== "";
  if (operator === "equals") return String(actual ?? "") === String(expected ?? "");
  if (operator === "not_equals") return String(actual ?? "") !== String(expected ?? "");
  if (operator === "contains") return String(actual ?? "").toLowerCase().includes(String(expected ?? "").toLowerCase());
  if (actual === null || actual === undefined || actual === "" || expected === null || expected === undefined || expected === "") return false;
  const a = Number(actual), b = Number(expected);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return operator === "gt" ? a > b : operator === "gte" ? a >= b : operator === "lt" ? a < b : operator === "lte" ? a <= b : false;
}
export function nextNodes(node: Node, edges: Edge[], branch: string): string[] {
  const outgoing = edges.filter(edge => edge.source_node_id === node.id);
  if (node.node_type !== "condition") return outgoing.map(edge => edge.target_node_id);
  const matched = outgoing.filter(edge => edge.source_handle === branch);
  return (matched.length ? matched : outgoing.filter(edge => edge.source_handle === "default")).map(edge => edge.target_node_id);
}
const render = (template: string, context: Record<string, unknown>) => template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, path) => String(getPath(context, path) ?? ""));
const message = (error: unknown) => error instanceof Error ? error.message : "automation_failed";
const TRANSIENT_DB_CODES = new Set(["40001","40P01","53300","57P03","08000","08001","08003","08006","08P01","PGRST000","PGRST001","PGRST002","PGRST003"]);
class RetryableAutomationError extends Error {}
function retryable(error: unknown): boolean {
  if (error instanceof RetryableAutomationError) return true;
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && TRANSIENT_DB_CODES.has(code);
}
function check(result: { error: { message: string; code?: string } | null }) {
  if (result.error) throw retryable(result.error) ? new RetryableAutomationError(result.error.message) : new Error(result.error.message);
}

async function executeNode(db: SupabaseClient, node: Node, event: EventRow, runId: string, context: Record<string, unknown>) {
  const cfg = node.config ?? {};
  if (node.node_type === "trigger") return { branch: "default", output: { event: event.event_type } };
  if (node.node_type === "condition") {
    const actual = getPath(context, String(cfg.field ?? "")), result = compare(actual, String(cfg.operator ?? "equals"), cfg.compare);
    return { branch: result ? "yes" : "no", output: { actual, result } };
  }
  if (node.node_type === "delay") {
    if (event.mode === "test") return { branch: "default", output: { test_mode: true, delay_skipped: true, minutes: Number(cfg.minutes ?? 0) } };
    throw new Error("delay_executor_not_enabled");
  }
  if (node.node_type === "approval") throw new Error("approval_executor_not_enabled");
  if (node.node_type === "ai") throw new Error("ai_executor_not_connected");
  if (node.node_type !== "action") throw new Error("unsupported_node_type");

  const type = node.action_type ?? "";
  if (INTERNAL_ACTIONS.has(type)) {
    const prepared = { ...cfg, title: render(String(cfg.message || cfg.value || node.label), context).slice(0, 240) };
    if (event.mode === "test") {
      // No business RPC or table writes in test mode. Only execution logs are persisted.
      if (type === "assign_owner" && !String(cfg.user_id || cfg.value || "").trim()) throw new Error("assign_owner_user_required");
      if (type === "update_contact" && !["status", "job_title", "phone", "whatsapp_phone"].includes(String(cfg.field))) throw new Error("update_contact_config_invalid");
      if (type === "update_opportunity" && !["lead_score", "next_action", "next_action_at"].includes(String(cfg.field))) throw new Error("update_opportunity_config_invalid");
      if (type === "move_stage" && !String(cfg.stage_id || cfg.value || "").trim()) throw new Error("move_stage_config_invalid");
      return { branch: "default", output: { test_mode: true, simulated: true, action_type: type, config: prepared } };
    }
    const action = await db.rpc("execute_automation_internal_action", { p_run_id: runId, p_node_id: node.id, p_action_type: type, p_config: prepared, p_context: context });
    check(action);
    const output = (action.data ?? {}) as Record<string, unknown>;
    if (type === "assign_owner") context.owner_user_id = output.owner_user_id;
    if (type === "update_contact" || type === "update_opportunity") context[String(output.field)] = output.value;
    if (type === "move_stage") { context.stage_id = output.stage_id; context.status = output.status; }
    return { branch: "default", output };
  }
  if (type === "send_whatsapp" || type === "send_email") {
    const provider = type === "send_whatsapp" ? "whatsapp" : "email";
    const channel = await db.from("channels").select("id,status").eq("tenant_id", event.tenant_id).eq("provider", provider).eq("status", "connected").limit(1).maybeSingle();
    check(channel);
    if (!channel.data) throw new Error(`${provider}_channel_not_connected`);
    throw new Error(`${provider}_delivery_executor_not_enabled`);
  }
  if (type === "sync_odoo") {
    const erp = await db.from("erp_connections").select("id,status").eq("tenant_id", event.tenant_id).eq("provider", "odoo").eq("status", "connected").limit(1).maybeSingle();
    check(erp);
    if (!erp.data) throw new Error("odoo_not_connected");
    throw new Error("odoo_automation_executor_not_enabled");
  }
  if (["call_webhook", "invoke_ai", "create_quotation", "create_order", "generate_document"].includes(type)) throw new Error(`${type}_executor_not_enabled`);
  throw new Error("unsupported_action_type");
}

export async function processAutomationEvents(db: SupabaseClient, events: EventRow[]): Promise<Summary[]> {
  const summary: Summary[] = [];
  for (const event of events) {
    let processed = 0;
    try {
      const tenant = await db.from("tenants").select("status").eq("id", event.tenant_id).maybeSingle();
      check(tenant);
      if (!tenant.data || !["active", "trial"].includes(tenant.data.status)) throw new Error("tenant_not_operational");
      const depth = Number((event.payload._automation as Record<string, unknown> | undefined)?.depth ?? 0);
      if (!Number.isFinite(depth) || depth >= MAX_EVENT_DEPTH) throw new Error("automation_event_depth_limit");
      let query = db.from("automation_rules").select("id,tenant_id,name,status,trigger_event").eq("tenant_id", event.tenant_id).eq("trigger_type", "event").eq("trigger_event", event.event_type);
      if (event.mode === "test") {
        if (!event.target_rule_id) throw new Error("test_target_rule_required");
        query = query.eq("id", event.target_rule_id).in("status", ["testing", "active"]);
      } else query = query.eq("status", "active");
      const rules = await query;
      check(rules);
      const failures: string[] = [];
      let terminalFailure = false;
      for (const rule of (rules.data ?? []) as Rule[]) {
        const idempotency = `${event.id}:${rule.id}`;
        const existing = await db.from("automation_runs").select("id,status,context,error_message,retry_count").eq("tenant_id", event.tenant_id).eq("idempotency_key", idempotency).maybeSingle();
        check(existing);
        if (existing.data?.status === "succeeded") { processed++; continue; }
        let versionQuery = db.from("automation_flow_versions").select("version_number,snapshot").eq("tenant_id", event.tenant_id).eq("rule_id", rule.id);
        versionQuery = existing.data ? versionQuery.eq("version_number", existing.data.context.flow_version) : versionQuery.eq("state", "published").order("version_number", { ascending: false }).limit(1);
        const versionResult = await versionQuery.maybeSingle();
        check(versionResult);
        if (!versionResult.data) { failures.push(`${rule.name}: published_version_missing`); terminalFailure = true; continue; }
        const version = Number(versionResult.data.version_number);
        const snapshot = versionResult.data.snapshot as { nodes?: Node[]; edges?: Edge[] };
        const nodes = (snapshot.nodes ?? []).filter(node => node.is_enabled !== false), edges = snapshot.edges ?? [];
        const triggers = nodes.filter(node => node.node_type === "trigger");
        if (triggers.length !== 1) { failures.push(`${rule.name}: invalid_trigger_count`); terminalFailure = true; continue; }
        if (nodes.length > MAX_FLOW_STEPS) { failures.push(`${rule.name}: automation_step_limit`); terminalFailure = true; continue; }
        let runId = existing.data?.id as string | undefined;
        if (!runId) {
          const insert = await db.from("automation_runs").insert({ tenant_id: event.tenant_id, rule_id: rule.id, trigger_event: event.event_type, entity_type: event.entity_type, entity_id: event.entity_id, status: "running", idempotency_key: idempotency, context: { event_id: event.id, event: event.payload, mode: event.mode, flow_version: version, execution_contract: "safe-v2" }, started_at: new Date().toISOString() }).select("id").single();
          check(insert); runId = insert.data.id;
        } else {
          check(await db.from("automation_runs").update({ status: "running", retry_count: Number(existing.data?.retry_count ?? 0) + 1, error_message: null, finished_at: null }).eq("tenant_id", event.tenant_id).eq("id", runId));
        }
        const context: Record<string, unknown> = { ...event.payload, event: event.payload, event_type: event.event_type, entity_type: event.entity_type, entity_id: event.entity_id };
        const queue = [triggers[0].id], visited = new Set<string>(), nodeMap = new Map(nodes.map(node => [node.id, node]));
        const started = Date.now();
        let runFailed: string | null = null;
        let transientFailure = false;
        while (queue.length && !runFailed) {
          if (Date.now() - started >= MAX_FLOW_DURATION_MS || visited.size >= MAX_FLOW_STEPS) { runFailed = "automation_execution_limit"; break; }
          const nodeId = queue.shift()!;
          if (visited.has(nodeId)) continue;
          visited.add(nodeId);
          const node = nodeMap.get(nodeId);
          if (!node) { runFailed = "flow_node_missing"; break; }
          const nodeStarted = Date.now();
          const log = await db.from("automation_flow_node_runs").insert({ tenant_id: event.tenant_id, run_id: runId, node_id: node.id, status: "running", input: { context: { ...context }, node_config: node.config }, started_at: new Date(nodeStarted).toISOString() }).select("id").single();
          if (log.error) { runFailed = log.error.message; transientFailure = retryable(log.error); break; }
          let branch = "default", output: Record<string, unknown> | null = null, error: string | null = null;
          let transientActionError = false;
          try { const result = await executeNode(db, node, event, runId!, context); branch = result.branch; output = result.output; } catch (cause) { error = message(cause); transientActionError = retryable(cause); }
          const update = await db.from("automation_flow_node_runs").update({ status: error ? "failed" : "succeeded", output, error_message: error, finished_at: new Date().toISOString(), duration_ms: Date.now() - nodeStarted }).eq("tenant_id", event.tenant_id).eq("id", log.data.id);
          if (error || update.error) { runFailed = `${node.label}: ${error ?? update.error?.message}`; transientFailure = transientActionError || retryable(update.error); break; }
          for (const target of nextNodes(node, edges, branch)) if (!visited.has(target)) queue.push(target);
        }
        if (Date.now() - started >= MAX_FLOW_DURATION_MS) runFailed ??= "automation_duration_limit";
        check(await db.from("automation_runs").update({ status: runFailed ? "failed" : "succeeded", result: { visited_nodes: [...visited], flow_version: version, mode: event.mode }, error_message: runFailed, finished_at: new Date().toISOString(), duration_ms: Date.now() - started }).eq("tenant_id", event.tenant_id).eq("id", runId!));
        processed++;
        if (runFailed) { failures.push(`${rule.name}: ${runFailed}`); if (!transientFailure) terminalFailure = true; }
      }
      const status = failures.length ? (!terminalFailure && event.attempts < 3 ? "queued" : "failed") : processed ? "succeeded" : "skipped", error = failures.length ? failures.join("; ").slice(0, 2000) : null;
      check(await db.rpc("finish_automation_event", { p_event_id: event.id, p_status: status, p_error: error }));
      summary.push({ event_id: event.id, status, rules: processed, ...(error ? { error } : {}) });
    } catch (error) {
      const detail = message(error);
      const terminal = /tenant_not_operational|automation_event_depth_limit|test_target_rule_required/.test(detail);
      const status = !terminal && event.attempts < 3 ? "queued" : "failed";
      check(await db.rpc("finish_automation_event", { p_event_id: event.id, p_status: status, p_error: detail }));
      summary.push({ event_id: event.id, status, rules: processed, error: detail });
    }
  }
  return summary;
}

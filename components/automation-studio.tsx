"use client";

import { DragEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bot,
  CheckCircle2,
  Clock3,
  GitBranch,
  GripVertical,
  Mail,
  MessageCircle,
  Plus,
  Save,
  Send,
  Sparkles,
  Trash2,
  UserCheck,
  Webhook,
  Workflow,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type Rule = {
  id: string;
  name: string;
  description: string | null;
  status: "draft" | "testing" | "active" | "paused" | "archived";
  trigger_type: string;
  trigger_event: string | null;
  created_at: string;
};

type FlowNode = {
  id: string;
  tenant_id: string;
  rule_id: string;
  node_key: string;
  node_type: "trigger" | "action" | "condition" | "delay" | "approval" | "ai";
  action_type: string | null;
  label: string;
  position_x: number;
  position_y: number;
  config: Record<string, unknown>;
  is_enabled: boolean;
};

type FlowEdge = {
  id: string;
  tenant_id: string;
  rule_id: string;
  source_node_id: string;
  target_node_id: string;
  source_handle: string;
  label: string | null;
  condition_config: Record<string, unknown>;
};

type FlowVersion = {
  id: string;
  version_number: number;
  state: string;
  created_at: string;
  published_at: string | null;
};

type Run = {
  id: string;
  status: string;
  trigger_event: string | null;
  created_at: string;
  duration_ms: number | null;
  error_message: string | null;
};

type PaletteItem = {
  nodeType: FlowNode["node_type"];
  actionType: string | null;
  label: string;
  icon: typeof Workflow;
};

const EVENTS = [
  ["lead_created", "Lead creado"],
  ["contact_created", "Contacto creado"],
  ["form_received", "Formulario recibido"],
  ["message_received", "Mensaje recibido"],
  ["opportunity_created", "Oportunidad creada"],
  ["stage_changed", "Cambio de etapa"],
  ["quotation_created", "Cotización creada"],
  ["quotation_sent", "Cotización enviada"],
  ["quotation_accepted", "Cotización aceptada"],
  ["quotation_expired", "Cotización vencida"],
  ["order_created", "Pedido creado"],
  ["payment_received", "Pago recibido"],
  ["payment_due", "Pago pendiente"],
  ["appointment_created", "Cita creada"],
  ["appointment_upcoming", "Cita próxima"],
  ["appointment_missed", "Cita perdida"],
  ["inventory_low", "Inventario bajo"],
  ["odoo_changed", "Cambio en Odoo"],
  ["task_overdue", "Tarea vencida"],
  ["custom_event", "Evento personalizado"],
] as const;

const PALETTE: PaletteItem[] = [
  { nodeType: "action", actionType: "send_whatsapp", label: "Enviar WhatsApp", icon: MessageCircle },
  { nodeType: "action", actionType: "send_email", label: "Enviar email", icon: Mail },
  { nodeType: "action", actionType: "create_task", label: "Crear tarea", icon: CheckCircle2 },
  { nodeType: "action", actionType: "assign_owner", label: "Asignar responsable", icon: UserCheck },
  { nodeType: "condition", actionType: "condition", label: "Condición Sí / No", icon: GitBranch },
  { nodeType: "delay", actionType: "delay", label: "Esperar", icon: Clock3 },
  { nodeType: "approval", actionType: "request_approval", label: "Aprobación humana", icon: UserCheck },
  { nodeType: "ai", actionType: "invoke_ai", label: "Agente IA", icon: Sparkles },
  { nodeType: "action", actionType: "move_stage", label: "Mover etapa", icon: Workflow },
  { nodeType: "action", actionType: "create_notification", label: "Notificar usuario", icon: Send },
  { nodeType: "action", actionType: "call_webhook", label: "Webhook / API", icon: Webhook },
  { nodeType: "action", actionType: "sync_odoo", label: "Sincronizar Odoo", icon: Activity },
  { nodeType: "action", actionType: "create_quotation", label: "Crear cotización", icon: Plus },
  { nodeType: "action", actionType: "create_order", label: "Crear pedido", icon: Plus },
  { nodeType: "action", actionType: "generate_document", label: "Generar documento", icon: Plus },
];

const NODE_W = 210;
const NODE_H = 104;

function statusLabel(status: Rule["status"]) {
  return status === "draft" ? "Borrador" : status === "testing" ? "Prueba" : status === "active" ? "Activa" : status === "paused" ? "Pausada" : "Archivada";
}

function nodeTone(type: FlowNode["node_type"]) {
  if (type === "trigger") return "var(--brand-lime)";
  if (type === "condition") return "var(--brand-violet)";
  if (type === "ai") return "var(--brand-cyan)";
  if (type === "approval") return "var(--warning)";
  if (type === "delay") return "var(--muted)";
  return "var(--brand-blue)";
}

export default function AutomationStudio({ tenantId, notice }: { tenantId: string; notice: (value: string) => void }) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [edges, setEdges] = useState<FlowEdge[]>([]);
  const [versions, setVersions] = useState<FlowVersion[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [newName, setNewName] = useState("");
  const [newEvent, setNewEvent] = useState("lead_created");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [connectFrom, setConnectFrom] = useState<{ id: string; handle: string; label: string | null } | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [inspectorLabel, setInspectorLabel] = useState("");
  const [inspectorValue, setInspectorValue] = useState("");
  const [inspectorField, setInspectorField] = useState("");
  const [inspectorOperator, setInspectorOperator] = useState("equals");
  const [inspectorCompare, setInspectorCompare] = useState("");
  const [inspectorMinutes, setInspectorMinutes] = useState("5");

  const selectedRule = useMemo(() => rules.find((r) => r.id === selectedRuleId) ?? null, [rules, selectedRuleId]);
  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedNodeId) ?? null, [nodes, selectedNodeId]);

  const loadRules = useCallback(async () => {
    const r = await supabase
      .from("automation_rules")
      .select("id,name,description,status,trigger_type,trigger_event,created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });
    if (r.error) return notice(r.error.message);
    const rows = (r.data ?? []) as Rule[];
    setRules(rows);
    setSelectedRuleId((current) => current && rows.some((x) => x.id === current) ? current : rows[0]?.id ?? null);
  }, [tenantId, notice]);

  const loadFlow = useCallback(async (ruleId: string) => {
    const [n, e, v, run] = await Promise.all([
      supabase.from("automation_flow_nodes").select("id,tenant_id,rule_id,node_key,node_type,action_type,label,position_x,position_y,config,is_enabled").eq("tenant_id", tenantId).eq("rule_id", ruleId).order("created_at"),
      supabase.from("automation_flow_edges").select("id,tenant_id,rule_id,source_node_id,target_node_id,source_handle,label,condition_config").eq("tenant_id", tenantId).eq("rule_id", ruleId).order("created_at"),
      supabase.from("automation_flow_versions").select("id,version_number,state,created_at,published_at").eq("tenant_id", tenantId).eq("rule_id", ruleId).order("version_number", { ascending: false }).limit(8),
      supabase.from("automation_runs").select("id,status,trigger_event,created_at,duration_ms,error_message").eq("tenant_id", tenantId).eq("rule_id", ruleId).order("created_at", { ascending: false }).limit(10),
    ]);
    const err = n.error ?? e.error ?? v.error ?? run.error;
    if (err) notice(err.message);
    setNodes((n.data ?? []) as FlowNode[]);
    setEdges((e.data ?? []) as FlowEdge[]);
    setVersions((v.data ?? []) as FlowVersion[]);
    setRuns((run.data ?? []) as Run[]);
  }, [tenantId, notice]);

  useEffect(() => { loadRules(); }, [loadRules]);
  useEffect(() => {
    if (selectedRuleId) loadFlow(selectedRuleId);
    else { setNodes([]); setEdges([]); setVersions([]); setRuns([]); }
    setConnectFrom(null);
    setSelectedNodeId(null);
  }, [selectedRuleId, loadFlow]);

  useEffect(() => {
    if (!selectedNode) return;
    setInspectorLabel(selectedNode.label);
    setInspectorValue(String(selectedNode.config.value ?? selectedNode.config.message ?? selectedNode.config.instruction ?? selectedNode.config.url ?? ""));
    setInspectorField(String(selectedNode.config.field ?? ""));
    setInspectorOperator(String(selectedNode.config.operator ?? "equals"));
    setInspectorCompare(String(selectedNode.config.compare ?? ""));
    setInspectorMinutes(String(selectedNode.config.minutes ?? 5));
  }, [selectedNode]);

  async function createRule(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    const r = await supabase.from("automation_rules").insert({
      tenant_id: tenantId,
      name: newName.trim(),
      status: "draft",
      trigger_type: "event",
      trigger_event: newEvent,
      trigger_config: {},
      conditions: {},
      stop_on_error: true,
    }).select("id").single();
    if (r.error) { setCreating(false); notice(r.error.message); return; }

    const ruleId = r.data.id as string;
    const triggerLabel = EVENTS.find(([key]) => key === newEvent)?.[1] ?? "Disparador";
    const node = await supabase.from("automation_flow_nodes").insert({
      tenant_id: tenantId,
      rule_id: ruleId,
      node_key: "trigger",
      node_type: "trigger",
      action_type: null,
      label: triggerLabel,
      position_x: 70,
      position_y: 220,
      config: { event: newEvent },
    });
    setCreating(false);
    if (node.error) { notice(node.error.message); return; }
    setNewName("");
    await loadRules();
    setSelectedRuleId(ruleId);
    notice("Automatización creada en borrador. Arrastra los bloques al lienzo y conéctalos.");
  }

  function paletteDragStart(e: DragEvent, item: PaletteItem) {
    e.dataTransfer.setData("application/look-social-palette", JSON.stringify(item));
    e.dataTransfer.effectAllowed = "copy";
  }

  function nodeDragStart(e: DragEvent, nodeId: string) {
    e.stopPropagation();
    e.dataTransfer.setData("application/look-social-node", nodeId);
    e.dataTransfer.effectAllowed = "move";
  }

  async function canvasDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!selectedRuleId) return;
    const bounds = e.currentTarget.getBoundingClientRect();
    const x = Math.max(16, Math.round(e.clientX - bounds.left + e.currentTarget.scrollLeft - NODE_W / 2));
    const y = Math.max(16, Math.round(e.clientY - bounds.top + e.currentTarget.scrollTop - NODE_H / 2));

    const existingNodeId = e.dataTransfer.getData("application/look-social-node");
    if (existingNodeId) {
      const previous = nodes;
      setNodes((rows) => rows.map((n) => n.id === existingNodeId ? { ...n, position_x: x, position_y: y } : n));
      const r = await supabase.from("automation_flow_nodes").update({ position_x: x, position_y: y, updated_at: new Date().toISOString() }).eq("tenant_id", tenantId).eq("rule_id", selectedRuleId).eq("id", existingNodeId);
      if (r.error) { setNodes(previous); notice(r.error.message); }
      return;
    }

    const raw = e.dataTransfer.getData("application/look-social-palette");
    if (!raw) return;
    const item = JSON.parse(raw) as PaletteItem;
    const key = `${item.nodeType}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const config = item.nodeType === "delay" ? { minutes: 5 } : {};
    const r = await supabase.from("automation_flow_nodes").insert({
      tenant_id: tenantId,
      rule_id: selectedRuleId,
      node_key: key,
      node_type: item.nodeType,
      action_type: item.actionType,
      label: item.label,
      position_x: x,
      position_y: y,
      config,
    }).select("id,tenant_id,rule_id,node_key,node_type,action_type,label,position_x,position_y,config,is_enabled").single();
    if (r.error) return notice(r.error.message);
    setNodes((rows) => [...rows, r.data as FlowNode]);
  }

  async function connectTo(targetId: string) {
    if (!selectedRuleId || !connectFrom || targetId === connectFrom.id) return;
    const r = await supabase.from("automation_flow_edges").insert({
      tenant_id: tenantId,
      rule_id: selectedRuleId,
      source_node_id: connectFrom.id,
      target_node_id: targetId,
      source_handle: connectFrom.handle,
      label: connectFrom.label,
      condition_config: {},
    }).select("id,tenant_id,rule_id,source_node_id,target_node_id,source_handle,label,condition_config").single();
    if (r.error) { notice(r.error.message); return; }
    setEdges((rows) => [...rows, r.data as FlowEdge]);
    setConnectFrom(null);
  }

  async function deleteNode(nodeId: string) {
    if (!selectedRuleId) return;
    const node = nodes.find((n) => n.id === nodeId);
    if (node?.node_type === "trigger") return notice("El disparador principal no se elimina. Cambia el evento desde una nueva automatización.");
    const r = await supabase.from("automation_flow_nodes").delete().eq("tenant_id", tenantId).eq("rule_id", selectedRuleId).eq("id", nodeId);
    if (r.error) return notice(r.error.message);
    setNodes((rows) => rows.filter((n) => n.id !== nodeId));
    setEdges((rows) => rows.filter((e) => e.source_node_id !== nodeId && e.target_node_id !== nodeId));
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
  }

  async function deleteEdge(edgeId: string) {
    if (!selectedRuleId) return;
    const r = await supabase.from("automation_flow_edges").delete().eq("tenant_id", tenantId).eq("rule_id", selectedRuleId).eq("id", edgeId);
    if (r.error) return notice(r.error.message);
    setEdges((rows) => rows.filter((edge) => edge.id !== edgeId));
  }

  async function saveNode(e: FormEvent) {
    e.preventDefault();
    if (!selectedRuleId || !selectedNode) return;
    const config: Record<string, unknown> = { ...selectedNode.config };
    if (selectedNode.node_type === "condition") {
      config.field = inspectorField.trim();
      config.operator = inspectorOperator;
      config.compare = inspectorCompare;
    } else if (selectedNode.node_type === "delay") {
      config.minutes = Math.max(1, Number(inspectorMinutes) || 1);
    } else if (selectedNode.action_type === "call_webhook") {
      config.url = inspectorValue.trim();
    } else if (selectedNode.node_type === "ai") {
      config.instruction = inspectorValue.trim();
    } else {
      config.value = inspectorValue;
      if (["send_whatsapp", "send_email"].includes(selectedNode.action_type ?? "")) config.message = inspectorValue;
    }

    const r = await supabase.from("automation_flow_nodes").update({
      label: inspectorLabel.trim() || selectedNode.label,
      config,
      updated_at: new Date().toISOString(),
    }).eq("tenant_id", tenantId).eq("rule_id", selectedRuleId).eq("id", selectedNode.id)
      .select("id,tenant_id,rule_id,node_key,node_type,action_type,label,position_x,position_y,config,is_enabled").single();
    if (r.error) return notice(r.error.message);
    setNodes((rows) => rows.map((n) => n.id === selectedNode.id ? r.data as FlowNode : n));
    notice("Bloque actualizado.");
  }

  async function saveVersion(publishForTesting: boolean) {
    if (!selectedRuleId) return;
    setBusy(true);
    const r = await supabase.rpc("save_automation_flow_version", { p_rule_id: selectedRuleId, p_publish: publishForTesting });
    setBusy(false);
    if (r.error) return notice(r.error.message);
    await Promise.all([loadFlow(selectedRuleId), loadRules()]);
    notice(publishForTesting ? "Versión validada y enviada a estado PRUEBA. Aún no está activa para ejecutar acciones externas." : "Versión de borrador guardada.");
  }

  async function changeRuleStatus(status: "draft" | "paused" | "archived") {
    if (!selectedRuleId) return;
    const r = await supabase.from("automation_rules").update({ status }).eq("tenant_id", tenantId).eq("id", selectedRuleId);
    if (r.error) return notice(r.error.message);
    await loadRules();
    notice(`Automatización: ${statusLabel(status)}.`);
  }

  const nodeMap = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  return <div className="stack gap-16">
    <section className="grid two-col">
      <div className="card">
        <div className="eyebrow">Automation Studio</div>
        <h2>Automatizaciones visuales</h2>
        <p className="muted">Cada flujo pertenece exclusivamente a este negocio. Arrastra bloques al lienzo, conéctalos y guarda versiones antes de activarlos.</p>
        <form className="stack gap-12" onSubmit={createRule}>
          <label>Nombre<input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ej. Seguimiento de lead nuevo" required /></label>
          <label>Disparador<select value={newEvent} onChange={(e) => setNewEvent(e.target.value)}>{EVENTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <button className="button primary" disabled={creating}>{creating ? "Creando…" : <><Plus size={15}/> Nueva automatización</>}</button>
        </form>
      </div>
      <div className="card">
        <h2>Flujos de este workspace</h2>
        <div className="stack gap-8">
          {rules.map((rule) => <button key={rule.id} type="button" className="priority-item" style={{ textAlign: "left", width: "100%", cursor: "pointer", borderColor: rule.id === selectedRuleId ? "var(--brand-blue)" : undefined }} onClick={() => setSelectedRuleId(rule.id)}>
            <div><strong>{rule.name}</strong><div className="muted">{EVENTS.find(([key]) => key === rule.trigger_event)?.[1] ?? rule.trigger_event ?? rule.trigger_type}</div></div>
            <span className={`pill ${rule.status === "active" ? "good" : rule.status === "testing" ? "warn" : ""}`}>{statusLabel(rule.status)}</span>
          </button>)}
          {rules.length === 0 && <div className="empty"><strong>Sin automatizaciones</strong><div>Crea el primer flujo visual de este cliente.</div></div>}
        </div>
      </div>
    </section>

    {selectedRule && <section className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: 16, borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div><div className="eyebrow">Editando · {statusLabel(selectedRule.status)}</div><h2 style={{ margin: "4px 0 0" }}>{selectedRule.name}</h2></div>
        <div className="top-actions">
          <button className="button" disabled={busy} onClick={() => saveVersion(false)}><Save size={14}/> Guardar versión</button>
          <button className="button primary" disabled={busy} onClick={() => saveVersion(true)}><Bot size={14}/> Validar para prueba</button>
          {selectedRule.status === "testing" && <button className="button" onClick={() => changeRuleStatus("paused")}>Pausar</button>}
          {selectedRule.status !== "archived" && <button className="button danger" onClick={() => changeRuleStatus("archived")}>Archivar</button>}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "220px minmax(700px,1fr) 300px", minHeight: 680 }}>
        <aside style={{ borderRight: "1px solid var(--border)", padding: 12, background: "var(--panel2)" }}>
          <strong style={{ fontSize: 13 }}>Bloques</strong>
          <p className="muted" style={{ fontSize: 12 }}>Arrastra un bloque al lienzo.</p>
          <div className="stack gap-8">
            {PALETTE.map((item) => {
              const Icon = item.icon;
              return <div key={`${item.nodeType}-${item.actionType}`} draggable onDragStart={(e) => paletteDragStart(e, item)} className="button" style={{ justifyContent: "flex-start", cursor: "grab", fontSize: 12 }}><GripVertical size={13}/><Icon size={14}/>{item.label}</div>;
            })}
          </div>
        </aside>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={canvasDrop}
          style={{ position: "relative", overflow: "auto", minHeight: 680, backgroundImage: "radial-gradient(circle,var(--border) 1px,transparent 1px)", backgroundSize: "22px 22px", backgroundColor: "var(--bg)" }}
        >
          <div style={{ position: "relative", width: 1500, height: 950 }}>
            <svg width="1500" height="950" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
              {edges.map((edge) => {
                const source = nodeMap.get(edge.source_node_id);
                const target = nodeMap.get(edge.target_node_id);
                if (!source || !target) return null;
                const x1 = source.position_x + NODE_W;
                const y1 = source.position_y + NODE_H / 2;
                const x2 = target.position_x;
                const y2 = target.position_y + NODE_H / 2;
                const mid = Math.max(50, Math.abs(x2 - x1) * .45);
                return <g key={edge.id}>
                  <path d={`M ${x1} ${y1} C ${x1 + mid} ${y1}, ${x2 - mid} ${y2}, ${x2} ${y2}`} fill="none" stroke={edge.source_handle === "no" ? "var(--danger)" : edge.source_handle === "yes" ? "var(--success)" : "var(--brand-cyan)"} strokeWidth="2.5" />
                  <circle cx={x2} cy={y2} r="4" fill="var(--brand-blue)" />
                </g>;
              })}
            </svg>

            {nodes.map((node) => <article
              key={node.id}
              draggable
              onDragStart={(e) => nodeDragStart(e, node.id)}
              onClick={() => connectFrom ? connectTo(node.id) : setSelectedNodeId(node.id)}
              style={{
                position: "absolute",
                left: node.position_x,
                top: node.position_y,
                width: NODE_W,
                minHeight: NODE_H,
                background: "var(--panel)",
                border: `1px solid ${selectedNodeId === node.id ? "var(--brand-blue)" : "var(--border)"}`,
                borderLeft: `5px solid ${nodeTone(node.node_type)}`,
                borderRadius: 14,
                padding: 12,
                boxShadow: "var(--shadow)",
                cursor: connectFrom ? "crosshair" : "grab",
                zIndex: 2,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                <div><span className="pill" style={{ marginBottom: 6 }}>{node.node_type}</span><strong style={{ display: "block", fontSize: 13 }}>{node.label}</strong></div>
                {node.node_type !== "trigger" && <button type="button" title="Eliminar bloque" onClick={(e) => { e.stopPropagation(); deleteNode(node.id); }} style={{ border: 0, background: "none", color: "var(--muted)", padding: 2 }}><Trash2 size={14}/></button>}
              </div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 10 }}>
                {node.node_type === "condition" ? <>
                  <button type="button" className="button small" onClick={(e) => { e.stopPropagation(); setConnectFrom({ id: node.id, handle: "yes", label: "Sí" }); }}>Sí →</button>
                  <button type="button" className="button small danger" onClick={(e) => { e.stopPropagation(); setConnectFrom({ id: node.id, handle: "no", label: "No" }); }}>No →</button>
                </> : <button type="button" className="button small" onClick={(e) => { e.stopPropagation(); setConnectFrom({ id: node.id, handle: "default", label: null }); }}>Conectar →</button>}
              </div>
            </article>)}

            {nodes.length === 1 && <div className="empty" style={{ position: "absolute", left: 360, top: 180, width: 360 }}><strong>Arrastra tu primer bloque</strong><div>Después pulsa “Conectar” en el disparador y selecciona el bloque destino.</div></div>}
          </div>
        </div>

        <aside style={{ borderLeft: "1px solid var(--border)", padding: 14, background: "var(--panel2)", overflow: "auto" }}>
          {connectFrom && <div className="notice" style={{ marginBottom: 12 }}><strong>Conectando…</strong><div>Haz clic sobre el bloque destino.</div><button className="text-button" type="button" onClick={() => setConnectFrom(null)}><X size={13}/> Cancelar</button></div>}
          {selectedNode ? <form className="stack gap-12" onSubmit={saveNode}>
            <div><div className="eyebrow">Inspector</div><h3 style={{ margin: "4px 0" }}>{selectedNode.label}</h3><div className="muted">{selectedNode.action_type ?? selectedNode.node_type}</div></div>
            <label>Nombre del bloque<input value={inspectorLabel} onChange={(e) => setInspectorLabel(e.target.value)} /></label>
            {selectedNode.node_type === "condition" ? <>
              <label>Campo<input value={inspectorField} onChange={(e) => setInspectorField(e.target.value)} placeholder="Ej. lead_score" /></label>
              <label>Operador<select value={inspectorOperator} onChange={(e) => setInspectorOperator(e.target.value)}><option value="equals">Es igual a</option><option value="not_equals">No es igual</option><option value="contains">Contiene</option><option value="gt">Mayor que</option><option value="gte">Mayor o igual</option><option value="lt">Menor que</option><option value="exists">Existe</option></select></label>
              <label>Valor<input value={inspectorCompare} onChange={(e) => setInspectorCompare(e.target.value)} /></label>
            </> : selectedNode.node_type === "delay" ? <label>Esperar (minutos)<input type="number" min={1} max={525600} value={inspectorMinutes} onChange={(e) => setInspectorMinutes(e.target.value)} /></label> : selectedNode.node_type !== "trigger" && <label>{selectedNode.action_type === "call_webhook" ? "URL" : selectedNode.node_type === "ai" ? "Instrucción de IA" : "Mensaje / valor"}<textarea value={inspectorValue} onChange={(e) => setInspectorValue(e.target.value)} placeholder={selectedNode.action_type === "send_whatsapp" ? "Hola {{contact.first_name}}…" : "Configura este bloque"} /></label>}
            <button className="button primary"><Save size={14}/> Guardar bloque</button>
          </form> : <div><div className="eyebrow">Inspector</div><h3>Selecciona un bloque</h3><p className="muted">Haz clic en un bloque para editar su nombre y configuración sin tocar código.</p></div>}

          <div style={{ borderTop: "1px solid var(--border)", marginTop: 18, paddingTop: 14 }}>
            <strong style={{ fontSize: 13 }}>Conexiones</strong>
            <div className="stack gap-8" style={{ marginTop: 8 }}>{edges.map((edge) => <div className="priority-item" key={edge.id}><div><strong>{nodeMap.get(edge.source_node_id)?.label ?? "?"} → {nodeMap.get(edge.target_node_id)?.label ?? "?"}</strong><div className="muted">{edge.label ?? "flujo"}</div></div><button type="button" onClick={() => deleteEdge(edge.id)} style={{ border: 0, background: "none", color: "var(--danger)" }}><Trash2 size={13}/></button></div>)}{edges.length === 0 && <span className="muted" style={{ fontSize: 12 }}>Sin conexiones.</span>}</div>
          </div>
        </aside>
      </div>
    </section>}

    {selectedRule && <section className="grid two-col">
      <div className="card">
        <h2>Versiones</h2>
        <p className="muted">Una versión “publicada” se mantiene en PRUEBA hasta que el motor de ejecución haya sido validado. No se enviarán mensajes externos solo por versionarla.</p>
        <div className="stack gap-8">{versions.map((v) => <div className="priority-item" key={v.id}><strong>v{v.version_number}</strong><span className={`pill ${v.state === "published" ? "warn" : ""}`}>{v.state}</span></div>)}{versions.length === 0 && <span className="muted">Aún no hay versiones guardadas.</span>}</div>
      </div>
      <div className="card">
        <h2>Historial de ejecuciones</h2>
        <div className="stack gap-8">{runs.map((run) => <div className="priority-item" key={run.id}><div><strong>{run.status}</strong><div className="muted">{run.trigger_event ?? "manual"} · {new Date(run.created_at).toLocaleString("es-DO")}</div>{run.error_message && <div className="muted">{run.error_message}</div>}</div><span>{run.duration_ms == null ? "—" : `${run.duration_ms} ms`}</span></div>)}{runs.length === 0 && <span className="muted">Todavía no existen ejecuciones reales para este flujo.</span>}</div>
      </div>
    </section>}
  </div>;
}

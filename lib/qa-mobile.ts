/**
 * Issue #69: registro local de QA. No consulta APIs ni contiene datos de clientes.
 * Los resultados de fixtures JAMÁS aprueban un criterio de salida real.
 */
export type QAScope = "fixture" | "staging" | "integracion";
export type QAStatus = "pendiente" | "bloqueada" | "fallida" | "aprobada";
export type QACase = {
  id: string; group: string; title: string; objective: string;
  scope: QAScope; suite?: string; path?: string;
};
export type QARecord = {
  status: QAStatus; operator: string; device: string; commitSha: string;
  observation: string; evidenceUrl: string; checkedAt: string;
};
export type QAReport = {
  schemaVersion: 1; issue: 69; mode: "fixture-only";
  generatedAt: string; records: Record<string, QARecord>;
};

export const QA_CASES: readonly QACase[] = [
  { id: "QA-01", group: "Tenants", title: "Selección explícita A/B", objective: "Comprobar cambio de contexto, borradores descartados y ausencia de datos del tenant anterior.", scope: "fixture", suite: "tests/tenant-context-browser.test.mjs", path: "/crm/companies" },
  { id: "QA-02", group: "Android", title: "Empresas y contactos", objective: "Alta, edición y asociación en 390 × 844; sin scroll horizontal.", scope: "fixture", suite: "tests/commercial-mobile-browser.test.mjs", path: "/crm/contacts" },
  { id: "QA-03", group: "Android", title: "Oportunidades", objective: "Creación, asociación y cambio de etapa con API simulada.", scope: "fixture", suite: "tests/commercial-mobile-browser.test.mjs", path: "/crm/revenue" },
  { id: "QA-04", group: "Android", title: "Conversaciones", objective: "Lista, lectura, cambio de estado y retorno en vista móvil, sin enviar mensajes.", scope: "fixture", suite: "tests/commercial-mobile-browser.test.mjs", path: "/crm/inbox" },
  { id: "QA-05", group: "RBAC", title: "Bloqueo de módulo no autorizado", objective: "Comprobar que el alias /crm/sales no eluda el permiso del pipeline.", scope: "fixture", suite: "tests/tenant-context-browser.test.mjs", path: "/crm/sales" },
  { id: "QA-06", group: "Accesos reales", title: "Propietario y cliente con cuentas separadas", objective: "Sesiones reales, credenciales distintas y cierre de sesión desde Android.", scope: "staging", path: "/login" },
  { id: "QA-07", group: "RBAC real", title: "Roles A/B y acceso denegado", objective: "Negar acciones y vistas desde servidor para miembros de otros tenants; comprobar cambios de rol.", scope: "staging" },
  { id: "QA-08", group: "RLS real", title: "CRUD y aislamiento entre tenants", objective: "Probar SELECT/INSERT/UPDATE/DELETE con datos QA en dos tenants ficticios de una BD aislada.", scope: "staging" },
  { id: "QA-09", group: "Recorrido real", title: "Cotización y pedido en Android", objective: "Verificar flujo completo con persistencia real, PDF y aprobación sin afectar clientes.", scope: "staging", path: "/crm" },
  { id: "QA-10", group: "Publicación", title: "CI, rendimiento y SHA desplegado", objective: "Guardar enlace de CI, mediciones móviles básicas y coincidencia exacta entre commit y build del staging.", scope: "staging" },
  { id: "QA-11", group: "Facturación", title: "Suscripción activa ≠ pago recibido", objective: "Exigir transacción/factura confirmada antes de mostrar cobro; sin usar dinero real.", scope: "staging" },
  { id: "QA-12", group: "Integraciones", title: "Meta OAuth real", objective: "Solo si hay autorización oficial y cuenta de prueba aislada; registrar callback, permisos y fallo.", scope: "integracion" },
  { id: "QA-13", group: "Integraciones", title: "Odoo real", objective: "Solo con servidor y credenciales QA propios; nunca reutilizar conexiones de clientes.", scope: "integracion" },
  { id: "QA-14", group: "Integraciones", title: "Pasarela en sandbox", objective: "Solo con credenciales sandbox y evento verificado; nunca activar pagos reales.", scope: "integracion" },
  { id: "QA-15", group: "Revisión", title: "PR #18 y duplicaciones", objective: "Inspeccionar conflictos y solapamientos; no fusionar sin aprobación y regresiones.", scope: "staging" },
];

export const EMPTY_QA_RECORD: QARecord = {
  status: "pendiente", operator: "", device: "Android 390×844",
  commitSha: "", observation: "", evidenceUrl: "", checkedAt: ""
};

export function validateQARecord(testCase: QACase, record: QARecord): string | null {
  if (!["pendiente", "bloqueada", "fallida", "aprobada"].includes(record.status)) return "Estado inválido.";
  if (record.status === "pendiente") return null;
  if (record.observation.trim().length < 12) return "Describe el resultado o bloqueo (mínimo 12 caracteres).";
  if (record.status !== "aprobada") return null;
  // El centro no está conectado a una BD aislada. Nada real puede marcarse aprobado.
  if (testCase.scope !== "fixture") return "Sin staging verificado: no se permite aprobar pruebas reales ni integraciones.";
  if (record.operator.trim().length < 2) return "Indica quién ejecutó la prueba.";
  if (record.device.trim().length < 3) return "Indica el dispositivo o viewport.";
  if (!/^[a-f0-9]{7,40}$/i.test(record.commitSha.trim())) return "Indica el SHA Git real (7–40 caracteres hexadecimales).";
  try {
    const url = new URL(record.evidenceUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw Error("unsafe");
  } catch {
    return "Enlace HTTPS de evidencia obligatorio, sin credenciales, parámetros ni fragmentos.";
  }
  return null;
}

export function parseQAReport(data: unknown): Record<string, QARecord> {
  if (!data || typeof data !== "object") throw Error("Informe no válido.");
  const report = data as Partial<QAReport>;
  if (report.schemaVersion !== 1 || report.issue !== 69 || report.mode !== "fixture-only" ||
      !report.records || typeof report.records !== "object" || Array.isArray(report.records))
    throw Error("Formato o ámbito del informe incompatible.");
  const result: Record<string, QARecord> = {};
  for (const [id, candidate] of Object.entries(report.records)) {
    const testCase = QA_CASES.find(test => test.id === id);
    if (!testCase || !candidate || typeof candidate !== "object") continue;
    const raw = candidate as Partial<QARecord>;
    const clean: QARecord = {
      status: raw.status ?? "pendiente",
      operator: String(raw.operator ?? "").slice(0, 100),
      device: String(raw.device ?? "").slice(0, 100),
      commitSha: String(raw.commitSha ?? "").slice(0, 40),
      observation: String(raw.observation ?? "").slice(0, 2000),
      evidenceUrl: String(raw.evidenceUrl ?? "").slice(0, 500),
      checkedAt: String(raw.checkedAt ?? "").slice(0, 50)
    };
    const error = validateQARecord(testCase, clean);
    if (error) throw Error(id + ": " + error);
    result[id] = clean;
  }
  return result;
}

export function qaSummary(records: Record<string, QARecord>) {
  const approvedFixture = QA_CASES.filter(item =>
    item.scope === "fixture" && records[item.id]?.status === "aprobada" &&
    !validateQARecord(item, records[item.id])
  ).length;
  const blocked = QA_CASES.filter(item => records[item.id]?.status === "bloqueada").length;
  const failed = QA_CASES.filter(item => records[item.id]?.status === "fallida").length;
  const realPending = QA_CASES.filter(item => item.scope !== "fixture").length;
  return { total: QA_CASES.length, approvedFixture, blocked, failed, realPending, releaseReady: false as const };
}

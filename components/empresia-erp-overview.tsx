"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Boxes, Cable, ShieldCheck, FileText, Clock3 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useActiveTenant } from "@/components/tenant-context";

type ErpStatus = {
  provider: string;
  status: string;
  sync_direction: string;
  last_healthcheck_at: string | null;
  inventory_synced_at: string | null;
};

function safeDate(value: string | null): string {
  if (!value) return "Sin verificación";
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? "Sin verificación"
    : date.toLocaleString("es-DO", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Empresia has exactly one brand; Dolibarr will supply its ERP engine.
 * This is a read-only integration readiness surface, NOT a deployed ERP.
 * Legacy Odoo connections are explicitly not treated as Dolibarr connections.
 */
export default function EmpresiaErpOverview() {
  const tenant = useActiveTenant();
  const tenantId = tenant?.tenant_id ?? null;
  const allowed = tenant?.tenant_slug === "eurevector" &&
    ["owner", "admin"].includes(tenant.membership_role);
  const [record, setRecord] = useState<ErpStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    setRecord(null);
    setError("");
    setLoading(true);
    if (!allowed || !tenantId) {
      setLoading(false);
      return () => { live = false; };
    }
    void (async () => {
      const { data, error: queryError } = await supabase.from("tenant_erp_status")
        .select("provider,status,sync_direction,last_healthcheck_at,inventory_synced_at")
        .eq("tenant_id", tenantId).maybeSingle();
      if (!live) return;
      if (queryError) setError("No se pudo comprobar la configuración ERP de esta empresa.");
      else setRecord((data ?? null) as ErpStatus | null);
      setLoading(false);
    })().catch(() => {
      if (live) {
        setError("No se pudo consultar el estado ERP.");
        setLoading(false);
      }
    });
    return () => { live = false; };
  }, [tenantId, allowed]);

  // The permission gate independently checks server-supplied membership and module access.
  if (!allowed) return <div className="notice" role="alert">
    ERP: acceso reservado a la administración de Empresia.
  </div>;

  const existingProvider = record?.provider?.toLowerCase() ?? null;
  const legacyOdoo = existingProvider === "odoo";
  const dolibarr = existingProvider === "dolibarr";
  const configuredConnection = Boolean(record);
  const statusLabel = !configuredConnection ? "Sin conexión"
    : dolibarr ? "Configuración detectada; pruebas pendientes"
    : legacyOdoo ? "Conexión Odoo heredada"
    : "Conexión de otro proveedor";

  return <div className="stack gap-16" style={{ maxWidth: 1120, margin: "0 auto" }}>
    <header className="topbar">
      <div>
        <div className="eyebrow">Empresia · Plataforma principal</div>
        <h2>Estado del módulo ERP</h2>
        <p className="muted">Operaciones empresariales dentro de Empresia. El motor Dolibarr todavía no está integrado ni validado en producción.</p>
      </div>
      <Link className="button" href="/crm"><Boxes size={16}/> Volver al CRM</Link>
    </header>
    {error && <div className="notice" role="alert">{error}</div>}
    <div className="grid two-col">
      <section className="card" aria-labelledby="erp-connection-title">
        <div className="eyebrow"><Cable size={16} style={{ verticalAlign: "middle", marginRight: 6 }}/> Integración</div>
        <h2 id="erp-connection-title">{loading ? "Consultando estado…" : statusLabel}</h2>
        <p className="muted">Dolibarr será el motor ERP de Empresia, no una marca comercial ni un CRM paralelo. Un repositorio o una configuración de servidor no prueban una conexión activa.</p>
        <div className="priority-list" style={{ marginTop: 16 }}>
          <div className="priority-item"><strong>Motor previsto</strong><span>Dolibarr</span></div>
          <div className="priority-item"><strong>Integración operativa</strong><span>Sin verificar</span></div>
          <div className="priority-item"><strong>Última comprobación registrada</strong><span>{safeDate(record?.last_healthcheck_at ?? null)}</span></div>
          {legacyOdoo && <div className="priority-item"><strong>Integración histórica</strong><span>Odoo, no Dolibarr</span></div>}
        </div>
        <p className="muted" style={{ marginTop: 14 }}>
          {legacyOdoo
            ? "El conector Odoo existente debe permanecer aislado. No migraremos credenciales ni movimientos a Dolibarr automáticamente."
            : "Todavía no se han verificado credenciales, aislamiento de empresas, sincronización de inventario ni emisión de facturas mediante Dolibarr."}
        </p>
      </section>
      <section className="card" aria-labelledby="erp-readiness-title">
        <div className="eyebrow"><ShieldCheck size={16} style={{ verticalAlign: "middle", marginRight: 6 }}/> Preparación técnica</div>
        <h2 id="erp-readiness-title">Antes de activar ERP</h2>
        <div className="priority-list">
          <div className="priority-item"><strong>Instancia de Dolibarr con HTTPS</strong><span>Pendiente de validar</span></div>
          <div className="priority-item"><strong>Acceso por empresa y permisos</strong><span>Pendiente de validar</span></div>
          <div className="priority-item"><strong>Productos e inventario</strong><span>Sin sincronizar</span></div>
          <div className="priority-item"><strong>Cotizaciones y facturas</strong><span>Sin conciliación ERP</span></div>
          <div className="priority-item"><strong>Facturación electrónica DGII</strong><span>No certificada</span></div>
        </div>
        <p className="muted" style={{ marginTop: 14 }}>Ningún dato, documento ni importe se presenta como sincronizado sin una comprobación real por empresa.</p>
      </section>
    </div>
    <section className="section-gap card">
      <div className="eyebrow"><FileText size={16} style={{ verticalAlign: "middle", marginRight: 6 }}/> Una plataforma, varios módulos</div>
      <h2>Flujo previsto</h2>
      <p>El CRM mantiene clientes y oportunidades; el ARM prepara propuestas y aprobaciones; ERP administrará compras, inventario y facturación cuando el motor esté conectado. No se automatizarán cobros ni se publicarán facturas sin autorización y conciliación verificables.</p>
      <div className="top-actions" style={{ marginTop: 16 }}>
        <Link href="/crm/integrations" className="button"><Cable size={15}/> Centro de integraciones</Link>
        <Link href="/crm/quotations" className="button"><FileText size={15}/> Cotizaciones del CRM</Link>
      </div>
      <p className="muted" style={{ marginTop: 12, fontSize: 12 }}><Clock3 size={13} style={{ verticalAlign: "middle", marginRight: 5 }}/>Esta pantalla muestra el progreso de integración; no es una demostración simulada de Dolibarr.</p>
    </section>
  </div>;
}

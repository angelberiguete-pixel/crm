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
  const [bridgeStatus,setBridgeStatus] = useState<"unknown" | "not_configured" | "ready_for_probe" | "connected_read_only">("unknown");
  const [probing,setProbing] = useState(false);
  const [loadingProducts,setLoadingProducts] = useState(false);
  const [products,setProducts] = useState<Array<{id:string;ref:string;label:string;price:number|null}>>([]);
  const [verifiedAt,setVerifiedAt] = useState<string|null>(null);

  useEffect(() => {
    let live = true;
    setRecord(null);
    setProducts([]);
    setVerifiedAt(null);
    setBridgeStatus("unknown");
    setError("");
    setLoading(true);
    if (!allowed || !tenantId) {
      setLoading(false);
      return () => { live = false; };
    }
    void (async () => {
      const [dolibarr,legacy,bridge] = await Promise.all([
        supabase.from("tenant_dolibarr_status")
          .select("provider,status,sync_direction,last_healthcheck_at")
          .eq("tenant_id", tenantId).maybeSingle(),
        supabase.from("tenant_erp_status")
          .select("provider,status,sync_direction,last_healthcheck_at,inventory_synced_at")
          .eq("tenant_id", tenantId).maybeSingle(),
        supabase.functions.invoke("empresia-dolibarr",{
          body:{action:"status",tenant_id:tenantId}
        })
      ]);
      if (!live) return;
      if (dolibarr.error || legacy.error)
        setError("No se pudo comprobar la configuración ERP de esta empresa.");
      else
        setRecord((dolibarr.data??legacy.data??null) as ErpStatus|null);
      if (!bridge.error && bridge.data?.status === "ready_for_probe")
        setBridgeStatus("ready_for_probe");
      else setBridgeStatus("not_configured");
      setLoading(false);
    })().catch(() => {
      if (live) {
        setError("No se pudo consultar el estado ERP.");
        setLoading(false);
      }
    });
    return () => { live = false; };
  }, [tenantId, allowed]);

  async function probeServer() {
    if(!allowed || !tenantId || probing || bridgeStatus==="not_configured")return;
    setProbing(true);setError("");setProducts([]);
    try {
      const {data,error:callError} = await supabase.functions.invoke("empresia-dolibarr",{
        body:{action:"probe",tenant_id:tenantId}
      });
      if(callError || data?.status!=="connected_read_only"){
        setBridgeStatus("ready_for_probe");
        setVerifiedAt(null);
        setError("No se pudo verificar la API de productos de Dolibarr. Revisa permisos, certificado HTTPS y servicio REST.");
      }else{
        setBridgeStatus("connected_read_only");
        setVerifiedAt(typeof data.checked_at==="string"?data.checked_at:null);
      }
    }catch{setError("Error al verificar la conexión ERP.");setVerifiedAt(null);}
    finally{setProbing(false);}
  }
  async function loadProducts(){
    if(!allowed || !tenantId || bridgeStatus!=="connected_read_only" || loadingProducts)return;
    setLoadingProducts(true);setError("");
    try {
      const {data,error:callError}=await supabase.functions.invoke("empresia-dolibarr",{
        body:{action:"products",tenant_id:tenantId,limit:10,page:0}
      });
      if(callError || data?.status!=="connected_read_only" || !Array.isArray(data.products)){
        setError("No se pudo leer el catálogo ERP.");setProducts([]);
      }else setProducts(data.products);
    }catch{setError("No se pudo consultar el catálogo de Dolibarr.");setProducts([]);}
    finally{setLoadingProducts(false);}
  }

  // The permission gate independently checks server-supplied membership and module access.
  if (!allowed) return <div className="notice" role="alert">
    ERP: acceso reservado a la administración de Empresia.
  </div>;

  const existingProvider = record?.provider?.toLowerCase() ?? null;
  const legacyOdoo = existingProvider === "odoo";
  const dolibarr = existingProvider === "dolibarr";
  const configuredConnection = Boolean(record);
  const statusLabel = bridgeStatus==="connected_read_only"
    ? "API Dolibarr verificada (solo lectura)"
    : bridgeStatus==="ready_for_probe"
    ? "API configurada; falta verificación"
    : !configuredConnection ? "Sin conexión"
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
        <p className="muted">Dolibarr será el motor ERP de Empresia, no una marca comercial ni un CRM paralelo. Se verifica la conexión leyendo la API REST desde Supabase, sin enviar claves al navegador.</p>
        <div className="top-actions" style={{marginTop:12}}>
          <button type="button" className="button primary" onClick={()=>void probeServer()} disabled={bridgeStatus==="unknown"||bridgeStatus==="not_configured"||probing}>
            {probing?"Verificando…":"Probar conexión Dolibarr"}
          </button>
          <button type="button" className="button" onClick={()=>void loadProducts()} disabled={bridgeStatus!=="connected_read_only"||loadingProducts}>
            {loadingProducts?"Consultando…":"Consultar 10 productos"}
          </button>
        </div>
        {bridgeStatus==="not_configured"&&<p className="muted" role="status">Sin servidor Dolibarr autorizado para el CRM. Se requieren URL HTTPS, clave privada de API y activación de solo lectura.</p>}
        {verifiedAt&&<p className="muted" role="status">API verificada el {safeDate(verifiedAt)}. No se sincronizaron ni escribieron productos.</p>}
        {products.length>0&&<div className="table-wrap" style={{marginTop:16}}>
          <table className="data-table"><thead><tr><th>Referencia</th><th>Producto</th><th>Precio de lectura</th></tr></thead>
            <tbody>{products.map(product=><tr key={product.id}>
              <td>{product.ref}</td><td>{product.label}</td>
              <td>{product.price===null?"No disponible":String(product.price)}</td>
            </tr>)}</tbody>
          </table>
        </div>}
        <div className="priority-list" style={{ marginTop: 16 }}>
          <div className="priority-item"><strong>Motor previsto</strong><span>Dolibarr</span></div>
          <div className="priority-item"><strong>Integración operativa</strong><span>{bridgeStatus==="connected_read_only"?"API de productos verificada (lectura)":"Sin verificar"}</span></div>
          <div className="priority-item"><strong>Última comprobación registrada</strong><span>{safeDate(record?.last_healthcheck_at ?? null)}</span></div>
          {legacyOdoo && <div className="priority-item"><strong>Integración histórica</strong><span>Odoo, no Dolibarr</span></div>}
        </div>
        <p className="muted" style={{ marginTop: 14 }}>
          {legacyOdoo
            ? "El conector Odoo existente debe permanecer aislado. No migraremos credenciales ni movimientos a Dolibarr automáticamente."
            : "Aunque la API de lectura responda, el aislamiento multiempresa, la sincronización de inventario y la emisión de facturas deben validarse por separado."}
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

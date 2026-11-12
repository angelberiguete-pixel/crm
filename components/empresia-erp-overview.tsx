"use client";

import Link from "next/link";
import { Boxes, FileText, ShoppingCart } from "lucide-react";
import { useActiveTenant } from "@/components/tenant-context";
import styles from "./erp-native-inventory.module.css";
import FamilyPowerErpControl from "@/components/family-power-erp-control";

export default function EmpresiaErpOverview() {
  const tenant = useActiveTenant();
  if (!tenant) return <div className="notice" role="alert">Selecciona una empresa para abrir el ERP.</div>;
  if (tenant.tenant_slug === "family-power") return <FamilyPowerErpControl />;
  return <div className="stack gap-16">
    <header><div className="eyebrow">Empresia · Plataforma principal</div><h2>ERP · {tenant.tenant_name}</h2><p className="muted">Inventario y ventas dentro de la misma sesión de tu empresa.</p></header>
    <section className={styles.links} aria-label="Módulos ERP">
      <Link className="card" href="/crm/inventory"><Boxes size={26} aria-hidden="true" /><h3>Inventario</h3><p>Artículos, almacenes, reservas, transferencias y movimientos.</p><span className="button">Abrir inventario</span></Link>
      <Link className="card" href="/crm/quotations"><FileText size={26} aria-hidden="true" /><h3>Cotizaciones</h3><p>Propuestas comerciales para revisión y aprobación del cliente.</p><span className="button">Ver cotizaciones</span></Link>
      <Link className="card" href="/crm/operations"><ShoppingCart size={26} aria-hidden="true" /><h3>Pedidos y facturas</h3><p>Reservas, producción, entregas, facturas comerciales y cobros parciales.</p><span className="button">Abrir operaciones</span></Link>
    </section>
    <section className="card"><h2>Control de las operaciones</h2><p>El inventario nativo requiere habilitar las migraciones verificadas. Cada operación autorizada conserva su historial y se confirma de forma transaccional.</p><p className="muted">Las facturas comerciales y los cobros de tu negocio se administran por separado de la suscripción de Empresia. Los comprobantes fiscales electrónicos de la DGII requieren configuración y autorización fiscal antes de emitirse.</p><Link className="button" href="/crm/operations">Producción, facturas y entregas</Link></section>
  </div>;
}

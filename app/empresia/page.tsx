import type { Metadata } from "next";
import AurevectorSalesPage from "../aurevector/sales-page";

export const metadata: Metadata = {
  title: "Empresia | Plataforma de gestión empresarial",
  description: "Empresia unifica CRM, ARM, automatización e inteligencia artificial. Integración ERP en desarrollo.",
  openGraph: {
    title: "Empresia | Software inteligente para empresas",
    description: "Gestiona clientes, ventas y operaciones desde una sola plataforma empresarial.",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "Empresia | Plataforma empresarial",
    description: "CRM, ARM, automatizaciones y evolución hacia ERP unificado."
  }
};

export default function EmpresiaPage() {
  return <AurevectorSalesPage />;
}

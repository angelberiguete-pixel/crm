import type { Metadata } from "next";
import AurevectorSalesPage from "./sales-page";

export const metadata: Metadata = {
  title: "AUREVECTOR | CRM + Automatización + IA para convertir más oportunidades",
  description: "Centraliza leads, seguimiento, pipeline y automatización en un mismo sistema. Genera una vista previa de AUREVECTOR para tu negocio.",
  openGraph: {
    title: "AUREVECTOR | Convierte más oportunidades con un sistema comercial conectado",
    description: "CRM + automatización + IA + growth. Describe tu negocio y prueba cómo se configuraría tu sistema antes de activarlo.",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "AUREVECTOR | CRM + Automatización + IA",
    description: "Prueba cómo se configuraría AUREVECTOR para tu negocio antes de activarlo."
  }
};

export default function AurevectorPage() {
  return <AurevectorSalesPage />;
}

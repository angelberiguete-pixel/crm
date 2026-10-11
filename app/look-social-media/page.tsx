import type { Metadata } from "next";
import AurevectorSalesPage from "../aurevector/sales-page";

export const metadata: Metadata = {
  title: "Look Social Media | CRM, automatización, IA y crecimiento",
  description: "Look Social Media conecta CRM, seguimiento, automatización, IA e integraciones para convertir más oportunidades y operar con control.",
  openGraph: {
    title: "Look Social Media | CRM y crecimiento conectado",
    description: "Centraliza leads, seguimiento, automatización, IA e integraciones empresariales en una sola plataforma.",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "Look Social Media | CRM + Automatización + IA",
    description: "Un sistema comercial conectado para captar, dar seguimiento y convertir."
  }
};

export default function LookSocialMediaPage() {
  return <AurevectorSalesPage />;
}

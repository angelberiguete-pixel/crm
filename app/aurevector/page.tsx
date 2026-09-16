import type { Metadata } from "next";
import AurevectorSalesPage from "./sales-page";

export const metadata: Metadata = {
  title: "AUREVECTOR | CRM + Growth + Automatización",
  description: "CRM, seguimiento, automatización y servicios de crecimiento en un solo sistema para convertir más oportunidades."
};

export default function AurevectorPage() {
  return <AurevectorSalesPage />;
}

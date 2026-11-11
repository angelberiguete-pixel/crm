import type { Metadata } from "next";
import FinanceWorkbench from "../finanzas/finance-workbench";

export const metadata: Metadata = {
  title: "Empresia Capital | Preparación de proyectos",
  description: "Prepara documentación para posibles proyectos de financiamiento, sin captación de fondos.",
};

export default function Page() {
  return <FinanceWorkbench section="capital" />;
}

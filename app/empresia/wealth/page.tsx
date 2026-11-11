import type { Metadata } from "next";
import FinanceWorkbench from "../finanzas/finance-workbench";

export const metadata: Metadata = {
  title: "Empresia Wealth | Planificador financiero",
  description: "Calcula tu presupuesto, capacidad de ahorro y metas financieras con Empresia Wealth.",
};

export default function Page() {
  return <FinanceWorkbench section="wealth" />;
}

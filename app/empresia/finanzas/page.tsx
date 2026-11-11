import type { Metadata } from "next";
import FinanceWorkbench from "../finanzas/finance-workbench";

export const metadata: Metadata = {
  title: "Empresia Finanzas | Wealth, Invest y Capital",
  description: "Herramientas web de presupuesto, simulación educativa de inversión y preparación de proyectos empresariales.",
};

export default function Page() {
  return <FinanceWorkbench section="wealth" />;
}

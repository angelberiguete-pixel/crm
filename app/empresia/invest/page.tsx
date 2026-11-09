import type { Metadata } from "next";
import FinanceWorkbench from "../finanzas/finance-workbench";

export const metadata: Metadata = {
  title: "Empresia Invest | Simulador educativo",
  description: "Explora escenarios hipotéticos de inversión, aportaciones mensuales y riesgos.",
};

export default function Page() {
  return <FinanceWorkbench section="invest" />;
}

import type { Metadata } from "next";
import "./globals.css";
import IntegrationsTelemetry from "../components/IntegrationsTelemetry";

export const metadata: Metadata = {
  title: {
    default: "Empresia",
    template: "%s | Empresia"
  },
  description: "Empresia: plataforma empresarial con CRM, ARM, automatizaciones e integración progresiva de ERP para gestionar clientes y operaciones.",
  icons: { icon: [{ url: "/empresia-icon.svg", type: "image/svg+xml" }] }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body><IntegrationsTelemetry />{children}</body></html>;
}

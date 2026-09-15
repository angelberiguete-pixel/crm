import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AUREVECTOR | CRM",
  description: "Tu espacio para gestionar relaciones, oportunidades y seguimiento comercial."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}

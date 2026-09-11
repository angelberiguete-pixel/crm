import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Revenue Command Center — RD$1M",
  description: "CRM ejecutivo para gestionar el crecimiento hacia RD$1,000,000 de MRR."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Look Social Media CRM",
    template: "%s | Look Social Media"
  },
  description: "CRM multi-tenant de Look Social Media para ventas, seguimiento, automatización, operaciones e integraciones empresariales."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}

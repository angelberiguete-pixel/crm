import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Look Social Media CRM",
    template: "%s | Look Social Media"
  },
  description: "CRM multiempresa LOOK SOCIAL MEDIA: ventas, seguimiento, automatización y atención al cliente.",
  icons: { icon: [{ url: "/look-social-media-logo.svg", type: "image/svg+xml" }] }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}

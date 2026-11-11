import type { ReactNode } from "react";
import "./style.css";
export const metadata = { title: "Inmobiliaria | Demo", description: "Plataforma inmobiliaria en desarrollo con datos ficticios" };
export default function Layout({children}:{children:ReactNode}) {return <html lang="es"><body>{children}</body></html>}
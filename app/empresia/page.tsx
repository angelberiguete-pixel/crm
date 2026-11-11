import type { Metadata } from "next";
import AurevectorSalesPage from "../aurevector/sales-page";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Empresia | Plataforma de gestión empresarial",
  description: "Empresia unifica CRM, ARM, automatización e inteligencia artificial. Integración ERP en desarrollo.",
  openGraph: {
    title: "Empresia | Software inteligente para empresas",
    description: "Gestiona clientes, ventas y operaciones desde una sola plataforma empresarial.",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "Empresia | Plataforma empresarial",
    description: "CRM, ARM, automatizaciones y evolución hacia ERP unificado."
  }
};

export default function EmpresiaPage() {
  return <>
    <AurevectorSalesPage />
    <section aria-labelledby="empresia-finanzas-heading" style={{maxWidth:1100, margin:"48px auto", padding:"28px", borderRadius:18, border:"1px solid var(--border)", background:"var(--panel)", color:"var(--text)"}}>
      <p style={{fontSize:12,fontWeight:800,color:"var(--accent)",letterSpacing:".08em"}}>NUEVAS HERRAMIENTAS WEB · EDUCACIÓN FINANCIERA</p>
      <h2 id="empresia-finanzas-heading" style={{fontSize:28,margin:"10px 0"}}>Empresia Finanzas</h2>
      <p style={{color:"var(--muted)",lineHeight:1.6}}>Conoce Empresia Wealth, Invest y Capital: herramientas de planificación, simulación y preparación de proyectos. Sin depósitos ni operaciones de inversión reales.</p>
      <Link href="/empresia/finanzas" className="button primary" style={{marginTop:12}}>Explorar herramientas financieras</Link>
    </section>
  </>;
}

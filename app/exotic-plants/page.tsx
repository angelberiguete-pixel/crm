import Link from "next/link";

const services = [
  { title: "Solicitud de cotización", detail: "Acceso al formulario original mientras se prepara la migración.", href: "https://exoticplantsrd.lat/quotation", action: "Solicitar cotización" },
  { title: "Portal de clientes", detail: "Acceso al portal existente. La autenticación se migrará tras auditar Manus.", href: "https://exoticplantsrd.lat/cliente-portal", action: "Ir al portal" },
  { title: "Administración", detail: "Acceso reservado al propietario en el sistema actual.", href: "https://exoticplantsrd.lat/admin-login", action: "Acceso administrativo" },
];

export default function ExoticPlantsPreviewPage() {
  return (
    <main style={{ minHeight: "100vh", background: "#f5f8f3", color: "#183a2b", fontFamily: "Arial, sans-serif" }}>
      <div style={{ maxWidth: 1100, margin: "auto", padding: "28px 24px 72px" }}>
        <header style={{ display: "flex", justifyContent: "space-between", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
          <strong style={{ fontSize: 23 }}>Exotic Plants RD</strong>
          <span style={{ fontSize: 13, background: "#e2eadf", padding: "9px 14px", borderRadius: 20 }}>Vista de modernización · No sustituye el sitio actual</span>
        </header>
        <section style={{ padding: "95px 0 70px", maxWidth: 780 }}>
          <p style={{ textTransform: "uppercase", letterSpacing: 3, color: "#577d56", fontSize: 13 }}>Naturaleza · Servicio · Tecnología</p>
          <h1 style={{ fontSize: "clamp(38px, 6vw, 72px)", lineHeight: 1.06, margin: "20px 0" }}>Una experiencia más sencilla para cada solicitud.</h1>
          <p style={{ fontSize: 19, lineHeight: 1.65, color: "#4d6255" }}>Estamos preparando una nueva experiencia digital para Exotic Plants RD, conectando cotizaciones, clientes y seguimiento comercial.</p>
          <a href="https://exoticplantsrd.lat/quotation" style={{ display: "inline-block", marginTop: 20, padding: "16px 24px", background: "#235b3c", color: "white", borderRadius: 10, textDecoration: "none", fontWeight: 700 }}>Solicitar una cotización ↗</a>
        </section>
        <section aria-label="Accesos del sistema" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 18 }}>
          {services.map((service) => (
            <article key={service.title} style={{ background: "white", border: "1px solid #dce6da", padding: 28, borderRadius: 18 }}>
              <h2 style={{ fontSize: 22 }}>{service.title}</h2>
              <p style={{ color: "#526b59", lineHeight: 1.6, minHeight: 72 }}>{service.detail}</p>
              <a href={service.href} style={{ color: "#235b3c", fontWeight: 700 }}>{service.action} ↗</a>
            </article>
          ))}
        </section>
        <footer style={{ marginTop: 75, fontSize: 13, color: "#617465" }}>Vista de trabajo. Los enlaces llevan al sistema original; esta página no almacena formularios ni solicita credenciales.</footer>
      </div>
    </main>
  );
}

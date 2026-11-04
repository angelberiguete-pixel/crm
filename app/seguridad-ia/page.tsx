import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Seguridad e IA — Entorno de pruebas" };

const checks = [
  { name: "Política de capacidades por empresa", status: "Código disponible", detail: "La política existe en la rama de desarrollo; aún no está conectada a todas las API." },
  { name: "Pruebas de autenticación", status: "Pendiente de validar", detail: "Las pruebas de navegador utilizan respuestas simuladas; no certifican una sesión real." },
  { name: "Aislamiento RLS", status: "Pendiente de ejecutar", detail: "Existe una suite SQL, pero no se ha confirmado su ejecución en PostgreSQL de pruebas." },
  { name: "Análisis de dependencias y secretos", status: "Pendiente de ejecutar", detail: "Todavía no hay resultados de un escaneo defensivo verificable." },
  { name: "Agent Browser", status: "Desactivado", detail: "No se ejecuta ni recibe credenciales o acceso a datos." },
  { name: "Cybersecurity Skills", status: "Instrucciones incorporadas", detail: "Dos guías incorporadas al repositorio, sin herramientas ejecutables activadas." }
];

export default function SecurityAiPreview() {
  return <main style={{ maxWidth: 940, margin: "0 auto", padding: "40px 20px", fontFamily: "system-ui, sans-serif", color: "#18233b" }}>
    <p style={{ color: "#a32030", fontWeight: 700 }}>CRM GENERAL · VISTA DE DESARROLLO</p>
    <h1 style={{ fontSize: "2rem" }}>Seguridad e IA</h1>
    <p>Estado técnico de las verificaciones. Esta pantalla no ejecuta auditorías ni muestra datos de clientes.</p>
    <div style={{ padding: 16, border: "1px solid #e5c8c8", borderRadius: 12, background: "#fff8f8", marginBottom: 24 }}>
      <strong>Sin aprobación para producción</strong>
      <p>Los controles de autenticación, RLS y análisis defensivo aún deben superar pruebas reales. Family Power no ha sido modificado.</p>
    </div>
    <section aria-label="Estado de los controles" style={{ display: "grid", gap: 14 }}>
      {checks.map(check => <article key={check.name} style={{ padding: 18, border: "1px solid #dce1e8", borderRadius: 12 }}>
        <h2 style={{ margin: "0 0 6px", fontSize: "1.1rem" }}>{check.name}</h2>
        <strong style={{ color: "#a32030" }}>{check.status}</strong>
        <p style={{ marginBottom: 0 }}>{check.detail}</p>
      </article>)}
    </section>
    <p style={{ marginTop: 24 }}><Link href="/look-social-media">Volver al CRM</Link></p>
  </main>;
}

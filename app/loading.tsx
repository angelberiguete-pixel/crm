import BrandLogo from "@/components/brand-logo";

/** Next.js route-level fallback while a portal screen loads. */
export default function Loading(){
  return <main className="look-route-loading" role="status" aria-live="polite">
    <BrandLogo size="loading"/>
    <span>Cargando tu espacio de trabajo…</span>
  </main>;
}

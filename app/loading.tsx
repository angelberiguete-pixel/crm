import RouteLoadingBrand from "@/components/route-loading-brand";

/** Next.js route-level fallback while a portal screen loads. */
export default function Loading(){
  return <main className="look-route-loading" role="status" aria-live="polite">
    <RouteLoadingBrand size="loading"/>
    <span>Cargando tu espacio de trabajo…</span>
  </main>;
}

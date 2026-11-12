import { notFound } from "next/navigation";
import QAMobileControlCenter from "@/components/qa-mobile-control-center";

export const dynamic = "force-dynamic";

/**
 * Fuera de producción de forma incondicional.
 * Para desarrollo/preview: activar explícitamente EMPRESIA_QA_CENTER_ENABLED=true.
 * No importamos el cliente Supabase de producción ni permitimos acciones remotas.
 */
export default function QAMobilePage() {
  if (process.env.VERCEL_ENV === "production" ||
      process.env.EMPRESIA_QA_CENTER_ENABLED !== "true") notFound();
  return <QAMobileControlCenter />;
}

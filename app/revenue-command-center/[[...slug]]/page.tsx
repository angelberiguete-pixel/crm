import Cita24CommandCenter from "@/components/cita24-command-center";

export default async function RevenuePage({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug = [] } = await params;
  return <Cita24CommandCenter slug={slug} />;
}

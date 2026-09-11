import RevenueCommandCenter from "@/components/revenue-command-center-v2";

export default async function RevenuePage({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug = [] } = await params;
  return <RevenueCommandCenter slug={slug} />;
}

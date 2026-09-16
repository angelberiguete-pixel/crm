import SalesHub from "@/components/sales-hub";

export default async function SalesPage({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug = [] } = await params;
  return <SalesHub slug={slug} />;
}
